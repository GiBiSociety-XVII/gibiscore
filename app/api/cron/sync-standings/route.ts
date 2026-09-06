import type {NextRequest} from 'next/server';
import {cronRoute} from '@/lib/football/sync/run-job';
import {syncStandings} from '@/lib/football/sync/standings';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/**
 * Hourly: featured seasons with a result since their table was stored
 * (~13 requests on a matchday, 0 otherwise). With `?scope=all` (daily
 * cron): every other competition with a result in the last 24 hours, up
 * to 300 requests.
 */
export async function GET(request: NextRequest) {
    const scope = request.nextUrl.searchParams.get('scope') === 'all' ? 'all' : 'featured';
    return cronRoute(() => syncStandings(scope))(request);
}
