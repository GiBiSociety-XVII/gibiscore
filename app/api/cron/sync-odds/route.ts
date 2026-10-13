import type {NextRequest} from 'next/server';
import {cronRoute} from '@/lib/football/sync/run-job';
import {syncOdds} from '@/lib/football/sync/odds';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/**
 * Every three hours: the bookmakers' odds of the featured fixtures of
 * the next three days, one request each. `?days=7` widens the window;
 * `?force=1` asks every featured fixture again, whatever the last ask
 * (after a change in what is read from the provider), and writes the
 * model's slips for them anew.
 */
export async function GET(request: NextRequest) {
    const days = Number(request.nextUrl.searchParams.get('days')) || undefined;
    const force = request.nextUrl.searchParams.get('force') === '1';
    return cronRoute(() => syncOdds({days, force}))(request);
}
