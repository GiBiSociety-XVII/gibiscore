import 'server-only';
import {NextResponse, type NextRequest} from 'next/server';
import {isAuthorizedCron} from '@/lib/cron';
import {ApiFootballError, lastRateLimit} from '@/lib/api-football/client';
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
                quota: lastRateLimit,
                counters: run.counters,
                warnings: run.warnings,
            });
        } catch (error) {
            const err = error as Error & {status?: number; path?: string; kind?: string; details?: unknown};
            console.error('[cron] job failed', err);
            const status = error instanceof ApiFootballError ? 502 : 500;
            return NextResponse.json(
                {
                    ok: false,
                    error: err.message,
                    kind: err.name,
                    api_football: error instanceof ApiFootballError ? {status: err.status, path: err.path, kind: err.kind} : undefined,
                    quota: lastRateLimit,
                    details: err.details ?? undefined,
                    at: err.stack?.split('\n').slice(1, 4).map((l) => l.trim()),
                    ms: Date.now() - startedAt,
                },
                {status},
            );
        }
    };
}
