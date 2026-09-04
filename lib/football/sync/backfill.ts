import 'server-only';
import {historySeasonCount} from '@/lib/football/competitions';
import {apiFootballGet, dailyRemaining, quotaAllows, waitForMinuteWindow} from '@/lib/api-football/client';
import type {AfFixtureResponse} from '@/lib/api-football/types';
import {fetchAll} from '@/lib/db/paginate';
import {chunk, failSync, featuredSeasons, finishRun, footballClient, startRun, type SyncRun} from './context';
import {upsertFixtures} from './fixtures';

const DAY = 86_400_000;
/** Requests to leave for the rest of the day: live scores, fixtures, injuries. */
const DAILY_RESERVE = 1500;
/** Stop starting new requests after this, well inside the route's maxDuration. */
const DEADLINE_MS = 230_000;
const RETRY = {retryOnMinuteLimit: true};

/**
 * sync-backfill (hourly, and by hand with a bigger limit after the install)
 *
 * Fills the archive of the featured leagues, current season plus
 * API_FOOTBALL_HISTORY_SEASONS past ones, without ever touching the API at
 * page render time:
 *
 * 1. Fixture lists. GET /fixtures?league&season (one request, the whole
 *    season) for every season never listed; the current season is listed
 *    again every 7 days to pick up rescheduled matches. This is what
 *    brings in the matchdays played before the site went live.
 * 2. Fixture detail. Finished fixtures whose events, lineups, statistics
 *    and player ratings were never stored, newest first, 20 per request,
 *    `limit` fixtures per run.
 */
export async function syncBackfill(limit = 400): Promise<SyncRun> {
    const db = footballClient();
    const run = await startRun(db, 'sync-backfill');
    const startedAt = Date.now();
    const outOfTime = () => Date.now() - startedAt > DEADLINE_MS;
    try {
        // The archive can wait: never eat into the requests the live and fixture jobs need today.
        const remaining = await dailyRemaining();
        if (!quotaAllows(remaining, DAILY_RESERVE)) {
            run.warn(`daily quota low (${remaining} left): backfill waits for tomorrow`);
            run.bump('skipped_quota');
            await finishRun(db, run, 'ok');
            return run;
        }
        const seasons = await featuredSeasons(db, historySeasonCount(), run);

        // 1. Season fixture lists.
        for (const s of seasons) {
            const listedAt = s.fixturesListedAt ? Date.parse(s.fixturesListedAt) : null;
            const stale = listedAt === null || (s.isCurrent && Date.now() - listedAt > 7 * DAY);
            if (!stale) continue;
            if (outOfTime()) {
                run.bump('seasons_deferred');
                continue;
            }
            await waitForMinuteWindow();
            const {response} = await apiFootballGet<AfFixtureResponse[]>('fixtures', {league: s.leagueProviderId, season: s.year}, RETRY);
            run.requests += 1;
            await upsertFixtures(db, run, response);
            const {error} = await db.from('seasons').update({fixtures_listed_at: new Date().toISOString()}).eq('id', s.id);
            if (error) failSync('seasons.update', error);
            run.bump('seasons_listed');
            run.bump('fixtures_listed', response.length);
        }

        // 2. Detail of finished fixtures, most recent first.
        const data = await fetchAll(
            (a, b) =>
                db
                    .from('fixtures')
                    .select('provider_id')
                    .eq('state', 'finished')
                    .is('details_synced_at', null)
                    .in('season_id', seasons.map((s) => s.id))
                    .order('starting_at', {ascending: false})
                    .order('id')
                    .range(a, b),
            {max: limit},
        );
        const ids = data.map((r) => r.provider_id as number);
        run.bump('pending', ids.length);

        const fixtures: AfFixtureResponse[] = [];
        const requested: number[] = [];
        for (const group of chunk(ids, 20)) {
            if (outOfTime()) break;
            await waitForMinuteWindow();
            const {response} = await apiFootballGet<AfFixtureResponse[]>('fixtures', {ids: group.join('-')}, RETRY);
            run.requests += 1;
            requested.push(...group);
            fixtures.push(...response);
        }
        run.bump('detailed', fixtures.length);
        await upsertFixtures(db, run, fixtures, {withDetails: true});

        // Fixtures the API no longer returns would be retried forever: mark them.
        const returned = new Set(fixtures.map((f) => f.fixture.id));
        const missing = requested.filter((id) => !returned.has(id));
        if (missing.length > 0) {
            await db.from('fixtures').update({details_synced_at: new Date().toISOString()}).in('provider_id', missing);
            run.warn(`${missing.length} fixture(s) not returned by the API, marked as synced: ${missing.slice(0, 10).join(',')}`);
        }

        await finishRun(db, run, 'ok');
        return run;
    } catch (error) {
        await finishRun(db, run, 'error', (error as Error).message);
        throw error;
    }
}
