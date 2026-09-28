import {NextResponse, type NextRequest} from 'next/server';
import {footballDb} from '@/lib/football/data/shared';
import {shared} from '@/lib/football/data/hot';
import {isIsoDay, romeDate} from '@/lib/football/data/scores';
import type {LiveFixture} from '@/lib/football/live';
import {LIVE_STATES} from '@/lib/football/types';
import {fetchAll} from '@/lib/db/paginate';

export const dynamic = 'force-dynamic';

export interface ScoreUpdates {
    at: string;
    mode: 'live' | 'day';
    date: string | null;
    fixtures: LiveFixture[];
}

interface Row {
    id: number;
    state: string;
    minute: number | null;
    extra_minute: number | null;
    last_synced_at: string | null;
    home_score: number | null;
    away_score: number | null;
}

const SELECT = 'id,state,minute,extra_minute,last_synced_at,home_score,away_score';

/**
 * How far back an answer reaches: every row in play, plus every row the
 * sync wrote in the last ten minutes (a match that just ended, one that
 * just kicked off, a postponement). A page that asks at least that
 * often misses nothing; one that was away longer renders itself again
 * instead (components/football/use-live.ts). A day has up to fifteen
 * hundred matches: answering with all of them, every few seconds, to
 * every open tab, was most of what the site sent out.
 */
const MOVED_MS = 10 * 60_000;

/** ISO bounds that surely contain the whole Rome day, widened by two hours (as the scores page does). */
function bounds(day: string): {from: string; to: string} {
    const start = new Date(`${day}T00:00:00+02:00`);
    return {from: new Date(start.getTime() - 2 * 3_600_000).toISOString(), to: new Date(start.getTime() + 26 * 3_600_000).toISOString()};
}

const toLive = (r: Row): LiveFixture => ({id: r.id, state: r.state, minute: r.minute, extraMinute: r.extra_minute, syncedAt: r.last_synced_at, homeScore: r.home_score, awayScore: r.away_score});

async function load(mode: 'live' | 'day', date: string | null): Promise<ScoreUpdates> {
    const db = footballDb();
    let rows: Row[];
    const moved = `state.in.(${[...LIVE_STATES].join(',')}),last_synced_at.gte.${new Date(Date.now() - MOVED_MS).toISOString()}`;
    if (mode === 'live') {
        const {data, error} = await db.from('fixtures').select(SELECT).or(moved).order('id').limit(1000);
        if (error) throw error;
        rows = (data ?? []) as Row[];
    } else {
        const {from, to} = bounds(date!);
        rows = (await fetchAll((a, b) => db.from('fixtures').select(SELECT).gte('starting_at', from).lte('starting_at', to).or(moved).order('id').range(a, b), {max: 2000})) as unknown as Row[];
    }
    return {at: new Date().toISOString(), mode, date, fixtures: rows.map(toLive)};
}

/** However many tabs are open, the day is read once every few seconds. */
const read = shared(3_000, load);

/**
 * The state, minute and score of what moved among the matches of a day
 * (`?date=YYYY-MM-DD`, today by default) or of the matches in play
 * (`?mode=live`): in play, or written by the sync in the last ten
 * minutes. The scores pages ask for it every few seconds and lay it
 * over the rows the server rendered, so a score moves without the page
 * being fetched again (components/football/use-live.ts).
 */
export async function GET(request: NextRequest) {
    const params = request.nextUrl.searchParams;
    const mode = params.get('mode') === 'live' ? 'live' : 'day';
    const date = mode === 'day' ? (isIsoDay(params.get('date')) ? params.get('date') : romeDate(new Date())) : null;
    try {
        const updates = await read(mode, date);
        return NextResponse.json(updates, {headers: {'Cache-Control': 'public, max-age=0, s-maxage=5, stale-while-revalidate=5'}});
    } catch (error) {
        console.error('[api/scores]', error);
        return NextResponse.json({error: 'unavailable'}, {status: 503, headers: {'Cache-Control': 'no-store'}});
    }
}
