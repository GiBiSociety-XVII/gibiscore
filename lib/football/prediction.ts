import type {SeasonStudy, SplitRow, TeamStudy} from './data/study';

/**
 * Pre-match prediction from our season study: a Poisson model of the
 * expected goals of both sides (attack and defence rates against the
 * league average, home advantage, expected goals and recent form),
 * corrected for low scores the Dixon-Coles way. Early in a season the
 * rates lean on last season's study (the prior): three matches say
 * little, a whole season says what a club is. Pure and testable.
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
    /** Expected goals of each side, tuned (see PredictionTuning). */
    lambda: {home: number; away: number};
    /** Expected goals before the tuning: what the study alone says. */
    base: {home: number; away: number};
    /** Low-score correlation in force (the tuning's). */
    rho: number;
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
/** Prior weight in matches: a team with few games is pulled towards what it was expected to be. */
const PRIOR = 6;
/** How much of the expectation is last season's own numbers (the rest: the league average). */
const PRIOR_WEIGHT = 0.7;
/** A side not in last season's table (promoted): weaker than average on both ends. */
const PROMOTED = {attack: 0.85, defence: 1.15};
/** Matches of last season's home/away split that weigh beside this season's. */
const SPLIT_PRIOR = 60;
/** Low-score correlation (Dixon-Coles rho). */
const RHO = -0.08;

/**
 * The knobs the archive tunes (backtest.ts): the expected goals of both
 * sides scaled together, the home side's share of them, and the
 * low-score correlation. The study's data is never touched: only what
 * the model makes of it. The defaults are the untuned model.
 */
export interface PredictionTuning {
    /** Both sides' expected goals times this: above one the model was scoring too few. */
    goalScale: number;
    /** The home side's expected goals times this, the away side's divided by it: above one the home edge was underrated. */
    homeEdge: number;
    /** Dixon-Coles rho: negative values push the draw at low scores. */
    rho: number;
}

export const DEFAULT_TUNING: PredictionTuning = {goalScale: 1, homeEdge: 1, rho: RHO};

/** Expected goals with the tuning applied, never below the floor. */
export function tuneLambdas(base: {home: number; away: number}, tuning: PredictionTuning): {home: number; away: number} {
    return {home: Math.max(0.15, base.home * tuning.goalScale * tuning.homeEdge), away: Math.max(0.15, (base.away * tuning.goalScale) / tuning.homeEdge)};
}

const round = (v: number, digits = 2) => Math.round(v * 10 ** digits) / 10 ** digits;
const pct = (v: number) => Math.round(v * 100);

function poisson(lambda: number, k: number): number {
    let p = Math.exp(-lambda);
    for (let i = 1; i <= k; i += 1) p *= lambda / i;
    return p;
}

function tau(h: number, a: number, lh: number, la: number, rho: number): number {
    if (h === 0 && a === 0) return 1 - lh * la * rho;
    if (h === 0 && a === 1) return 1 + lh * rho;
    if (h === 1 && a === 0) return 1 + la * rho;
    if (h === 1 && a === 1) return 1 - rho;
    return 1;
}

/**
 * The probability of every scoreline up to MAX_GOALS goals a side, from
 * the expected goals of a prediction (the same Poisson and low-score
 * correction the prediction uses), normalised to one. `grid[h][a]`.
 */
export function scoreGrid(lambdaHome: number, lambdaAway: number, rho: number = RHO): number[][] {
    const grid: number[][] = [];
    let total = 0;
    const ph = Array.from({length: MAX_GOALS + 1}, (_, h) => poisson(lambdaHome, h));
    const pa = Array.from({length: MAX_GOALS + 1}, (_, a) => poisson(lambdaAway, a));
    for (let h = 0; h <= MAX_GOALS; h += 1) {
        grid.push([]);
        for (let a = 0; a <= MAX_GOALS; a += 1) {
            const p = ph[h] * pa[a] * tau(h, a, lambdaHome, lambdaAway, rho);
            grid[h].push(p);
            total += p;
        }
    }
    return grid.map((row) => row.map((p) => p / total));
}

/** Rate per match, shrunk towards the expected rate when the sample is small. */
function shrink(total: number, played: number, expected: number): number {
    return (total + PRIOR * expected) / (played + PRIOR);
}

/** Goals scored and conceded per match with expected goals blended in when there are enough. */
const scoredRate = (t: TeamStudy) => (t.xgFor !== null && t.withStats >= 3 ? (t.goalsFor / t.played + t.xgFor) / 2 : t.goalsFor / t.played);
const concededRate = (t: TeamStudy) => (t.xgAgainst !== null && t.withStats >= 3 ? (t.goalsAgainst / t.played + t.xgAgainst) / 2 : t.goalsAgainst / t.played);

/**
 * What a side is expected to score and concede per match before this
 * season says: last season's own rates (relative to that league) applied
 * to this league's goals, blended with the average; a side that was not
 * there (promoted) below average; without a prior, the average.
 */
function expectedRates(prior: SeasonStudy | null, teamId: number, perTeam: number): {attack: number; defence: number} {
    if (!prior || prior.played === 0) return {attack: perTeam, defence: perTeam};
    const t = prior.teams.find((x) => x.team.id === teamId);
    if (!t || t.played === 0) return {attack: perTeam * PROMOTED.attack, defence: perTeam * PROMOTED.defence};
    const priorPerTeam = prior.goalsPerMatch / 2;
    const attack = scoredRate(t) / priorPerTeam;
    const defence = concededRate(t) / priorPerTeam;
    return {attack: perTeam * (PRIOR_WEIGHT * attack + 1 - PRIOR_WEIGHT), defence: perTeam * (PRIOR_WEIGHT * defence + 1 - PRIOR_WEIGHT)};
}

/** A side with no match yet this season: an empty line, judged on the prior alone. */
function blank(teamId: number): TeamStudy {
    return {team: {id: teamId, name: '', slug: '', shortCode: null, logoUrl: null}, played: 0, won: 0, drawn: 0, lost: 0, points: 0, goalsFor: 0, goalsAgainst: 0, xgFor: null, xgAgainst: null, possession: null, shots: null, shotsOnTarget: null, corners: null, withStats: 0, over25Pct: 0, bttsPct: 0, cleanSheets: 0, failedToScore: 0, form: []};
}

/** Goals per match of home (or away) sides: this season's split, with last season's weighing beside it. */
function splitRate(rows: SplitRow[], prior: SplitRow[] | null, pick: (r: SplitRow) => number, fallback: number): number {
    const played = rows.reduce((s, r) => s + r.played, 0);
    const goals = rows.reduce((s, r) => s + pick(r), 0);
    const priorPlayed = prior?.reduce((s, r) => s + r.played, 0) ?? 0;
    const priorRate = prior && priorPlayed > 0 ? prior.reduce((s, r) => s + pick(r), 0) / priorPlayed : null;
    if (priorRate === null) return played > 0 ? goals / played : fallback;
    return (goals + SPLIT_PRIOR * priorRate) / (played + SPLIT_PRIOR);
}

function splitOf(rows: SplitRow[], teamId: number): SplitRow | null {
    return rows.find((r) => r.team.id === teamId) ?? null;
}

/** Points in the last five as a fraction of the maximum (0..1), 0.5 when unknown. */
function formScore(form: TeamStudy['form']): number {
    if (form.length === 0) return 0.5;
    const points = form.reduce((s, r) => s + (r === 'W' ? 3 : r === 'D' ? 1 : 0), 0);
    return points / (form.length * 3);
}

/**
 * Goals a side is expected to score in an ordinary match (an average
 * opponent, no venue): its attack strength, shrunk towards the league
 * rate on a small sample, times the league's goals per team. The
 * yardstick for how much a given fixture moves a player's bonus rates:
 * three matches of a season say little, this says what the club is.
 */
export function attackBaseline(study: SeasonStudy | null, teamId: number, prior: SeasonStudy | null = null): number | null {
    if (!study || study.played === 0) return null;
    const team = study.teams.find((t) => t.team.id === teamId) ?? (prior?.teams.some((t) => t.team.id === teamId) ? blank(teamId) : null);
    if (!team) return null;
    const perTeam = study.goalsPerMatch / 2;
    return round(shrink(team.played > 0 ? scoredRate(team) * team.played : 0, team.played, expectedRates(prior, teamId, perTeam).attack));
}

export function predictMatch(season: SeasonStudy | null, homeId: number, awayId: number, prior: SeasonStudy | null = null, tuning: PredictionTuning = DEFAULT_TUNING): MatchPrediction | null {
    // A season not started yet is judged on the prior alone: last season's rates, nobody's matches.
    const study = season ?? (prior ? {...prior, seasonId: prior.seasonId, played: 0, teams: [], home: [], away: []} : null);
    if (!study || (study.played < 10 && !prior)) return null;
    const known = (id: number) => study.teams.find((t) => t.team.id === id) ?? (prior?.teams.some((t) => t.team.id === id) ? blank(id) : undefined);
    const home = known(homeId);
    const away = known(awayId);
    if (!home || !away) return null;
    if (!prior && (home.played === 0 || away.played === 0)) return null;

    const perTeam = study.goalsPerMatch / 2;
    // Home sides score more than away sides: the league's own split, last season's beside it early on.
    const leagueHome = splitRate(study.home, prior?.home ?? null, (r) => r.goalsFor, perTeam);
    const leagueAway = splitRate(study.away, prior?.away ?? null, (r) => r.goalsFor, perTeam);

    // Blend goals with expected goals when we have them: xG is less noisy.
    const scored = (t: TeamStudy) => (t.played > 0 ? scoredRate(t) * t.played : 0);
    const conceded = (t: TeamStudy) => (t.played > 0 ? concededRate(t) * t.played : 0);

    // Overall strengths, 1.0 = league average; a short season leans on what each side was expected to be.
    const expectedH = expectedRates(prior, homeId, perTeam);
    const expectedA = expectedRates(prior, awayId, perTeam);
    const homeAttack = shrink(scored(home), home.played, expectedH.attack) / perTeam;
    const homeDefence = shrink(conceded(home), home.played, expectedH.defence) / perTeam;
    const awayAttack = shrink(scored(away), away.played, expectedA.attack) / perTeam;
    const awayDefence = shrink(conceded(away), away.played, expectedA.defence) / perTeam;

    // Venue-specific strengths, weighted a third: home record of the home
    // side, away record of the away side.
    const hs = splitOf(study.home, homeId);
    const as = splitOf(study.away, awayId);
    const venue = (row: SplitRow | null, pick: (r: SplitRow) => number, league: number, overall: number) => (row && row.played > 0 ? (2 * overall + shrink(pick(row), row.played, league * overall) / league) / 3 : overall);
    const attackH = venue(hs, (r) => r.goalsFor, leagueHome, homeAttack);
    const defenceH = venue(hs, (r) => r.goalsAgainst, leagueAway, homeDefence);
    const attackA = venue(as, (r) => r.goalsFor, leagueAway, awayAttack);
    const defenceA = venue(as, (r) => r.goalsAgainst, leagueHome, awayDefence);

    // Recent form nudges each side by up to ±6%.
    const formH = 1 + (formScore(home.form) - 0.5) * 0.12;
    const formA = 1 + (formScore(away.form) - 0.5) * 0.12;

    const base = {home: Math.max(0.15, leagueHome * attackH * defenceA * formH), away: Math.max(0.15, leagueAway * attackA * defenceH * formA)};

    const sample = Math.min(home.played, away.played);
    const factors: PredictionFactor[] = [];
    const gf = (t: TeamStudy) => (t.played > 0 ? round(t.goalsFor / t.played) : 0);
    const ga = (t: TeamStudy) => (t.played > 0 ? round(t.goalsAgainst / t.played) : 0);
    if (home.played > 0 && away.played > 0 && Math.abs(gf(home) - gf(away)) >= 0.3) factors.push({key: 'attack', side: gf(home) > gf(away) ? 'home' : 'away', values: {home: gf(home).toFixed(2), away: gf(away).toFixed(2), league: perTeam.toFixed(2)}});
    if (home.played > 0 && away.played > 0 && Math.abs(ga(home) - ga(away)) >= 0.3) factors.push({key: 'defence', side: ga(home) < ga(away) ? 'home' : 'away', values: {home: ga(home).toFixed(2), away: ga(away).toFixed(2), league: perTeam.toFixed(2)}});
    if (home.xgFor !== null && away.xgFor !== null && Math.abs(home.xgFor - away.xgFor) >= 0.3) factors.push({key: 'xg', side: home.xgFor > away.xgFor ? 'home' : 'away', values: {home: home.xgFor.toFixed(2), away: away.xgFor.toFixed(2)}});
    if (home.form.length >= 3 && away.form.length >= 3 && Math.abs(formScore(home.form) - formScore(away.form)) >= 0.25) factors.push({key: 'form', side: formScore(home.form) > formScore(away.form) ? 'home' : 'away', values: {home: home.form.join(''), away: away.form.join('')}});
    factors.push({key: 'homeAdvantage', side: leagueHome > leagueAway ? 'home' : 'none', values: {homeWins: study.homeWinPct, draws: study.drawPct, awayWins: study.awayWinPct}});
    if (sample < 6) factors.push({key: 'sample', side: 'none', values: {matches: sample}});

    return fromLambdas(base, tuning, sample, factors);
}

/**
 * The prediction from the expected goals: the tuning applied, the
 * scorelines counted, every market and the likely scores read off them.
 * predictMatch ends here; `retune` starts here again with other knobs.
 */
export function fromLambdas(base: {home: number; away: number}, tuning: PredictionTuning, sample: number, factors: PredictionFactor[]): MatchPrediction {
    const lambda = tuneLambdas(base, tuning);
    const grid = scoreGrid(lambda.home, lambda.away, tuning.rho);
    let pHome = 0;
    let pAway = 0;
    let over15 = 0;
    let over25 = 0;
    let over35 = 0;
    let btts = 0;
    const scores: Array<{home: number; away: number; pct: number}> = [];
    for (let h = 0; h < grid.length; h += 1) {
        for (let a = 0; a < grid[h].length; a += 1) {
            const p = grid[h][a];
            scores.push({home: h, away: a, pct: p});
            if (h > a) pHome += p;
            else if (h < a) pAway += p;
            if (h + a > 1) over15 += p;
            if (h + a > 2) over25 += p;
            if (h + a > 3) over35 += p;
            if (h > 0 && a > 0) btts += p;
        }
    }
    const homePct = pct(pHome);
    const awayPct = pct(pAway);
    const drawPct = 100 - homePct - awayPct;
    const pick: MatchPrediction['pick'] = homePct >= awayPct && homePct >= drawPct ? '1' : awayPct >= drawPct ? '2' : 'X';
    return {
        lambda: {home: round(lambda.home), away: round(lambda.away)},
        base: {home: round(base.home), away: round(base.away)},
        rho: tuning.rho,
        home: homePct,
        draw: drawPct,
        away: awayPct,
        over15: pct(over15),
        over25: pct(over25),
        over35: pct(over35),
        btts: pct(btts),
        scores: scores
            .map((s) => ({...s, pct: Math.round(s.pct * 1000) / 10}))
            .sort((a, b) => b.pct - a.pct)
            .slice(0, 5),
        pick,
        sample,
        confidence: sample >= 12 ? 'high' : sample >= 6 ? 'medium' : 'low',
        factors,
    };
}

/** The same prediction with other knobs: the study's expected goals kept, the tuning redone. */
export function retune(prediction: MatchPrediction, tuning: PredictionTuning): MatchPrediction {
    return fromLambdas(prediction.base, tuning, prediction.sample, prediction.factors);
}
