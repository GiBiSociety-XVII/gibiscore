import 'server-only';
import {failSync, type FootballClient, type SyncRun} from './context';

/**
 * What the database may forget. Calendar, results and standings of every
 * competition stay for good: they are small and they are what the pages
 * are made of. What grows without being read goes:
 *
 * - the detail of the matches of a basic league from two seasons back
 *   (events, players' lines, team statistics, lineups). The season in
 *   play and the one before keep theirs, the featured leagues keep all
 *   of theirs: the player pages, the study and the fantasy model read
 *   three seasons back.
 * - the provider's raw season payloads from further back than the
 *   statistics that were drawn from them: nothing on the site reads them.
 * - the bookkeeping that ages out by the day: job runs, the ledger of
 *   the notifications already sent, the site's error log.
 *
 * Deleting does not shrink the disk by itself: Postgres reuses the space
 * for what comes next, which is the point. Every run has a ceiling, so a
 * long backlog is spread over days instead of hammering the database.
 */

/** Seasons of a basic league: the current one and this many before it keep their detail. */
const BASIC_KEEP_SEASONS = 2;
/** Raw payloads of the provider: this many season years back. */
const RAW_KEEP_SEASONS = 2;
/** Job runs, the notified ledger and the error log, in days. */
const RUNS_KEEP_DAYS = 30;
const NOTIFIED_KEEP_DAYS = 14;
const ERRORS_KEEP_DAYS = 30;

/** Matches cleared in one run: a ceiling, so a first pass on years of data is spread over a few days. */
const FIXTURES_PER_RUN = 4000;

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

/**
 * The daily clean-up. Nothing a page reads is touched: what it drops is
 * either unreadable by the site (the detail of old matches of the minor
 * leagues, the raw payloads) or bookkeeping past its usefulness.
 */
export async function pruneDatabase(db: FootballClient, run: SyncRun): Promise<void> {
    // The season year the data is on, not the calendar's: some competitions run their own way.
    const {data: currentRows, error: currentError} = await db.from('seasons').select('year').eq('is_current', true).order('year', {ascending: false}).limit(1);
    if (currentError) failSync('seasons.select', currentError);
    const currentYear = ((currentRows ?? [])[0]?.year as number | undefined) ?? new Date().getUTCFullYear();
    run.bump('season_year', currentYear);

    // The matches of the basic leagues older than that, in one bounded pass (see prune_old_detail).
    const {data: cleared, error: pruneError} = await db.rpc('prune_old_detail', {cutoff_year: currentYear - BASIC_KEEP_SEASONS, max_fixtures: FIXTURES_PER_RUN});
    if (pruneError) run.warn(`prune_old_detail: ${pruneError.message}`);
    else if (typeof cleared === 'number' && cleared > 0) run.bump('fixtures_cleared', cleared);

    await pruneOlderThan(db, run, 'player_season_raw', 'season_year', currentYear - RAW_KEEP_SEASONS, 'raw_rows');
    await pruneOlderThan(db, run, 'sync_runs', 'started_at', dayAgo(RUNS_KEEP_DAYS), 'runs');
    await pruneOlderThan(db, run, 'notified', 'sent_at', dayAgo(NOTIFIED_KEEP_DAYS), 'notified');
    await pruneOlderThan(db, run, 'error_log', 'at', dayAgo(ERRORS_KEEP_DAYS), 'errors');
}
