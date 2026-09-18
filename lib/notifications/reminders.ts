import 'server-only';
import type {FootballClient, SyncRun} from '@/lib/football/sync/context';
import {dispatchNotifications} from './dispatch';
import {reminderCandidate} from './events';

/** Matches kicking off in this many minutes are announced; the window is wider than the job's period so none slips through, the ledger keeps each to one. */
const AHEAD_MINUTES = 60;
const WINDOW_MINUTES = 12;

/**
 * "Kick-off in an hour" for the matches of the favourite competitions and
 * teams: called by the lineups job every five minutes, one query, the
 * dispatcher decides who follows what.
 */
export async function sendReminders(db: FootballClient, run: SyncRun): Promise<void> {
    const now = Date.now();
    const from = new Date(now + (AHEAD_MINUTES - WINDOW_MINUTES / 2) * 60_000).toISOString();
    const to = new Date(now + (AHEAD_MINUTES + WINDOW_MINUTES / 2) * 60_000).toISOString();
    const {data, error} = await db
        .from('fixtures')
        .select('id,starting_at,league:leagues(name),home:teams!fixtures_home_team_id_fkey(name),away:teams!fixtures_away_team_id_fkey(name)')
        .eq('state', 'scheduled')
        .gte('starting_at', from)
        .lte('starting_at', to)
        .limit(2000);
    if (error) {
        run.warn(`reminders: ${error.message}`);
        return;
    }
    const rows = (data ?? []) as unknown as Array<{id: number; starting_at: string; league: {name: string} | null; home: {name: string} | null; away: {name: string} | null}>;
    if (rows.length === 0) return;
    await dispatchNotifications(
        db,
        run,
        rows.map((r) => ({fixtureId: r.id, candidates: [reminderCandidate({home: r.home?.name ?? '?', away: r.away?.name ?? '?', league: r.league?.name ?? ''}, r.starting_at)]})),
    );
}
