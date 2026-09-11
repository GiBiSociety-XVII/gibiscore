import {revalidateTag} from 'next/cache';
import type {NextRequest} from 'next/server';
import {cronRoute} from '@/lib/football/sync/run-job';
import {syncUpcomingLineups} from '@/lib/football/sync/lineups';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

/**
 * Every ten minutes: the official lineups of featured fixtures kicking
 * off within the next 75 minutes, when the provider has them. No
 * request when no kick-off is near. `?within=120` widens the window.
 */
export async function GET(request: NextRequest) {
    const within = Number(request.nextUrl.searchParams.get('within')) || undefined;
    return cronRoute(async () => {
        const run = await syncUpcomingLineups({withinMinutes: within});
        // The fantasy matchday reads them: fresh on the next request.
        if ((run.counters.lineups ?? 0) > 0) revalidateTag('fantasy-matchday', 'max');
        return run;
    })(request);
}
