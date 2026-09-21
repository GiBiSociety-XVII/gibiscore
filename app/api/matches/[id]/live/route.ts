import {NextResponse, type NextRequest} from 'next/server';
import {shared} from '@/lib/football/data/hot';
import {getMatchLive} from '@/lib/football/data/matches';

export const dynamic = 'force-dynamic';

/** However many tabs are open on a match, its row is read once every couple of seconds. */
const read = shared(2_000, getMatchLive);

/**
 * The state, minute, score and events of one match. The match page asks
 * for it every few seconds and lays it over what it is showing, so the
 * scoreboard and the timeline move without the page — lineups,
 * statistics, ratings and all — being fetched again
 * (components/football/match-live.tsx).
 */
export async function GET(_request: NextRequest, {params}: RouteContext<"/api/matches/[id]/live">) {
    const {id} = await params;
    const numeric = Number(id);
    if (!Number.isInteger(numeric) || numeric <= 0) return NextResponse.json({error: 'bad id'}, {status: 400, headers: {'Cache-Control': 'no-store'}});
    try {
        const live = await read(numeric);
        if (!live) return NextResponse.json({error: 'not found'}, {status: 404, headers: {'Cache-Control': 'no-store'}});
        return NextResponse.json(live, {headers: {'Cache-Control': 'public, max-age=0, s-maxage=3, stale-while-revalidate=5'}});
    } catch (error) {
        console.error('[api/matches/live]', error);
        return NextResponse.json({error: 'unavailable'}, {status: 503, headers: {'Cache-Control': 'no-store'}});
    }
}
