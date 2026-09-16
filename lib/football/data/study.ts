import 'server-only';
import {unstable_cache} from 'next/cache';
import {fetchAll} from '@/lib/db/paginate';
import {avg, buildStudy, type SeasonStudy, type StudyRow} from '../study';
import {TEAM_SELECT, footballDb, logReadError} from './shared';

/**
 * Season "studies" computed from our stored fixtures and team statistics:
 * league-wide rates, one profile per team, home and away tables. Cached
 * per season for ten minutes and shared by the competition, match and
 * team pages.
 */

export {buildStudy} from '../study';
export type {SeasonStudy, SplitRow, StudyRow, TeamStudy} from '../study';

async function computeStudy(seasonId: number): Promise<SeasonStudy | null> {
    try {
        const db = footballDb();
        const rows = (await fetchAll(
            (a, b) =>
                db
                    .from('fixtures')
                    .select(`id,starting_at,home_team_id,away_team_id,home_score,away_score,home:teams!fixtures_home_team_id_fkey(${TEAM_SELECT}),away:teams!fixtures_away_team_id_fkey(${TEAM_SELECT}),stats:fixture_team_stats(team_id,possession,shots_total,shots_on_target,corners,xg)`)
                    .eq('season_id', seasonId)
                    .eq('state', 'finished')
                    .order('starting_at')
                    .order('id')
                    .range(a, b),
            {max: 3000},
        )) as unknown as StudyRow[];
        return buildStudy(seasonId, rows);
    } catch (error) {
        logReadError(`getSeasonStudy(${seasonId})`, error);
        return null;
    }
}

export const getSeasonStudy = unstable_cache(computeStudy, ['season-study'], {revalidate: 600});

/** The same league's season before this one, when the database has it. */
export async function previousSeasonId(seasonId: number): Promise<number | null> {
    const db = footballDb();
    const {data: season, error} = await db.from('seasons').select('league_id,year').eq('id', seasonId).maybeSingle();
    if (error || !season) return null;
    const {data: previous, error: previousError} = await db.from('seasons').select('id').eq('league_id', season.league_id as number).eq('year', (season.year as number) - 1).maybeSingle();
    if (previousError || !previous) return null;
    return previous.id as number;
}

/**
 * Last season's study, the prior of this season's predictions: what each
 * club was, before the new season says. Null without a previous season
 * or without its matches. A finished season does not move: cached an hour.
 */
export const getPriorStudy = unstable_cache(
    async (seasonId: number): Promise<SeasonStudy | null> => {
        try {
            const previous = await previousSeasonId(seasonId);
            if (!previous) return null;
            const study = await computeStudy(previous);
            return study && study.played >= 30 ? study : null;
        } catch (error) {
            logReadError(`getPriorStudy(${seasonId})`, error);
            return null;
        }
    },
    ['season-prior-study'],
    {revalidate: 3600},
);

export interface PositionBenchmark {
    position: string;
    players: number;
    goals90: number;
    assists90: number;
    shots90: number;
    keyPasses90: number;
    rating: number | null;
    passAccuracy: number | null;
}

/** Averages of the players of one position in a competition season (450+ minutes), for per-90 comparisons. */
export async function getPositionBenchmark(leagueId: number, seasonYear: number, position: string): Promise<PositionBenchmark | null> {
    try {
        const db = footballDb();
        const {data, error} = await db
            .from('player_season_stats')
            .select('minutes,goals,assists,shots_total,passes_key,rating,passes_accuracy')
            .eq('league_id', leagueId)
            .eq('season_year', seasonYear)
            .eq('position', position)
            .gte('minutes', 450)
            .limit(1000);
        if (error) throw error;
        const rows = (data ?? []) as Array<{minutes: number | null; goals: number | null; assists: number | null; shots_total: number | null; passes_key: number | null; rating: number | null; passes_accuracy: number | null}>;
        if (rows.length < 3) return null;
        const minutes = rows.reduce((s, r) => s + (r.minutes ?? 0), 0);
        const per90 = (pick: (r: (typeof rows)[number]) => number | null) => Math.round((rows.reduce((s, r) => s + (pick(r) ?? 0), 0) / (minutes / 90)) * 100) / 100;
        const ratings = rows.filter((r) => r.rating !== null).map((r) => Number(r.rating));
        const pass = rows.filter((r) => r.passes_accuracy !== null).map((r) => Number(r.passes_accuracy));
        return {
            position,
            players: rows.length,
            goals90: per90((r) => r.goals),
            assists90: per90((r) => r.assists),
            shots90: per90((r) => r.shots_total),
            keyPasses90: per90((r) => r.passes_key),
            rating: avg(ratings),
            passAccuracy: avg(pass, 0),
        };
    } catch (error) {
        logReadError('getPositionBenchmark', error);
        return null;
    }
}
