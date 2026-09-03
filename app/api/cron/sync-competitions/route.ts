import {cronRoute} from '@/lib/football/sync/run-job';
import {syncCompetitions} from '@/lib/football/sync/competitions';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/** Daily: leagues, current seasons, teams and squads. Run it first on a fresh database. */
export const GET = cronRoute(() => syncCompetitions());
