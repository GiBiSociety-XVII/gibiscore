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

/** A match that has just ended stays in the live answer this long, so the page that shows it can settle it. */
const JUST_ENDED_MS = 15 * 60_000;

/** ISO bounds that surely contain the whole Rome day, widened by two hours (as the scores page does). */
function bounds(day: string): {from: string; to: string} {
    const start = new Date(`${day}T00:00:00+02:00`);
    return {from: new Date(start.getTime() - 2 * 3_600_000).toISOString(), to: new Date(start.getTime() + 26 * 3_600_000).toISOString()};
}

const toLive = (r: Row): LiveFixture => ({id: r.id, state: r.state, minute: r.minute, extraMinute: r.extra_minute, syncedAt: r.last_synced_at, homeScore: r.home_score, awayScore: r.away_score});

async function load(mode: 'live' | 'day', date: string | null): Promise<ScoreUpdates> {
    const db = footballDb();
    let rows: Row[];
    if (mode === 'live') {
        // In play, and what went off in the last quarter of an hour: a row that ends must be told it ended.
        const ended = new Date(Date.now() - JUST_ENDED_MS).toISOString();
        const {data, error} = await db
            .from('fixtures')
            .select(SELECT)
            .or(`state.in.(${[...LIVE_STATES].join(',')}),and(last_synced_at.gte.${ended},state.in.(finished,postponed,cancelled,abandoned))`)
            .order('id')
            .limit(1000);
        if (error) throw error;
        rows = (data ?? []) as Row[];
    } else {
        const {from, to} = bounds(date!);
        rows = (await fetchAll((a, b) => db.from('fixtures').select(SELECT).gte('starting_at', from).lte('starting_at', to).order('id').range(a, b), {max: 6000})) as unknown as Row[];
    }
    return {at: new Date().toISOString(), mode, date, fixtures: rows.map(toLive)};
}

/** However many tabs are open, the day is read once every few seconds. */
const read = shared(3_000, load);

/**
 * The state, minute and score of the matches of a day
 * (`?date=YYYY-MM-DD`, today by default) or of the matches in play
 * (`?mode=live`). The scores pages ask for it every few seconds and lay
 * it over the rows the server rendered, so a score moves without the
 * page being fetched again (components/football/use-live.ts).
 */
export async function GET(request: NextRequest) {
    const params = request.nextUrl.searchParams;
    const mode = params.get('mode') === 'live' ? 'live' : 'day';
    const date = mode === 'day' ? (isIsoDay(params.get('date')) ? params.get('date') : romeDate(new Date())) : null;
    try {
        const updates = await read(mode, date);
        return NextResponse.json(updates, {headers: {'Cache-Control': 'public, max-age=0, s-maxage=3, stale-while-revalidate=5'}});
    } catch (error) {
        console.error('[api/scores]', error);
        return NextResponse.json({error: 'unavailable'}, {status: 503, headers: {'Cache-Control': 'no-store'}});
    }
}
