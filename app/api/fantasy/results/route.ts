import {NextResponse, type NextRequest} from 'next/server';
import {isAuctionLeague, type AuctionLeague} from '@/lib/fantasy/config';
import {getMatchday} from '@/lib/fantasy/matchday-data';
import type {RoundResults} from '@/lib/fantasy/recap';

export const dynamic = 'force-dynamic';

export interface ResultsResponse {
    generatedAt: string | null;
    rounds: RoundResults[];
}

/**
 * The rounds played before the current one, for the history of the
 * recaps: read off the cached matchday and cut to the players asked
 * for (`?ids=`), so a roster costs a few kilobytes instead of the
 * whole league.
 */
export async function GET(request: NextRequest) {
    const ids = new Set([...new Set((request.nextUrl.searchParams.get('ids') ?? '').split(',').map(Number).filter((n) => Number.isInteger(n) && n > 0))].slice(0, 400));
    const leagueParam = request.nextUrl.searchParams.get('league');
    const league: AuctionLeague = isAuctionLeague(leagueParam) ? (leagueParam as AuctionLeague) : 'serie-a';
    if (ids.size === 0) return NextResponse.json({generatedAt: null, rounds: []} satisfies ResultsResponse);
    const context = await getMatchday(league);
    const rounds: RoundResults[] = (context?.history ?? []).map((r) => ({...r, stats: Object.fromEntries(Object.entries(r.stats).filter(([id]) => ids.has(Number(id))))}));
    return NextResponse.json({generatedAt: context?.generatedAt ?? null, rounds} satisfies ResultsResponse, {headers: {'Cache-Control': 'public, s-maxage=120, stale-while-revalidate=600'}});
}
