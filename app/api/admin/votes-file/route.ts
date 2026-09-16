import {NextResponse, type NextRequest} from 'next/server';
import {createClient} from '@/lib/db/server';
import {isAdminId} from '@/lib/admin';
import {roundNumber} from '@/lib/fantasy/matchday';
import {matchVoti, parseVoti} from '@/lib/fantasy/voti';
import {parseVotiWorkbook} from '@/lib/fantasy/voti-workbook';
import {getVotesBook} from '@/lib/fantasy/votes-data';
import {readWorkbook} from '@/lib/fantasy/xlsx';

export const dynamic = 'force-dynamic';

/** A vote of the workbook laid on a player of the round: what the vote book fills its fields with. */
export interface FileVote {
    id: number;
    /** null: no vote in the workbook (s.v.). */
    voto: number | null;
    goals: number;
    assists: number;
    yellow: number;
    red: number;
    conceded: number;
    penaltiesSaved: number;
    penaltiesMissed: number;
    ownGoals: number;
}

export interface VotesFileResponse {
    /** The round the workbook's title names. */
    fileRound: number | null;
    /** Rows in the workbook, and those with a vote (the players who took the pitch). */
    total: number;
    voted: number;
    matched: FileVote[];
    /** Workbook rows with a vote that met no player of the round. */
    unmatched: Array<{team: string; name: string; role: string}>;
    /** Players of the round the workbook does not vote: left to type by hand. */
    missing: Array<{id: number; name: string}>;
}

/**
 * The administrator's upload of the Fantacalcio.it "Voti" workbook for a
 * round: read, checked against the round chosen (the title names it),
 * matched to the players who took the pitch by club and surname, and
 * handed back for the vote book to fill and save. Nothing is written here.
 */
export async function POST(request: NextRequest) {
    const db = await createClient();
    const {data: auth} = await db.auth.getUser();
    if (!auth.user) return NextResponse.json({error: 'signed out'}, {status: 401});
    if (!isAdminId(auth.user.id)) return NextResponse.json({error: 'admin only'}, {status: 403});

    let form: FormData;
    try {
        form = await request.formData();
    } catch {
        return NextResponse.json({error: 'bad form'}, {status: 400});
    }
    const file = form.get('file');
    const round = form.get('round');
    if (!(file instanceof File) || typeof round !== 'string' || round === '') return NextResponse.json({error: 'file and round needed'}, {status: 400});
    if (file.size > 5_000_000) return NextResponse.json({error: 'too big'}, {status: 413});

    let workbook: ReturnType<typeof parseVotiWorkbook>;
    try {
        const wb = readWorkbook(Buffer.from(await file.arrayBuffer()));
        workbook = parseVotiWorkbook(wb.sheets.map((s) => ({name: s.name, rows: wb.rows(s)})));
    } catch {
        return NextResponse.json({error: 'not a workbook'}, {status: 422});
    }
    if (workbook.rows.length === 0) return NextResponse.json({error: 'no votes'}, {status: 422});

    const book = await getVotesBook('serie-a');
    const target = book?.rounds.find((r) => r.round === round);
    if (!book || !target) return NextResponse.json({error: 'unknown round'}, {status: 404});
    // The title names the round: a file of another one is refused, so round 4 never lands on round 3.
    const selected = target.number ?? roundNumber(round);
    if (workbook.round !== null && selected !== null && workbook.round !== selected) {
        return NextResponse.json({error: 'round mismatch', fileRound: workbook.round, selectedRound: selected}, {status: 409});
    }

    const teamName = new Map(book.teams.map((t) => [t.id, t.name]));
    const entries = parseVoti(workbook.rows);
    const {byPlayer} = matchVoti(entries, target.players.map((p) => ({id: p.id, name: p.name, team: teamName.get(p.teamId) ?? ''})));
    const matched: FileVote[] = [];
    for (const [id, e] of byPlayer) {
        matched.push({id, voto: e.voto, goals: e.goals, assists: e.assists, yellow: e.yellow, red: e.red, conceded: e.conceded, penaltiesSaved: e.penaltiesSaved, penaltiesMissed: e.penaltiesMissed, ownGoals: e.ownGoals});
    }
    const matchedEntries = new Set([...byPlayer.values()]);
    const unmatched = entries.filter((e) => e.voto !== null && !matchedEntries.has(e)).map((e) => ({team: e.team, name: e.name, role: e.role}));
    const missing = target.players.filter((p) => !byPlayer.has(p.id)).map((p) => ({id: p.id, name: p.name}));
    const body: VotesFileResponse = {fileRound: workbook.round, total: entries.length, voted: entries.filter((e) => e.voto !== null).length, matched, unmatched, missing};
    return NextResponse.json(body);
}
