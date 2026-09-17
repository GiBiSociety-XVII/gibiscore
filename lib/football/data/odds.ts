import 'server-only';
import {unstable_cache} from 'next/cache';
import {summarizeOdds, type OddsMarkets, type OddsSummary} from '../markets';
import type {FixtureSummary} from '../types';
import {footballDb, logReadError} from './shared';

/** The bookmakers' prices stored for a fixture (sync-odds), folded per market; null without any. Refreshed every ten minutes. */
export const getFixtureOdds = unstable_cache(
    async (fixtureId: number): Promise<OddsSummary | null> => {
        try {
            const db = footballDb();
            const {data, error} = await db.from('fixture_odds').select('bookmaker,markets,updated_at').eq('fixture_id', fixtureId).order('bookmaker_id');
            if (error) throw error;
            return summarizeOdds(((data ?? []) as Array<{bookmaker: string; markets: OddsMarkets; updated_at: string | null}>).map((r) => ({bookmaker: r.bookmaker, markets: r.markets ?? {}, updatedAt: r.updated_at})));
        } catch (error) {
            logReadError(`getFixtureOdds(${fixtureId})`, error);
            return null;
        }
    },
    ['fixture-odds'],
    {revalidate: 600},
);

/** The bookmakers' average 1X2 on the matches of a list not yet played (the next two weeks), wherever sync-odds stored some: one query, nothing when there are none. */
export async function attachOdds(db: ReturnType<typeof footballDb>, fixtures: FixtureSummary[], options: {withinDays?: number} = {}): Promise<void> {
    // Only matches close enough for the bookmakers to price them: a season's calendar is not asked in full.
    const limit = Date.now() + (options.withinDays ?? 14) * 86_400_000;
    const wanted = fixtures.filter((f) => f.state === 'scheduled' && new Date(f.startingAt).getTime() <= limit);
    if (wanted.length === 0) return;
    try {
        const rows: Array<{fixture_id: number; bookmaker: string; markets: OddsMarkets}> = [];
        for (let i = 0; i < wanted.length; i += 200) {
            const {data, error} = await db.from('fixture_odds').select('fixture_id,bookmaker,markets').in('fixture_id', wanted.slice(i, i + 200).map((f) => f.id)).limit(5000);
            if (error) throw error;
            rows.push(...((data ?? []) as typeof rows));
        }
        const byFixture = new Map<number, typeof rows>();
        for (const r of rows) byFixture.set(r.fixture_id, [...(byFixture.get(r.fixture_id) ?? []), r]);
        for (const f of wanted) {
            const outcome = summarizeOdds((byFixture.get(f.id) ?? []).map((r) => ({bookmaker: r.bookmaker, markets: r.markets ?? {}})))?.outcome;
            if (outcome) f.odds = {home: outcome.home.avg, draw: outcome.draw.avg, away: outcome.away.avg};
        }
    } catch (error) {
        // The list is worth more than its odds: without them it still shows.
        logReadError('attachOdds', error);
    }
}

