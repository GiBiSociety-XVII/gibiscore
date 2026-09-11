import {revalidateTag} from 'next/cache';
import type {NextRequest} from 'next/server';
import {cronRoute} from '@/lib/football/sync/run-job';
import {syncPlayerSidelined} from '@/lib/football/sync/sidelined';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/** Every 6 hours: the per-player injury and suspension spells of the fantasy leagues' squads (~300 requests). */
export async function GET(request: NextRequest) {
    return cronRoute(async () => {
        const run = await syncPlayerSidelined();
        // The fantasy matchday reads the absences: fresh on the next request.
        revalidateTag('fantasy-matchday', 'max');
        return run;
    })(request);
}
