import {revalidateTag} from 'next/cache';
import type {NextRequest} from 'next/server';
import {cronRoute} from '@/lib/football/sync/run-job';
import {syncSquads} from '@/lib/football/sync/squads';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/**
 * Daily: squads and transfer feed of every featured club while a transfer
 * window is open (~2 requests per club, ~520 in all); outside the windows
 * only squads a week old. `?force=1` asks everyone now, `?limit=40` caps
 * the clubs per run.
 */
export async function GET(request: NextRequest) {
    const limit = Number(request.nextUrl.searchParams.get('limit')) || undefined;
    const force = request.nextUrl.searchParams.get('force') === '1';
    return cronRoute(async () => {
        const run = await syncSquads({limit, force});
        // The auction list reads squads: fresh on the next request.
        revalidateTag('fantasy-pool', 'max');
        return run;
    })(request);
}
