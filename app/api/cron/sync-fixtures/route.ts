import type {NextRequest} from 'next/server';
import {cronRoute} from '@/lib/football/sync/run-job';
import {syncFixtures} from '@/lib/football/sync/fixtures';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/**
 * Hourly: every competition, yesterday to +7 days (9 requests).
 * With `?window=month` (daily cron): yesterday to +30 days.
 */
export async function GET(request: NextRequest) {
    const month = request.nextUrl.searchParams.get('window') === 'month';
    return cronRoute(() => syncFixtures(month ? {fromDaysAgo: 1, toDaysAhead: 30} : {}))(request);
}
