import {cronRoute} from '@/lib/football/sync/run-job';
import {syncInjuries} from '@/lib/football/sync/injuries';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/** Every 6 hours: injuries and suspensions for every current season. */
export const GET = cronRoute(() => syncInjuries());
