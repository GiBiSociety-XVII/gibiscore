import {revalidateTag} from 'next/cache';
import type {NextRequest} from 'next/server';
import {cronRoute} from '@/lib/football/sync/run-job';
import {syncMarket} from '@/lib/football/sync/squads';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

/**
 * Every 4 hours: transfer feed of the auction leagues' clubs (Serie A),
 * ~20 requests. Outside the transfer windows only the first run of the
 * day does anything; `?force=1` runs it now.
 */
export async function GET(request: NextRequest) {
    const force = request.nextUrl.searchParams.get('force') === '1';
    return cronRoute(async () => {
        const run = await syncMarket({force});
        revalidateTag('fantasy-pool', 'max');
        return run;
    })(request);
}
