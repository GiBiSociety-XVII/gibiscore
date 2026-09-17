import {revalidateTag} from 'next/cache';
import type {NextRequest} from 'next/server';
import {cronRoute} from '@/lib/football/sync/run-job';
import {syncSquads} from '@/lib/football/sync/squads';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/**
 * Hourly: squads and transfer feed of every featured club while a
 * transfer window is open (~2 requests per club, ~520 in all, once a
 * day); outside the windows only squads a week old. Then the squads of
 * the basic clubs a week old, 300 a run. `?force=1` asks every featured
 * club now, `?limit=40` caps the clubs per run.
 */
export async function GET(request: NextRequest) {
    const limit = Number(request.nextUrl.searchParams.get('limit')) || undefined;
    const force = request.nextUrl.searchParams.get('force') === '1';
    return cronRoute(async () => {
        const run = await syncSquads({limit, force});
        // The auction list reads squads: fresh on the next request.
        revalidateTag('squads', 'max');
        revalidateTag('fantasy-pool', 'max');
        return run;
    })(request);
}
