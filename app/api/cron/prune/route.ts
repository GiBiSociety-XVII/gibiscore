import type {NextRequest} from 'next/server';
import {finishRun, footballClient, startRun} from '@/lib/football/sync/context';
import {cronRoute} from '@/lib/football/sync/run-job';
import {pruneDatabase} from '@/lib/football/sync/prune';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

/** Once a night: what the database may forget (see lib/football/sync/prune.ts). No API request. */
export async function GET(request: NextRequest) {
    return cronRoute(async () => {
        const db = footballClient();
        const run = await startRun(db, 'prune');
        try {
            await pruneDatabase(db, run);
            await finishRun(db, run, 'ok');
            return run;
        } catch (error) {
            await finishRun(db, run, 'error', (error as Error).message);
            throw error;
        }
    })(request);
}
