import type {NextRequest} from 'next/server';
import {cronRoute} from '@/lib/football/sync/run-job';
import {syncFixtures} from '@/lib/football/sync/fixtures';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

/**
 * Hourly: every competition, yesterday to tomorrow (3 requests).
 * With `?window=month` (daily cron): yesterday to +30 days (32).
 */
export async function GET(request: NextRequest) {
    const month = request.nextUrl.searchParams.get('window') === 'month';
    return cronRoute(() => syncFixtures(month ? {fromDaysAgo: 1, toDaysAhead: 30} : {}))(request);
}
