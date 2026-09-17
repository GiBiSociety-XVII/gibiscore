import 'server-only';
import {historySeasonCount} from '@/lib/football/competitions';
import {provides} from '@/lib/football/coverage';
import {apiFootballGet} from '@/lib/api-football/client';
import type {AfFixtureResponse} from '@/lib/api-football/types';
import {fetchAll} from '@/lib/db/paginate';
import {allowance, chunk, currentSeasons, failSync, featuredSeasons, finishRun, footballClient, startRun, type SyncRun} from './context';
import {upsertFixtures} from './fixtures';

const DAY = 86_400_000;
/** Stop starting new requests after this, well inside the route's maxDuration. */
const DEADLINE_MS = 230_000;
/** Season lists per run at most: the first pass over ~1,250 basic seasons must leave time for the detail. */
const LIST_MAX_PER_RUN = 250;

/**
 * sync-backfill (hourly, archive class; by hand with a bigger limit after the install)
 *
 * Fills the archive without ever touching the API at page render time:
 * the featured leagues, current season plus API_FOOTBALL_HISTORY_SEASONS
 * past ones; the basic leagues, current season only.
 *
 * 1. Fixture lists. GET /fixtures?league&season (one request, the whole
 *    season) for every season never listed; the current season is listed
 *    again every 7 days to pick up rescheduled matches. This is what
 *    brings in the matchdays played before the site went live, and the
 *    whole calendar of a minor league beyond the month the day lists cover.
 * 2. Fixture detail. Finished fixtures whose events, lineups, statistics
 *    and player ratings were never stored, newest first, 20 per request,
 *    `limit` fixtures per run: every featured fixture, and the basic ones
 *    whose league the provider covers (lib/football/coverage.ts).
 */
export async function syncBackfill(limit = 1000): Promise<SyncRun> {
    const db = footballClient();
    const run = await startRun(db, 'sync-backfill');
    const startedAt = Date.now();
    const outOfTime = () => Date.now() - startedAt > DEADLINE_MS;
    try {
        // The archive can wait: never eat into the requests the live and fixture jobs need today.
        if (!(await allowance(db, run, 'archive'))) {
            await finishRun(db, run, 'ok');
            return run;
        }
        // Featured first (with their history), then the current season of every basic league.
        const seasons = [...(await featuredSeasons(db, historySeasonCount(), run)), ...(await currentSeasons(db, 'basic'))];

        // 1. Season fixture lists.
        let listed = 0;
        for (const s of seasons) {
            const listedAt = s.fixturesListedAt ? Date.parse(s.fixturesListedAt) : null;
            const stale = listedAt === null || (s.isCurrent && Date.now() - listedAt > 7 * DAY);
            if (!stale) continue;
            if (outOfTime() || listed >= LIST_MAX_PER_RUN) {
                run.bump('seasons_deferred');
                continue;
            }
            listed += 1;
            const {response} = await apiFootballGet<AfFixtureResponse[]>('fixtures', {league: s.leagueProviderId, season: s.year});
            run.requests += 1;
            await upsertFixtures(db, run, response);
            const {error} = await db.from('seasons').update({fixtures_listed_at: new Date().toISOString()}).eq('id', s.id);
            if (error) failSync('seasons.update', error);
            run.bump('seasons_listed');
            run.bump('fixtures_listed', response.length);
        }

        // 2. Detail of finished fixtures, most recent first, where the provider has any to give.
        const detailSeasons = seasons.filter((s) => provides(s.tier, s.coverage, 'detail'));
        const pending: Array<{provider_id: number; starting_at: string}> = [];
        for (const group of chunk(detailSeasons.map((s) => s.id), 300)) {
            const rows = await fetchAll(
                (a, b) =>
                    db
                        .from('fixtures')
                        .select('provider_id,starting_at')
                        .eq('state', 'finished')
                        .is('details_synced_at', null)
                        .in('season_id', group)
                        .order('starting_at', {ascending: false})
                        .order('id')
                        .range(a, b),
                {max: limit},
            );
            pending.push(...(rows as unknown as typeof pending));
        }
        const ids = pending.sort((a, b) => b.starting_at.localeCompare(a.starting_at)).slice(0, limit).map((r) => r.provider_id);
        run.bump('pending', ids.length);

        // Fetched and stored a hundred at a time, so the deadline counts the
        // writing too and a run cut short has stored everything it fetched.
        const missing: number[] = [];
        for (const slice of chunk(ids, 100)) {
            if (outOfTime()) {
                run.bump('fixtures_deferred', ids.length - (run.counters.detailed_requested ?? 0));
                break;
            }
            const fixtures: AfFixtureResponse[] = [];
            for (const group of chunk(slice, 20)) {
                const {response} = await apiFootballGet<AfFixtureResponse[]>('fixtures', {ids: group.join('-')});
                run.requests += 1;
                fixtures.push(...response);
            }
            run.bump('detailed_requested', slice.length);
            run.bump('detailed', fixtures.length);
            await upsertFixtures(db, run, fixtures, {withDetails: true});
            const returned = new Set(fixtures.map((f) => f.fixture.id));
            missing.push(...slice.filter((id) => !returned.has(id)));
        }

        // Fixtures the API no longer returns would be retried forever: mark them.
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
