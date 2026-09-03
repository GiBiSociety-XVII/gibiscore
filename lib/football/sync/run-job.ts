import 'server-only';
import {NextResponse, type NextRequest} from 'next/server';
import {isAuthorizedCron} from '@/lib/cron';
import {SportmonksError} from '@/lib/sportmonks/client';
import type {SyncRun} from './context';

/**
 * Wraps a sync job as a cron route handler: checks the secret, runs the job,
 * and returns a compact JSON summary that shows up in Vercel's cron logs.
 */
export function cronRoute(job: () => Promise<SyncRun>) {
    return async function GET(request: NextRequest) {
        if (!isAuthorizedCron(request)) {
            return NextResponse.json({error: 'unauthorized'}, {status: 401});
        }
        const startedAt = Date.now();
        try {
            const run = await job();
            return NextResponse.json({
                ok: true,
                job: run.job,
                run_id: run.id,
                ms: Date.now() - startedAt,
                requests: run.requests,
                counters: run.counters,
                warnings: run.warnings,
            });
        } catch (error) {
            const message = (error as Error).message;
            console.error('[cron] job failed', error);
            const status = error instanceof SportmonksError ? 502 : 500;
            return NextResponse.json({ok: false, error: message, ms: Date.now() - startedAt}, {status});
        }
    };
}
