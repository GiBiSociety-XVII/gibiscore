import type {TeamRow} from './data/shared';
import type {TeamSummary} from './types';

/**
 * Season "studies": league-wide rates, one profile per team, home and
 * away tables, built from finished matches and their team statistics.
 * Pure: data/study loads a season and caches the result, backtest.ts
 * replays a season a match at a time.
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

export interface StudyRow {
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
export const avg = (values: number[], digits = 2) => (values.length ? Math.round((values.reduce((s, v) => s + v, 0) / values.length) * 10 ** digits) / 10 ** digits : null);

/**
 * The study of a season from its finished matches, chronological: pure,
 * so the archive can be replayed a match at a time (backtest.ts). Null
 * without a match with a score.
 */
export function buildStudy(seasonId: number, rows: StudyRow[]): SeasonStudy | null {
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
        const homeTeam = teamOf(r.home!);
        const awayTeam = teamOf(r.away!);
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
}

function teamOf(row: TeamRow): TeamSummary {
    return {id: row.id, name: row.name, shortCode: row.short_code, logoUrl: row.logo_url, slug: row.slug};
}
