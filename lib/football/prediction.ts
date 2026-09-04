import type {SeasonStudy, SplitRow, TeamStudy} from './data/study';

/**
 * Pre-match prediction from our season study: a Poisson model of the
 * expected goals of both sides (attack and defence rates against the
 * league average, home advantage, expected goals and recent form),
 * corrected for low scores the Dixon-Coles way. Pure and testable.
 *
 * It is a study tool, not betting advice: the output is the probability
 * of each outcome, over/under, both teams to score, the likely scores
 * and the reasons behind them.
 */

export interface PredictionFactor {
    key: 'attack' | 'defence' | 'homeAdvantage' | 'form' | 'xg' | 'sample';
    /** Which side the factor favours. */
    side: 'home' | 'away' | 'none';
    /** Value for the copy, e.g. goals per match. */
    values: Record<string, string | number>;
}

export interface MatchPrediction {
    /** Expected goals of each side. */
    lambda: {home: number; away: number};
    /** Percentages, summing to 100. */
    home: number;
    draw: number;
    away: number;
    /** Percentages. */
    over15: number;
    over25: number;
    over35: number;
    btts: number;
    /** Most likely scorelines, best first. */
    scores: Array<{home: number; away: number; pct: number}>;
    /** Most likely outcome. */
    pick: '1' | 'X' | '2';
    /** Matches behind the numbers (the smaller of the two teams). */
    sample: number;
    confidence: 'low' | 'medium' | 'high';
    factors: PredictionFactor[];
}

const MAX_GOALS = 8;
/** Prior weight in matches: a team with few games is pulled towards the league rate. */
const PRIOR = 6;
/** Low-score correlation (Dixon-Coles rho). */
const RHO = -0.08;

const round = (v: number, digits = 2) => Math.round(v * 10 ** digits) / 10 ** digits;
const pct = (v: number) => Math.round(v * 100);

function poisson(lambda: number, k: number): number {
    let p = Math.exp(-lambda);
    for (let i = 1; i <= k; i += 1) p *= lambda / i;
    return p;
}

function tau(h: number, a: number, lh: number, la: number): number {
    if (h === 0 && a === 0) return 1 - lh * la * RHO;
    if (h === 0 && a === 1) return 1 + lh * RHO;
    if (h === 1 && a === 0) return 1 + la * RHO;
    if (h === 1 && a === 1) return 1 - RHO;
    return 1;
}

/** Rate per match, shrunk towards the league rate when the sample is small. */
function shrink(total: number, played: number, leagueRate: number): number {
    return (total + PRIOR * leagueRate) / (played + PRIOR);
}

function splitOf(rows: SplitRow[], teamId: number): SplitRow | null {
    return rows.find((r) => r.team.id === teamId) ?? null;
}

function leagueRate(rows: SplitRow[], pick: (r: SplitRow) => number, fallback: number): number {
    const played = rows.reduce((s, r) => s + r.played, 0);
    return played > 0 ? rows.reduce((s, r) => s + pick(r), 0) / played : fallback;
}

/** Points in the last five as a fraction of the maximum (0..1), 0.5 when unknown. */
function formScore(form: TeamStudy['form']): number {
    if (form.length === 0) return 0.5;
    const points = form.reduce((s, r) => s + (r === 'W' ? 3 : r === 'D' ? 1 : 0), 0);
    return points / (form.length * 3);
}

export function predictMatch(study: SeasonStudy | null, homeId: number, awayId: number): MatchPrediction | null {
    if (!study || study.played < 10) return null;
    const home = study.teams.find((t) => t.team.id === homeId);
    const away = study.teams.find((t) => t.team.id === awayId);
    if (!home || !away || home.played === 0 || away.played === 0) return null;

    const perTeam = study.goalsPerMatch / 2;
    // Home sides score more than away sides: the league's own split.
    const leagueHome = leagueRate(study.home, (r) => r.goalsFor, perTeam);
    const leagueAway = leagueRate(study.away, (r) => r.goalsFor, perTeam);

    // Blend goals with expected goals when we have them: xG is less noisy.
    const scored = (t: TeamStudy) => (t.xgFor !== null && t.withStats >= 3 ? (t.goalsFor / t.played + t.xgFor) / 2 : t.goalsFor / t.played) * t.played;
    const conceded = (t: TeamStudy) => (t.xgAgainst !== null && t.withStats >= 3 ? (t.goalsAgainst / t.played + t.xgAgainst) / 2 : t.goalsAgainst / t.played) * t.played;

    // Overall strengths, 1.0 = league average.
    const homeAttack = shrink(scored(home), home.played, perTeam) / perTeam;
    const homeDefence = shrink(conceded(home), home.played, perTeam) / perTeam;
    const awayAttack = shrink(scored(away), away.played, perTeam) / perTeam;
    const awayDefence = shrink(conceded(away), away.played, perTeam) / perTeam;

    // Venue-specific strengths, weighted a third: home record of the home
    // side, away record of the away side.
    const hs = splitOf(study.home, homeId);
    const as = splitOf(study.away, awayId);
    const venue = (row: SplitRow | null, pick: (r: SplitRow) => number, league: number, overall: number) => (row && row.played > 0 ? (2 * overall + shrink(pick(row), row.played, league) / league) / 3 : overall);
    const attackH = venue(hs, (r) => r.goalsFor, leagueHome, homeAttack);
    const defenceH = venue(hs, (r) => r.goalsAgainst, leagueAway, homeDefence);
    const attackA = venue(as, (r) => r.goalsFor, leagueAway, awayAttack);
    const defenceA = venue(as, (r) => r.goalsAgainst, leagueHome, awayDefence);

    // Recent form nudges each side by up to ±6%.
    const formH = 1 + (formScore(home.form) - 0.5) * 0.12;
    const formA = 1 + (formScore(away.form) - 0.5) * 0.12;

    const lambdaHome = Math.max(0.15, leagueHome * attackH * defenceA * formH);
    const lambdaAway = Math.max(0.15, leagueAway * attackA * defenceH * formA);

    // Score matrix.
    let pHome = 0;
    let pDraw = 0;
    let pAway = 0;
    let over15 = 0;
    let over25 = 0;
    let over35 = 0;
    let btts = 0;
    let total = 0;
    const scores: Array<{home: number; away: number; pct: number}> = [];
    for (let h = 0; h <= MAX_GOALS; h += 1) {
        for (let a = 0; a <= MAX_GOALS; a += 1) {
            const p = poisson(lambdaHome, h) * poisson(lambdaAway, a) * tau(h, a, lambdaHome, lambdaAway);
            total += p;
            scores.push({home: h, away: a, pct: p});
            if (h > a) pHome += p;
            else if (h < a) pAway += p;
            else pDraw += p;
            if (h + a > 1) over15 += p;
            if (h + a > 2) over25 += p;
            if (h + a > 3) over35 += p;
            if (h > 0 && a > 0) btts += p;
        }
    }
    const norm = (p: number) => p / total;
    const homePct = pct(norm(pHome));
    const awayPct = pct(norm(pAway));
    const drawPct = 100 - homePct - awayPct;
    const pick: MatchPrediction['pick'] = homePct >= awayPct && homePct >= drawPct ? '1' : awayPct >= drawPct ? '2' : 'X';

    const sample = Math.min(home.played, away.played);
    const factors: PredictionFactor[] = [];
    const gf = (t: TeamStudy) => round(t.goalsFor / t.played);
    const ga = (t: TeamStudy) => round(t.goalsAgainst / t.played);
    if (Math.abs(gf(home) - gf(away)) >= 0.3) factors.push({key: 'attack', side: gf(home) > gf(away) ? 'home' : 'away', values: {home: gf(home).toFixed(2), away: gf(away).toFixed(2), league: perTeam.toFixed(2)}});
    if (Math.abs(ga(home) - ga(away)) >= 0.3) factors.push({key: 'defence', side: ga(home) < ga(away) ? 'home' : 'away', values: {home: ga(home).toFixed(2), away: ga(away).toFixed(2), league: perTeam.toFixed(2)}});
    if (home.xgFor !== null && away.xgFor !== null && Math.abs(home.xgFor - away.xgFor) >= 0.3) factors.push({key: 'xg', side: home.xgFor > away.xgFor ? 'home' : 'away', values: {home: home.xgFor.toFixed(2), away: away.xgFor.toFixed(2)}});
    if (home.form.length >= 3 && away.form.length >= 3 && Math.abs(formScore(home.form) - formScore(away.form)) >= 0.25) factors.push({key: 'form', side: formScore(home.form) > formScore(away.form) ? 'home' : 'away', values: {home: home.form.join(''), away: away.form.join('')}});
    factors.push({key: 'homeAdvantage', side: leagueHome > leagueAway ? 'home' : 'none', values: {homeWins: study.homeWinPct, draws: study.drawPct, awayWins: study.awayWinPct}});
    if (sample < 6) factors.push({key: 'sample', side: 'none', values: {matches: sample}});

    return {
        lambda: {home: round(lambdaHome), away: round(lambdaAway)},
        home: homePct,
        draw: drawPct,
        away: awayPct,
        over15: pct(norm(over15)),
        over25: pct(norm(over25)),
        over35: pct(norm(over35)),
        btts: pct(norm(btts)),
        scores: scores
            .map((s) => ({...s, pct: Math.round(norm(s.pct) * 1000) / 10}))
            .sort((a, b) => b.pct - a.pct)
            .slice(0, 5),
        pick,
        sample,
        confidence: sample >= 12 ? 'high' : sample >= 6 ? 'medium' : 'low',
        factors,
    };
}
