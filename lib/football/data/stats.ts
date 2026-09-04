import 'server-only';
import type {CompetitionPage, CompetitionSummary, SeasonSummary} from '../types';
import {getRankings} from './competitions';
import {getNavigation} from './navigation';
import {footballDb, logReadError} from './shared';

export interface CompetitionStats {
    competition: CompetitionSummary;
    season: SeasonSummary;
    rankings: CompetitionPage['rankings'];
}

/** Season rankings of every pinned competition with a current season. */
export async function getStatsPage(): Promise<CompetitionStats[]> {
    try {
        const nav = await getNavigation();
        if (nav.pinned.length === 0) return [];
        const db = footballDb();
        const {data, error} = await db
            .from('seasons')
            .select('id,name,year,league_id')
            .in('league_id', nav.pinned.map((c) => c.id))
            .eq('is_current', true);
        if (error) throw error;
        const seasonOf = new Map<number, SeasonSummary>();
        for (const s of (data ?? []) as Array<{id: number; name: string; year: number; league_id: number}>) seasonOf.set(s.league_id, {id: s.id, name: s.name, year: s.year});

        const out = await Promise.all(
            nav.pinned.map(async (competition): Promise<CompetitionStats | null> => {
                const season = seasonOf.get(competition.id);
                if (!season) return null;
                try {
                    return {competition, season, rankings: await getRankings(competition.id, season.year)};
                } catch (error) {
                    logReadError(`getStatsPage(${competition.slug})`, error);
                    return null;
                }
            }),
        );
        return out.filter((x): x is CompetitionStats => x !== null);
    } catch (error) {
        logReadError('getStatsPage', error);
        return [];
    }
}
