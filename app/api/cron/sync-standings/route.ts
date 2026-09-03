import {cronRoute} from '@/lib/football/sync/run-job';
import {syncStandings} from '@/lib/football/sync/standings';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/** Every 30 minutes: league tables for every current season. */
export const GET = cronRoute(() => syncStandings());
