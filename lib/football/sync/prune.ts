import 'server-only';
import {failSync, type FootballClient, type SyncRun} from './context';

/**
 * What the database may forget: only what nothing on the site reads.
 *
 * - the provider's raw season payloads from further back than the
 *   statistics that were drawn from them (`player_season_raw` is written
 *   by the player-seasons job and read by no page).
 * - the bookkeeping that ages out by the day: job runs, the ledger of
 *   the notifications already sent, the site's error log.
 *
 * The detail of old matches (events, players' lines, team statistics,
 * lineups) is deliberately left alone, in every league and every season:
 * the match page draws it for any fixture, and the player page builds
 * its season list and its match-by-match table out of the players'
 * lines. Dropping it for the minor leagues would empty those pages for
 * their old matches, and the provider charges to fetch them again.
 *
 * Deleting does not shrink the disk by itself: Postgres reuses the space
 * for what comes next, which is the point.
 */

/** Raw payloads of the provider: this many season years back. */
const RAW_KEEP_SEASONS = 2;
/** Job runs, the notified ledger and the error log, in days. */
const RUNS_KEEP_DAYS = 30;
const NOTIFIED_KEEP_DAYS = 14;
const ERRORS_KEEP_DAYS = 30;

const dayAgo = (days: number) => new Date(Date.now() - days * 86_400_000).toISOString();

/** Every row of a table older than this, by the column that dates it. A table that is not there is a warning, not a failure. */
async function pruneOlderThan(db: FootballClient, run: SyncRun, table: string, column: string, before: string | number, counter: string): Promise<void> {
    const {error, count} = await db.from(table).delete({count: 'exact'}).lt(column, before);
    if (error) {
        run.warn(`${table}: ${error.message}`);
        return;
    }
    if (count) run.bump(counter, count);
}

/** The nightly clean-up. Nothing a page reads is touched. */
export async function pruneDatabase(db: FootballClient, run: SyncRun): Promise<void> {
    // The season year the data is on, not the calendar's: some competitions run their own way.
    const {data: currentRows, error: currentError} = await db.from('seasons').select('year').eq('is_current', true).order('year', {ascending: false}).limit(1);
    if (currentError) failSync('seasons.select', currentError);
    const currentYear = ((currentRows ?? [])[0]?.year as number | undefined) ?? new Date().getUTCFullYear();
    run.bump('season_year', currentYear);

    await pruneOlderThan(db, run, 'player_season_raw', 'season_year', currentYear - RAW_KEEP_SEASONS, 'raw_rows');
    await pruneOlderThan(db, run, 'sync_runs', 'started_at', dayAgo(RUNS_KEEP_DAYS), 'runs');
    await pruneOlderThan(db, run, 'notified', 'sent_at', dayAgo(NOTIFIED_KEEP_DAYS), 'notified');
    await pruneOlderThan(db, run, 'error_log', 'at', dayAgo(ERRORS_KEEP_DAYS), 'errors');
}
