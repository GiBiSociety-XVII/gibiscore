import {revalidateTag} from 'next/cache';
import type {NextRequest} from 'next/server';
import {cronRoute} from '@/lib/football/sync/run-job';
import {syncInjuries} from '@/lib/football/sync/injuries';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/** Every 30 minutes: injuries and suspensions for every featured season (~13 requests). */
export async function GET(request: NextRequest) {
    return cronRoute(async () => {
        const run = await syncInjuries();
        // The fantasy matchday reads the absences: fresh on the next request.
        if ((run.counters.sidelined ?? 0) > 0) revalidateTag('fantasy-matchday', 'max');
        return run;
    })(request);
}
