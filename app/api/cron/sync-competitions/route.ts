import {revalidateTag} from 'next/cache';
import type {NextRequest} from 'next/server';
import {cronRoute} from '@/lib/football/sync/run-job';
import {syncCompetitions} from '@/lib/football/sync/competitions';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/**
 * Daily: leagues, current seasons, teams. Squads on Monday and Thursday,
 * or now with `?squads=1`. Run it first on a fresh database (with squads).
 */
export async function GET(request: NextRequest) {
    const squads = request.nextUrl.searchParams.get('squads');
    return cronRoute(async () => {
        const run = await syncCompetitions({squads: squads === '1' ? true : squads === '0' ? false : undefined});
        // The auction list reads squads and season statistics: fresh on the next request.
        revalidateTag('fantasy-pool', 'max');
        return run;
    })(request);
}
