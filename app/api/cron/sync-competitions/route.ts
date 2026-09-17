import type {NextRequest} from 'next/server';
import {cronRoute} from '@/lib/football/sync/run-job';
import {syncCompetitions} from '@/lib/football/sync/competitions';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/**
 * Daily: leagues, current and past seasons, and the teams of the current
 * seasons a week old, featured first, 200 a run (~1 + 200 requests). Run
 * it first on a fresh database; squads are `sync-squads`.
 */
export async function GET(request: NextRequest) {
    return cronRoute(() => syncCompetitions())(request);
}
