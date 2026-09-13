import type {NextRequest} from 'next/server';
import {sleep} from '@/lib/api-football/client';
import {cronRoute} from '@/lib/football/sync/run-job';
import {syncLive} from '@/lib/football/sync/fixtures';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/** The second pass of a minute starts this long after the first. */
const SECOND_PASS_MS = 30_000;

/**
 * Every minute: in-play fixtures with events, statistics and lineups.
 * A cron cannot run more often, so while matches are on the job runs
 * twice per invocation, thirty seconds apart: scores move within half a
 * minute.
 */
export async function GET(request: NextRequest) {
    return cronRoute(async () => {
        const startedAt = Date.now();
        const first = await syncLive();
        if ((first.counters.inplay ?? 0) === 0) return first;
        const wait = SECOND_PASS_MS - (Date.now() - startedAt);
        if (wait > 0) await sleep(wait);
        const second = await syncLive();
        second.requests += first.requests;
        second.bump('passes', 2);
        return second;
    })(request);
}
