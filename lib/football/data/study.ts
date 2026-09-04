import 'server-only';
import {unstable_cache} from 'next/cache';
import {fetchAll} from '@/lib/db/paginate';
import type {TeamSummary} from '../types';
import {TEAM_SELECT, footballDb, logReadError, toTeam, type TeamRow} from './shared';

/**
 * Season "studies" computed from our stored fixtures and team statistics:
 * league-wide rates, one profile per team, home and away tables. Cached
 * per season for ten minutes and shared by the competition, match and
 * team pages.
 */

export interface TeamStudy {
    team: TeamSummary;
    played: number;
    won: number;
    drawn: number;
    lost: number;
    points: number;
    goalsFor: number;
    goalsAgainst: number;
    /** Averages per match; null when no team statistics are stored. */
    xgFor: number | null;
    xgAgainst: number | null;
    possession: number | null;
    shots: number | null;
    shotsOnTarget: number | null;
    corners: number | null;
    withStats: number;
    over25Pct: number;
    bttsPct: number;
    cleanSheets: number;
    failedToScore: number;
    /** Oldest to newest. */
    form: Array<'W' | 'D' | 'L'>;
}

export interface SplitRow {
    team: TeamSummary;
    played: number;
    won: number;
    drawn: number;
    lost: number;
    goalsFor: number;
    goalsAgainst: number;
    points: number;
}

export interface SeasonStudy {
    seasonId: number;
    played: number;
    goalsPerMatch: number;
    homeWinPct: number;
    drawPct: number;
    awayWinPct: number;
    over25Pct: number;
    bttsPct: number;
    avgXg: number | null;
    teams: TeamStudy[];
    home: SplitRow[];
    away: SplitRow[];
}

interface Row {
    id: number;
    starting_at: string;
    home_team_id: number;
    away_team_id: number;
    home_score: number | null;
    away_score: number | null;
    home: TeamRow | null;
    away: TeamRow | null;
    stats: Array<{team_id: number; possession: number | null; shots_total: number | null; shots_on_target: number | null; corners: number | null; xg: number | string | null}> | null;
}

const pct = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 100) : 0);
const avg = (values: number[], digits = 2) => (values.length ? Math.round((values.reduce((s, v) => s + v, 0) / values.length) * 10 ** digits) / 10 ** digits : null);

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
        )) as unknown as Row[];
        const played = rows.filter((r) => r.home_score !== null && r.away_score !== null && r.home && r.away);
        if (played.length === 0) return null;

        type Acc = TeamStudy & {xgF: number[]; xgA: number[]; poss: number[]; sh: number[]; shOn: number[]; co: number[]; over: number; btts: number};
        const teams = new Map<number, Acc>();
        const home = new Map<number, SplitRow>();
        const away = new Map<number, SplitRow>();
        const acc = (team: TeamSummary): Acc => teams.get(team.id) ?? {team, played: 0, won: 0, drawn: 0, lost: 0, points: 0, goalsFor: 0, goalsAgainst: 0, xgFor: null, xgAgainst: null, possession: null, shots: null, shotsOnTarget: null, corners: null, withStats: 0, over25Pct: 0, bttsPct: 0, cleanSheets: 0, failedToScore: 0, form: [], xgF: [], xgA: [], poss: [], sh: [], shOn: [], co: [], over: 0, btts: 0};
        const split = (map: Map<number, SplitRow>, team: TeamSummary): SplitRow => map.get(team.id) ?? {team, played: 0, won: 0, drawn: 0, lost: 0, goalsFor: 0, goalsAgainst: 0, points: 0};

        let homeWins = 0;
        let draws = 0;
        let awayWins = 0;
        let over = 0;
        let btts = 0;
        let goals = 0;
        const xgAll: number[] = [];

        for (const r of played) {
            const hs = r.home_score!;
            const as = r.away_score!;
            const homeTeam = toTeam(r.home!);
            const awayTeam = toTeam(r.away!);
            goals += hs + as;
            if (hs > as) homeWins += 1;
            else if (hs < as) awayWins += 1;
            else draws += 1;
            if (hs + as > 2) over += 1;
            if (hs > 0 && as > 0) btts += 1;

            for (const [team, mine, theirs, isHome] of [[homeTeam, hs, as, true], [awayTeam, as, hs, false]] as const) {
                const t = acc(team);
                t.played += 1;
                t.goalsFor += mine;
                t.goalsAgainst += theirs;
                const result: 'W' | 'D' | 'L' = mine > theirs ? 'W' : mine < theirs ? 'L' : 'D';
                if (result === 'W') t.won += 1;
                else if (result === 'L') t.lost += 1;
                else t.drawn += 1;
                t.points = t.won * 3 + t.drawn;
                if (theirs === 0) t.cleanSheets += 1;
                if (mine === 0) t.failedToScore += 1;
                if (mine + theirs > 2) t.over += 1;
                if (mine > 0 && theirs > 0) t.btts += 1;
                t.form.push(result);
                const mineStats = r.stats?.find((s) => s.team_id === team.id);
                const theirStats = r.stats?.find((s) => s.team_id !== team.id);
                if (mineStats) {
                    t.withStats += 1;
                    if (mineStats.possession !== null) t.poss.push(mineStats.possession);
                    if (mineStats.shots_total !== null) t.sh.push(mineStats.shots_total);
                    if (mineStats.shots_on_target !== null) t.shOn.push(mineStats.shots_on_target);
                    if (mineStats.corners !== null) t.co.push(mineStats.corners);
                    if (mineStats.xg !== null) {
                        t.xgF.push(Number(mineStats.xg));
                        if (isHome) xgAll.push(Number(mineStats.xg));
                    }
                }
                if (theirStats?.xg !== null && theirStats?.xg !== undefined) t.xgA.push(Number(theirStats.xg));
                teams.set(team.id, t);

                const s = split(isHome ? home : away, team);
                s.played += 1;
                s.goalsFor += mine;
                s.goalsAgainst += theirs;
                if (result === 'W') s.won += 1;
                else if (result === 'L') s.lost += 1;
                else s.drawn += 1;
                s.points = s.won * 3 + s.drawn;
                (isHome ? home : away).set(team.id, s);
            }
        }

        const finish = (t: Acc): TeamStudy => {
            const {xgF, xgA, poss, sh, shOn, co, over: o, btts: b, ...rest} = t;
            return {
                ...rest,
                xgFor: avg(xgF),
                xgAgainst: avg(xgA),
                possession: avg(poss, 0),
                shots: avg(sh, 1),
                shotsOnTarget: avg(shOn, 1),
                corners: avg(co, 1),
                over25Pct: pct(o, t.played),
                bttsPct: pct(b, t.played),
                form: t.form.slice(-5),
            };
        };
        const sortSplit = (rows: SplitRow[]) => rows.sort((a, b) => b.points - a.points || b.goalsFor - b.goalsAgainst - (a.goalsFor - a.goalsAgainst) || b.goalsFor - a.goalsFor);

        return {
            seasonId,
            played: played.length,
            goalsPerMatch: Math.round((goals / played.length) * 100) / 100,
            homeWinPct: pct(homeWins, played.length),
            drawPct: pct(draws, played.length),
            awayWinPct: pct(awayWins, played.length),
            over25Pct: pct(over, played.length),
            bttsPct: pct(btts, played.length),
            avgXg: avg(xgAll),
            teams: [...teams.values()].map(finish).sort((a, b) => b.points - a.points || b.goalsFor - b.goalsAgainst - (a.goalsFor - a.goalsAgainst)),
            home: sortSplit([...home.values()]),
            away: sortSplit([...away.values()]),
        };
    } catch (error) {
        logReadError(`getSeasonStudy(${seasonId})`, error);
        return null;
    }
}

export const getSeasonStudy = unstable_cache(computeStudy, ['season-study'], {revalidate: 600});

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
