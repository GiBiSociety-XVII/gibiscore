import 'server-only';
import {historySeasonCount} from '@/lib/football/competitions';
import {apiFootballGet} from '@/lib/api-football/client';
import type {AfFixtureResponse} from '@/lib/api-football/types';
import {chunk, failSync, featuredSeasons, finishRun, footballClient, startRun, type SyncRun} from './context';
import {upsertFixtures} from './fixtures';

const DAY = 86_400_000;

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
    try {
        const seasons = await featuredSeasons(db, historySeasonCount(), run);

        // 1. Season fixture lists.
        for (const s of seasons) {
            const listedAt = s.fixturesListedAt ? Date.parse(s.fixturesListedAt) : null;
            const stale = listedAt === null || (s.isCurrent && Date.now() - listedAt > 7 * DAY);
            if (!stale) continue;
            const {response} = await apiFootballGet<AfFixtureResponse[]>('fixtures', {league: s.leagueProviderId, season: s.year});
            run.requests += 1;
            await upsertFixtures(db, run, response);
            const {error} = await db.from('seasons').update({fixtures_listed_at: new Date().toISOString()}).eq('id', s.id);
            if (error) failSync('seasons.update', error);
            run.bump('seasons_listed');
            run.bump('fixtures_listed', response.length);
        }

        // 2. Detail of finished fixtures, most recent first.
        const {data, error} = await db
            .from('fixtures')
            .select('provider_id')
            .eq('state', 'finished')
            .is('details_synced_at', null)
            .in('season_id', seasons.map((s) => s.id))
            .order('starting_at', {ascending: false})
            .limit(limit);
        if (error) failSync('fixtures.select', error);
        const ids = (data ?? []).map((r) => r.provider_id as number);
        run.bump('pending', ids.length);

        const fixtures: AfFixtureResponse[] = [];
        for (const group of chunk(ids, 20)) {
            const {response} = await apiFootballGet<AfFixtureResponse[]>('fixtures', {ids: group.join('-')});
            run.requests += 1;
            fixtures.push(...response);
        }
        await upsertFixtures(db, run, fixtures, {withDetails: true});

        // Fixtures the API no longer returns would be retried forever: mark them.
        const returned = new Set(fixtures.map((f) => f.fixture.id));
        const missing = ids.filter((id) => !returned.has(id));
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
