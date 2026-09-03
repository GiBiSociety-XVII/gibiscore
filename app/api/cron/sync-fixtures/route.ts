import {cronRoute} from '@/lib/football/sync/run-job';
import {syncFixtures} from '@/lib/football/sync/fixtures';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

/** Hourly: schedule and results window (yesterday -> +14 days). */
export const GET = cronRoute(() => syncFixtures());
