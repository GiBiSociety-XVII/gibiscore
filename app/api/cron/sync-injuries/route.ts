import {cronRoute} from '@/lib/football/sync/run-job';
import {syncInjuries} from '@/lib/football/sync/injuries';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/** Every 2 hours: injuries and suspensions for every featured season (~13 requests). */
export const GET = cronRoute(() => syncInjuries());
