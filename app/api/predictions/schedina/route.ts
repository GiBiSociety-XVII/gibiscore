import {NextResponse, type NextRequest} from 'next/server';
import {createClient} from '@/lib/db/server';
import type {Schedina} from '@/lib/football/schedina';

export const dynamic = 'force-dynamic';

/**
 * Saves a slip the predictions page generated in the signed-in user's
 * account (table schedine, RLS): what was picked, at what chance and
 * odds, when it starts and ends. The advice job settles it once every
 * match is over. Only the selections' ids, tiers and legs are kept:
 * the outcome is read from the matches, never from the client.
 */
export async function POST(request: NextRequest) {
    let body: Partial<Schedina>;
    try {
        body = (await request.json()) as Partial<Schedina>;
    } catch {
        return NextResponse.json({error: 'bad json'}, {status: 400});
    }
    const kind = body.kind === 'single' || body.kind === 'multiple' || body.kind === 'system' ? body.kind : null;
    const risk = body.risk === 'low' || body.risk === 'medium' || body.risk === 'high' ? body.risk : null;
    const selections = Array.isArray(body.selections) ? body.selections.slice(0, 10) : [];
    if (!kind || !risk || selections.length === 0 || selections.some((s) => !Number.isInteger(s.fixtureId) || !s.slip || !Array.isArray(s.slip.legs))) return NextResponse.json({error: 'bad slip'}, {status: 400});
    const db = await createClient();
    const {data: auth} = await db.auth.getUser();
    if (!auth.user) return NextResponse.json({error: 'signed out'}, {status: 401});
    const kickoffs = selections.map((s) => String(s.startingAt)).sort();
    const row = {
        user_id: auth.user.id,
        kind,
        risk,
        size: selections.length,
        system_of: kind === 'system' && body.system ? Math.max(1, Math.min(selections.length, Math.round(body.system.of))) : null,
        selections: selections.map((s) => ({fixtureId: s.fixtureId, home: String(s.home ?? ''), away: String(s.away ?? ''), competition: String(s.competition ?? ''), startingAt: String(s.startingAt), tier: s.tier, legs: s.slip.legs.map((l) => ({key: l.key, pct: Number(l.pct) || 0})), pct: Number(s.slip.pct) || 0})),
        pct: Math.max(0, Math.min(100, Math.round(Number(body.pct) || 0))),
        fair: Math.round((Number(body.fair) || 0) * 100) / 100,
        book: body.book === null || body.book === undefined ? null : Math.round(Number(body.book) * 100) / 100,
        first_kickoff: kickoffs[0],
        last_kickoff: kickoffs[kickoffs.length - 1],
    };
    const {data, error} = await db.from('schedine').insert(row).select('id').single();
    if (error) return NextResponse.json({error: error.message}, {status: 500});
    return NextResponse.json({id: data.id});
}
