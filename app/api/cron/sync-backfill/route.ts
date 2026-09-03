import type {NextRequest} from 'next/server';
import {cronRoute} from '@/lib/football/sync/run-job';
import {syncBackfill} from '@/lib/football/sync/backfill';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/**
 * Hourly: detail of finished featured fixtures never fetched in full.
 * `?limit=2000` to process more per run (20 fixtures per API request).
 */
export async function GET(request: NextRequest) {
    const limit = Math.min(Number(request.nextUrl.searchParams.get('limit')) || 400, 2000);
    return cronRoute(() => syncBackfill(limit))(request);
}
