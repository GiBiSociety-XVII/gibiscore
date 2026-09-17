import 'server-only';
import {apiFootballGet} from '@/lib/api-football/client';
import {mapOdds} from '@/lib/api-football/mappers';
import type {AfOddsResponse} from '@/lib/api-football/types';
import {provides, type LeagueCoverage} from '@/lib/football/coverage';
import {fetchAll} from '@/lib/db/paginate';
import {settleAdvice, settleSchedine, snapshotAdvice} from './advice';
import {allowance, chunk, failSync, finishRun, footballClient, startRun, type SyncRun} from './context';

const HOUR = 3_600_000;
/** Featured fixtures kicking off within this many days get their odds, refreshed every run. */
const WINDOW_DAYS = 3;
/** Basic fixtures kicking off within this many days get their odds, once a day. */
const BASIC_WINDOW_DAYS = 2;
/** A featured fixture asked less than this ago is skipped: the cron runs every three hours. */
const FEATURED_EVERY_MS = 2.5 * HOUR;
/** A basic fixture asked less than this ago is skipped: the bookmakers' prices of a minor league move little. */
const BASIC_EVERY_MS = 20 * HOUR;
/** Basic fixtures per run at most: a weekend of every covered league is spread over the day's runs. */
const BASIC_MAX_FIXTURES = 600;

interface Due {
    id: number;
    provider_id: number;
    season_id: number | null;
    home_team_id: number;
    away_team_id: number;
    starting_at: string;
    odds_synced_at: string | null;
    league: {tier: 'featured' | 'basic'; season_coverage: LeagueCoverage | null};
}

/**
 * sync-odds (every three hours)
 *
 * The bookmakers' pre-match prices of the fixtures of the next days: one
 * request per fixture, the four markets the match page reads stored per
 * bookmaker (fixture_odds). The featured fixtures of the next three days
 * every run; the basic ones whose league the provider covers for odds
 * (lib/football/coverage.ts), next two days, once a day, up to 600 a
 * run. Every ask is marked on the fixture (odds_synced_at), answered or
 * not. Routine class: it waits when the day's quota runs low. `days`
 * widens the featured window.
 *
 * The same pass writes down the model's slips for the featured fixtures
 * and settles the slips of the matches since finished (advice.ts).
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
        const days = options.days ?? WINDOW_DAYS;
        const to = new Date(now + Math.max(days, BASIC_WINDOW_DAYS) * 24 * HOUR).toISOString();
        const rows = (await fetchAll(
            (a, b) =>
                db
                    .from('fixtures')
                    .select('id,provider_id,season_id,home_team_id,away_team_id,starting_at,odds_synced_at,league:leagues!inner(tier,season_coverage)')
                    .eq('state', 'scheduled')
                    .gte('starting_at', new Date(now).toISOString())
                    .lte('starting_at', to)
                    .order('starting_at')
                    .order('id')
                    .range(a, b),
            {max: 8000},
        )) as unknown as Due[];
        const askedAgo = (f: Due) => (f.odds_synced_at ? now - Date.parse(f.odds_synced_at) : Number.POSITIVE_INFINITY);
        const featured = rows.filter((f) => f.league.tier === 'featured' && Date.parse(f.starting_at) <= now + days * 24 * HOUR && askedAgo(f) > FEATURED_EVERY_MS);
        const basic = rows
            .filter((f) => f.league.tier === 'basic' && provides('basic', f.league.season_coverage, 'odds') && Date.parse(f.starting_at) <= now + BASIC_WINDOW_DAYS * 24 * HOUR && askedAgo(f) > BASIC_EVERY_MS)
            .sort((a, b) => (a.odds_synced_at ?? '').localeCompare(b.odds_synced_at ?? '') || a.starting_at.localeCompare(b.starting_at));
        if (basic.length > BASIC_MAX_FIXTURES) run.bump('basic_deferred', basic.length - BASIC_MAX_FIXTURES);
        const fixtures = [...featured, ...basic.slice(0, BASIC_MAX_FIXTURES)];
        run.bump('pending', fixtures.length);
        run.bump('pending_basic', Math.min(basic.length, BASIC_MAX_FIXTURES));
        await settleAdvice(db, run);
        await settleSchedine(db, run);
        if (fixtures.length === 0) {
            run.bump('idle');
            await finishRun(db, run, 'ok');
            return run;
        }
        for (const group of chunk(fixtures, 50)) {
            for (const f of group) {
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
            // Asked, answered or not: the mark keeps the next run off these.
            const {error: markError} = await db.from('fixtures').update({odds_synced_at: new Date().toISOString()}).in('id', group.map((f) => f.id));
            if (markError) failSync('fixtures.update', markError);
        }
        await snapshotAdvice(db, run, featured.filter((f) => f.season_id !== null).map((f) => ({id: f.id, seasonId: f.season_id!, homeId: f.home_team_id, awayId: f.away_team_id})));
        await finishRun(db, run, 'ok');
        return run;
    } catch (error) {
        await finishRun(db, run, 'error', (error as Error).message);
        throw error;
    }
}
