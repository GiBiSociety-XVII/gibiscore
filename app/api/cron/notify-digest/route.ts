import type {NextRequest} from 'next/server';
import {finishRun, footballClient, startRun} from '@/lib/football/sync/context';
import {cronRoute} from '@/lib/football/sync/run-job';
import {sendDigest} from '@/lib/notifications/digest';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

/** Every evening: the day's results of the teams each subscribed user follows, one notification per user. No API request. */
export async function GET(request: NextRequest) {
    return cronRoute(async () => {
        const db = footballClient();
        const run = await startRun(db, 'notify-digest');
        try {
            await sendDigest(db, run);
            await finishRun(db, run, 'ok');
            return run;
        } catch (error) {
            await finishRun(db, run, 'error', (error as Error).message);
            throw error;
        }
    })(request);
}
