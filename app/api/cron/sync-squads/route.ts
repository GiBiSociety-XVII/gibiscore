import {revalidateTag} from 'next/cache';
import type {NextRequest} from 'next/server';
import {cronRoute} from '@/lib/football/sync/run-job';
import {syncSquads} from '@/lib/football/sync/squads';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/**
 * Monday and Thursday: squads and transfer feed of every featured club,
 * oldest first (~2 requests per club, ~520 in all). `?limit=40` for fewer
 * clubs per run.
 */
export async function GET(request: NextRequest) {
    const limit = Number(request.nextUrl.searchParams.get('limit')) || undefined;
    return cronRoute(async () => {
        const run = await syncSquads({limit});
        // The auction list reads squads: fresh on the next request.
        revalidateTag('fantasy-pool', 'max');
        return run;
    })(request);
}
