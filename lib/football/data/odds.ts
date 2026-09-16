import 'server-only';
import {unstable_cache} from 'next/cache';
import {summarizeOdds, type OddsMarkets, type OddsSummary} from '../markets';
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
