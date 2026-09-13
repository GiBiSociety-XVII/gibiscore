import {unstable_cache} from 'next/cache';
import {NextResponse, type NextRequest} from 'next/server';
import {footballDb} from '@/lib/football/data/shared';
import {isIsoDay, romeDate} from '@/lib/football/data/scores';
import {LIVE_STATES} from '@/lib/football/types';
import {fetchAll} from '@/lib/db/paginate';

export const dynamic = 'force-dynamic';

/** What moves on a scores row while the page is open. */
export interface ScoreUpdate {
    id: number;
    state: string;
    minute: number | null;
    extraMinute: number | null;
    syncedAt: string | null;
    homeScore: number | null;
    awayScore: number | null;
    startingAt: string;
}

export interface ScoreUpdates {
    at: string;
    mode: 'live' | 'day';
    date: string | null;
    fixtures: ScoreUpdate[];
}

interface Row {
    id: number;
    state: string;
    minute: number | null;
    extra_minute: number | null;
    last_synced_at: string | null;
    home_score: number | null;
    away_score: number | null;
    starting_at: string;
}

const SELECT = 'id,state,minute,extra_minute,last_synced_at,home_score,away_score,starting_at';

/** ISO bounds that surely contain the whole Rome day, widened by two hours (as the scores page does). */
function bounds(day: string): {from: string; to: string} {
    const start = new Date(`${day}T00:00:00+02:00`);
    return {from: new Date(start.getTime() - 2 * 3_600_000).toISOString(), to: new Date(start.getTime() + 26 * 3_600_000).toISOString()};
}

async function load(mode: 'live' | 'day', date: string | null): Promise<ScoreUpdates> {
    const db = footballDb();
    let rows: Row[];
    if (mode === 'live') {
        const {data, error} = await db.from('fixtures').select(SELECT).in('state', [...LIVE_STATES]).order('id').limit(1000);
        if (error) throw error;
        rows = (data ?? []) as Row[];
    } else {
        const {from, to} = bounds(date!);
        rows = (await fetchAll((a, b) => db.from('fixtures').select(SELECT).gte('starting_at', from).lte('starting_at', to).order('id').range(a, b), {max: 6000})) as unknown as Row[];
    }
    return {
        at: new Date().toISOString(),
        mode,
        date,
        fixtures: rows.map((r) => ({id: r.id, state: r.state, minute: r.minute, extraMinute: r.extra_minute, syncedAt: r.last_synced_at, homeScore: r.home_score, awayScore: r.away_score, startingAt: r.starting_at})),
    };
}

// One database read every ten seconds per day, whatever the number of open tabs.
const cached = unstable_cache(load, ['score-updates'], {revalidate: 10});

/**
 * The live state of the matches of a day (`?date=YYYY-MM-DD`, today by
 * default) or of the matches in play (`?mode=live`): state, minute,
 * score. Polled by the scores page to move its rows without reloading.
 */
export async function GET(request: NextRequest) {
    const params = request.nextUrl.searchParams;
    const mode = params.get('mode') === 'live' ? 'live' : 'day';
    const date = mode === 'day' ? (isIsoDay(params.get('date')) ? params.get('date') : romeDate(new Date())) : null;
    try {
        const updates = await cached(mode, date);
        return NextResponse.json(updates, {headers: {'Cache-Control': 'public, max-age=0, s-maxage=10, stale-while-revalidate=20'}});
    } catch (error) {
        console.error('[api/scores]', error);
        return NextResponse.json({error: 'unavailable'}, {status: 503, headers: {'Cache-Control': 'no-store'}});
    }
}
