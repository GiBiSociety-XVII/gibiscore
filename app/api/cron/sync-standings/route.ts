import {revalidateTag} from 'next/cache';
import type {NextRequest} from 'next/server';
import {cronRoute} from '@/lib/football/sync/run-job';
import {syncStandings} from '@/lib/football/sync/standings';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/**
 * Hourly: every season with a result since its table was stored, the
 * featured ones first (~13 requests on a matchday, 0 otherwise), then the
 * basic ones the provider covers, up to 300 a run. `?scope=featured`
 * limits a run to the featured seasons.
 */
export async function GET(request: NextRequest) {
    const scope = request.nextUrl.searchParams.get('scope') === 'featured' ? 'featured' : 'all';
    return cronRoute(async () => {
        const run = await syncStandings(scope);
        // Tables are cached across pages: fresh on the next request.
        revalidateTag('standings', 'max');
        return run;
    })(request);
}
