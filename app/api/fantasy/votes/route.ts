import {revalidatePath, revalidateTag} from 'next/cache';
import {NextResponse, type NextRequest} from 'next/server';
import {createClient} from '@/lib/db/server';
import {parseManualVote} from '@/lib/fantasy/recap';
import {isAdminId} from '@/lib/admin';
import {everyLocalePath} from '@/lib/auth/next';

export const dynamic = 'force-dynamic';

/**
 * Votes typed in for the players of a round, saved in the signed-in
 * user's account (table fantasy_votes, RLS): the newspaper vote and
 * the events. The matchday context is refreshed so the next load of the
 * lineup page carries them, in the recap, the players' last votes and
 * the vote scale.
 */

interface Body {
    seasonId?: unknown;
    round?: unknown;
    votes?: unknown;
    remove?: unknown;
}

export async function POST(request: NextRequest) {
    let body: Body;
    try {
        body = (await request.json()) as Body;
    } catch {
        return NextResponse.json({error: 'bad json'}, {status: 400});
    }
    const seasonId = typeof body.seasonId === 'number' && Number.isInteger(body.seasonId) ? body.seasonId : null;
    const round = typeof body.round === 'string' && body.round.length > 0 && body.round.length <= 60 ? body.round : null;
    if (seasonId === null || round === null) return NextResponse.json({error: 'bad round'}, {status: 400});
    const db = await createClient();
    const {data: auth} = await db.auth.getUser();
    if (!auth.user) return NextResponse.json({error: 'signed out'}, {status: 401});
    // The vote book is the administrator's: what is typed there tunes every estimate on the site.
    if (!isAdminId(auth.user.id)) return NextResponse.json({error: 'admin only'}, {status: 403});

    const rows: Array<Record<string, unknown>> = [];
    for (const [key, raw] of Object.entries((body.votes && typeof body.votes === 'object' ? body.votes : {}) as Record<string, unknown>).slice(0, 400)) {
        const playerId = Number(key);
        const vote = parseManualVote(raw);
        if (!Number.isInteger(playerId) || playerId <= 0 || !vote) continue;
        rows.push({user_id: auth.user.id, season_id: seasonId, round, player_id: playerId, team_id: vote.teamId, voto: vote.voto, goals: vote.goals, assists: vote.assists, yellow: vote.yellow, red: vote.red, conceded: vote.conceded, penalties_saved: vote.penaltiesSaved, penalties_missed: vote.penaltiesMissed, own_goals: vote.ownGoals});
    }
    const remove = (Array.isArray(body.remove) ? body.remove : []).filter((id): id is number => typeof id === 'number' && Number.isInteger(id) && id > 0).slice(0, 400);
    if (rows.length > 0) {
        const {error} = await db.from('fantasy_votes').upsert(rows, {onConflict: 'user_id,season_id,round,player_id'});
        if (error) return NextResponse.json({error: error.message}, {status: 500});
    }
    if (remove.length > 0) {
        const {error} = await db.from('fantasy_votes').delete().eq('season_id', seasonId).eq('round', round).in('player_id', remove);
        if (error) return NextResponse.json({error: error.message}, {status: 500});
    }
    // Read your own writes: the next request renders fresh instead of serving the stale copy while it refreshes.
    for (const tag of ['fantasy-votes', 'fantasy-matchday', 'fantasy-pool']) revalidateTag(tag, {expire: 0});
    for (const path of ['/fantacalcio/formazione', '/admin/voti', '/fantacalcio/modello'].flatMap(everyLocalePath)) revalidatePath(path);
    return NextResponse.json({saved: rows.length, removed: remove.length});
}
