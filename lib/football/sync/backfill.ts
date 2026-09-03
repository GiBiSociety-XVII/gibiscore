import 'server-only';
import {apiFootballGet} from '@/lib/api-football/client';
import type {AfFixtureResponse} from '@/lib/api-football/types';
import {chunk, failSync, finishRun, footballClient, startRun, type SyncRun} from './context';
import {upsertFixtures} from './fixtures';

/**
 * sync-backfill (hourly, and once by hand after the first install)
 *
 * Finished fixtures of featured leagues whose detail (events, lineups,
 * statistics, player ratings) was never stored: matches played before the
 * site went live, or missed while the live job was not running. Oldest
 * first, 20 fixtures per request, `limit` fixtures per run.
 */
export async function syncBackfill(limit = 200): Promise<SyncRun> {
    const db = footballClient();
    const run = await startRun(db, 'sync-backfill');
    try {
        const {data, error} = await db
            .from('fixtures')
            .select('provider_id,league:leagues!inner(tier),season:seasons!inner(is_current)')
            .eq('state', 'finished')
            .is('details_synced_at', null)
            .eq('leagues.tier', 'featured')
            .eq('seasons.is_current', true)
            .order('starting_at', {ascending: true})
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
