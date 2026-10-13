import {NextResponse, type NextRequest} from 'next/server';
import {createClient, createServiceClient} from '@/lib/db/server';
import type {Schedina} from '@/lib/football/schedina';

export const dynamic = 'force-dynamic';

interface Line {
    k: unknown;
    n: unknown;
    columns: unknown;
    stake: unknown;
}

/** What the columns hold: numeric(8,2) for a stake, numeric(10,2) for a payout. */
export const MAX_STAKE = 999_999.99;
export const MAX_PAYOUT = 99_999_999.99;
/** A non-negative amount to the cent, capped at `max`, or null when absent or not a number. */
const money = (v: unknown, max: number): number | null => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.min(max, Math.round(v * 100) / 100) : null);
const TIERS = new Set(['safe', 'balanced', 'bold']);
const int = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.round(v)) : 0);

/**
 * Saves a slip the predictions page generated in the signed-in user's
 * account (table schedine, RLS): what was picked, at what chance and
 * odds, when it starts and ends. The advice job settles it once every
 * match is over. Only the selections' ids, tiers, legs and prices are
 * kept, and the matches are checked here: every one must exist, be
 * scheduled and not have kicked off, and the kick-offs come from the
 * database, never from the client (a slip is not placed on a match
 * already played).
 */
export async function POST(request: NextRequest) {
    let body: Partial<Schedina> & {stake?: unknown; payout?: unknown; lines?: unknown};
    try {
        body = (await request.json()) as typeof body;
    } catch {
        return NextResponse.json({error: 'bad json'}, {status: 400});
    }
    const kind = body.kind === 'single' || body.kind === 'multiple' || body.kind === 'system' ? body.kind : null;
    const risk = body.risk === 'low' || body.risk === 'medium' || body.risk === 'high' ? body.risk : null;
    const selections = Array.isArray(body.selections) ? body.selections.slice(0, 10) : [];
    if (!kind || !risk || selections.length === 0 || selections.some((s) => !Number.isInteger(s.fixtureId) || !TIERS.has(s.tier) || !s.slip || !Array.isArray(s.slip.legs) || s.slip.legs.length === 0)) return NextResponse.json({error: 'bad slip'}, {status: 400});
    if (new Set(selections.map((s) => s.fixtureId)).size !== selections.length) return NextResponse.json({error: 'bad slip'}, {status: 400});
    const db = await createClient();
    const {data: auth} = await db.auth.getUser();
    if (!auth.user) return NextResponse.json({error: 'signed out'}, {status: 401});
    // The matches as the database knows them: scheduled, not kicked off.
    const {data: fixtures, error: fixturesError} = await createServiceClient().from('fixtures').select('id,starting_at,state').in('id', selections.map((s) => s.fixtureId));
    if (fixturesError) return NextResponse.json({error: fixturesError.message}, {status: 500});
    const byId = new Map(((fixtures ?? []) as Array<{id: number; starting_at: string; state: string}>).map((f) => [f.id, f]));
    const now = Date.now();
    for (const s of selections) {
        const f = byId.get(s.fixtureId);
        if (!f || f.state !== 'scheduled' || Date.parse(f.starting_at) <= now) return NextResponse.json({error: 'match started'}, {status: 400});
    }
    const kickoffAt = (s: (typeof selections)[number]) => new Date(byId.get(s.fixtureId)!.starting_at).toISOString();
    const kickoffs = selections.map(kickoffAt).sort();
    const row = {
        user_id: auth.user.id,
        kind,
        risk,
        size: selections.length,
        system_of: kind === 'system' && body.system ? Math.max(1, Math.min(selections.length, Math.round(body.system.of))) : null,
        selections: selections.map((s) => ({fixtureId: s.fixtureId, home: String(s.home ?? '').slice(0, 80), away: String(s.away ?? '').slice(0, 80), competition: String(s.competition ?? '').slice(0, 80), startingAt: kickoffAt(s), tier: s.tier, banker: kind === 'system' && s.banker === true, legs: s.slip.legs.slice(0, 3).map((l) => ({key: String(l.key), pct: Number(l.pct) || 0})), pct: Number(s.slip.pct) || 0, odds: typeof s.slip.odds === 'number' && Number.isFinite(s.slip.odds) && s.slip.odds > 1 ? Math.round(s.slip.odds * 100) / 100 : null})),
        pct: Math.max(0, Math.min(100, Math.round(Number(body.pct) || 0))),
        fair: Math.round((Number(body.fair) || 0) * 100) / 100,
        book: body.book === null || body.book === undefined ? null : Math.round(Number(body.book) * 100) / 100,
        first_kickoff: kickoffs[0],
        last_kickoff: kickoffs[kickoffs.length - 1],
        // What was staked and what it pays, as the dialog showed them; the ticket in the account prints them.
        stake: money(body.stake, MAX_STAKE),
        payout: money(body.payout, MAX_PAYOUT),
        lines: kind === 'system' && Array.isArray(body.lines) ? body.lines.slice(0, 12).map((l) => ({k: int((l as Line).k), n: int((l as Line).n), columns: int((l as Line).columns), stake: money((l as Line).stake, MAX_STAKE) ?? 0})).filter((l) => l.k > 0 && l.n > 0 && l.columns > 0) : null,
    };
    const {data, error} = await db.from('schedine').insert(row).select('id,share_token').single();
    if (error) return NextResponse.json({error: error.message}, {status: 500});
    return NextResponse.json({id: data.id, shareToken: data.share_token});
}
