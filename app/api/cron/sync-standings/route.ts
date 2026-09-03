import type {NextRequest} from 'next/server';
import {cronRoute} from '@/lib/football/sync/run-job';
import {syncStandings} from '@/lib/football/sync/standings';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/**
 * Every 30 minutes: featured leagues. With `?scope=all` (daily cron): every
 * competition with a match in the last or next 10 days.
 */
export async function GET(request: NextRequest) {
    const scope = request.nextUrl.searchParams.get('scope') === 'all' ? 'all' : 'featured';
    return cronRoute(() => syncStandings(scope))(request);
}
