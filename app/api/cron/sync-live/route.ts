import {cronRoute} from '@/lib/football/sync/run-job';
import {syncLive} from '@/lib/football/sync/fixtures';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/** Every minute: in-play fixtures with events, statistics and lineups. */
export const GET = cronRoute(() => syncLive());
