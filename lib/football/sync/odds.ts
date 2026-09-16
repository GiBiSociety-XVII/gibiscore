import 'server-only';
import {apiFootballGet} from '@/lib/api-football/client';
import {mapOdds} from '@/lib/api-football/mappers';
import type {AfOddsResponse} from '@/lib/api-football/types';
import {allowance, failSync, finishRun, footballClient, startRun, type SyncRun} from './context';

/** Featured fixtures kicking off within this many days get their odds. */
const WINDOW_DAYS = 3;
/** Fixtures per run: the window rarely holds more; a full weekend of every featured competition fits. */
const MAX_FIXTURES = 120;

/**
 * sync-odds (every three hours)
 *
 * The bookmakers' pre-match prices of the featured fixtures of the next
 * days: one request per fixture, the four markets the match page reads
 * stored per bookmaker (fixture_odds). The provider publishes odds up to
 * two weeks ahead and moves them a few times a day; three hours keeps
 * the page close enough. Routine class: it waits when the day's quota
 * runs low. `days` widens the window.
 */
export async function syncOdds(options: {days?: number} = {}): Promise<SyncRun> {
    const db = footballClient();
    const run = await startRun(db, 'sync-odds');
    try {
        if (!(await allowance(db, run, 'routine'))) {
            await finishRun(db, run, 'ok');
            return run;
        }
        const now = Date.now();
        const to = new Date(now + (options.days ?? WINDOW_DAYS) * 86_400_000).toISOString();
        const {data, error} = await db
            .from('fixtures')
            .select('id,provider_id,league:leagues!inner(tier)')
            .eq('state', 'scheduled')
            .eq('leagues.tier', 'featured')
            .gte('starting_at', new Date(now).toISOString())
            .lte('starting_at', to)
            .order('starting_at')
            .limit(MAX_FIXTURES);
        if (error) failSync('fixtures.select', error);
        const fixtures = (data ?? []) as unknown as Array<{id: number; provider_id: number}>;
        run.bump('pending', fixtures.length);
        if (fixtures.length === 0) {
            run.bump('idle');
            await finishRun(db, run, 'ok');
            return run;
        }
        for (const f of fixtures) {
            const {response} = await apiFootballGet<AfOddsResponse[]>('odds', {fixture: f.provider_id});
            run.requests += 1;
            const rows = mapOdds(response[0]);
            if (rows.length === 0) {
                run.bump('without_odds');
                continue;
            }
            const updatedAt = response[0]?.update && !Number.isNaN(Date.parse(response[0].update)) ? new Date(response[0].update).toISOString() : new Date().toISOString();
            const {error: upsertError} = await db.from('fixture_odds').upsert(rows.map((r) => ({fixture_id: f.id, bookmaker_id: r.bookmakerId, bookmaker: r.bookmaker, markets: r.markets, updated_at: updatedAt})), {onConflict: 'fixture_id,bookmaker_id'});
            if (upsertError) failSync('fixture_odds.upsert', upsertError);
            // A bookmaker that dropped the fixture is dropped too: the page reads what is offered now.
            const {error: pruneError} = await db.from('fixture_odds').delete().eq('fixture_id', f.id).not('bookmaker_id', 'in', `(${rows.map((r) => r.bookmakerId).join(',')})`);
            if (pruneError) failSync('fixture_odds.delete', pruneError);
            run.bump('fixtures');
            run.bump('bookmakers', rows.length);
        }
        await finishRun(db, run, 'ok');
        return run;
    } catch (error) {
        await finishRun(db, run, 'error', (error as Error).message);
        throw error;
    }
}
