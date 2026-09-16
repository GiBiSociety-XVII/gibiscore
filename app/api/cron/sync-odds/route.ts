import type {NextRequest} from 'next/server';
import {cronRoute} from '@/lib/football/sync/run-job';
import {syncOdds} from '@/lib/football/sync/odds';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/**
 * Every three hours: the bookmakers' odds of the featured fixtures of
 * the next three days, one request each. `?days=7` widens the window.
 */
export async function GET(request: NextRequest) {
    const days = Number(request.nextUrl.searchParams.get('days')) || undefined;
    return cronRoute(() => syncOdds({days}))(request);
}
