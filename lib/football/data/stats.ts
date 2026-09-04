import 'server-only';
import type {CompetitionPage, CompetitionSummary, SeasonSummary} from '../types';
import {fetchAll} from '@/lib/db/paginate';
import {getRankings} from './competitions';
import {getNavigation} from './navigation';
import {footballDb, logReadError} from './shared';

export interface CompetitionStats {
    competition: CompetitionSummary;
    season: SeasonSummary;
    rankings: CompetitionPage['rankings'];
}

export interface StatsPage {
    /** Season shown (year the season starts). */
    year: number;
    /** Years with imported player statistics in at least one pinned competition, newest first. */
    years: Array<{year: number; label: string; isCurrent: boolean}>;
    blocks: CompetitionStats[];
}

/** Season rankings of every pinned competition, for the requested year (default: the current season). */
export async function getStatsPage(requestedYear?: number): Promise<StatsPage> {
    const empty: StatsPage = {year: requestedYear ?? new Date().getFullYear(), years: [], blocks: []};
    try {
        const nav = await getNavigation();
        if (nav.pinned.length === 0) return empty;
        const db = footballDb();
        const leagueIds = nav.pinned.map((c) => c.id);
        const rows = (await fetchAll((a, b) => db.from('seasons').select('id,name,year,league_id,is_current,players_synced_at').in('league_id', leagueIds).order('year', {ascending: false}).order('id').range(a, b), {max: 2000})) as Array<{id: number; name: string; year: number; league_id: number; is_current: boolean; players_synced_at: string | null}>;

        // Years on offer: current seasons plus any past season with statistics.
        const byYear = new Map<number, {label: string; isCurrent: boolean}>();
        for (const s of rows) {
            if (!s.is_current && !s.players_synced_at) continue;
            const cur = byYear.get(s.year);
            byYear.set(s.year, {label: s.name.includes('/') ? s.name : cur?.label ?? s.name, isCurrent: (cur?.isCurrent ?? false) || s.is_current});
        }
        const years = [...byYear.entries()].map(([year, v]) => ({year, ...v})).sort((a, b) => b.year - a.year);
        const currentYear = years.find((y) => y.isCurrent)?.year ?? years[0]?.year;
        const year = requestedYear !== undefined && byYear.has(requestedYear) ? requestedYear : currentYear;
        if (year === undefined) return empty;

        const seasonOf = new Map<number, SeasonSummary>();
        for (const s of rows) if (s.year === year) seasonOf.set(s.league_id, {id: s.id, name: s.name, year: s.year});

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
        return {year, years, blocks: out.filter((x): x is CompetitionStats => x !== null)};
    } catch (error) {
        logReadError('getStatsPage', error);
        return empty;
    }
}
