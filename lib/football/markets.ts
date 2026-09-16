import {scoreGrid, type MatchPrediction} from './prediction';

/**
 * The reading of a match the way the betting markets frame it: when the
 * two sides score and concede (goals by quarter hour), how often their
 * matches go over the goal lines, both teams score, end without a goal
 * against; corners and cards per match; and, from the prediction, the
 * probability of every market with its fair odds. Pure and testable: the
 * data layer feeds the matches, this file does the counting.
 *
 * It describes what happened and what the model expects. It is not
 * advice on what to bet.
 */

/** Quarter hours of a match; injury time counts with the half it ends. */
export const BANDS = ['0-15', '16-30', '31-45', '46-60', '61-75', '76-90'] as const;
export type Band = (typeof BANDS)[number];

/** The band of a goal's minute (1..90+; stoppage time is given as 45 or 90). */
export function bandOf(minute: number): number {
    if (minute <= 15) return 0;
    if (minute <= 30) return 1;
    if (minute <= 45) return 2;
    if (minute <= 60) return 3;
    if (minute <= 75) return 4;
    return 5;
}

/** One finished match seen from one team. */
export interface TeamMatchFacts {
    home: boolean;
    goalsFor: number;
    goalsAgainst: number;
    /** Minutes of the goals, when the events are stored. */
    minutesFor: number[];
    minutesAgainst: number[];
    /** The events are stored for this match (else minutes are unknown, not zero). */
    withEvents: boolean;
    cornersFor: number | null;
    cornersAgainst: number | null;
    yellowFor: number | null;
    yellowAgainst: number | null;
}

export interface GoalBands {
    /** Goals scored per band, in the order of BANDS. */
    for: number[];
    against: number[];
    /** Matches with the events stored: the base of the bands. */
    matches: number;
}

export interface VenueLine {
    played: number;
    goalsFor: number;
    goalsAgainst: number;
    over25Pct: number;
    bttsPct: number;
}

export interface TeamMarketProfile {
    played: number;
    bands: GoalBands;
    /** Share of matches over the line, in percent. */
    over05Pct: number;
    over15Pct: number;
    over25Pct: number;
    over35Pct: number;
    bttsPct: number;
    cleanSheetPct: number;
    failedToScorePct: number;
    /** Matches with a goal (either side) before the break, of those with events. */
    firstHalfGoalPct: number;
    /** Matches the team scored first in, of those with events and a goal. */
    scoredFirstPct: number;
    /** Won when scoring first, of the matches it scored first in. */
    wonWhenFirstPct: number;
    goalsForAvg: number;
    goalsAgainstAvg: number;
    goalsAvg: number;
    /** Averages per match with the statistics stored; null without any. */
    cornersFor: number | null;
    cornersAgainst: number | null;
    yellowFor: number | null;
    yellowAgainst: number | null;
    /** The team's record at the venue it plays this match at. */
    venue: VenueLine;
}

const pct = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 100) : 0);
const avg = (values: number[], digits = 1) => (values.length ? Math.round((values.reduce((s, v) => s + v, 0) / values.length) * 10 ** digits) / 10 ** digits : null);

/** The profile of a team over its matches; `venue` is where it plays the match being read. */
export function teamMarketProfile(matches: TeamMatchFacts[], venue: 'home' | 'away'): TeamMarketProfile | null {
    if (matches.length === 0) return null;
    const played = matches.length;
    const bands: GoalBands = {for: BANDS.map(() => 0), against: BANDS.map(() => 0), matches: 0};
    let over05 = 0;
    let over15 = 0;
    let over25 = 0;
    let over35 = 0;
    let btts = 0;
    let cleanSheet = 0;
    let failedToScore = 0;
    let firstHalfGoal = 0;
    let withGoalsAndEvents = 0;
    let scoredFirst = 0;
    let wonWhenFirst = 0;
    let goalsFor = 0;
    let goalsAgainst = 0;
    const cornersFor: number[] = [];
    const cornersAgainst: number[] = [];
    const yellowFor: number[] = [];
    const yellowAgainst: number[] = [];
    const at: VenueLine = {played: 0, goalsFor: 0, goalsAgainst: 0, over25Pct: 0, bttsPct: 0};
    let atOver = 0;
    let atBtts = 0;
    for (const m of matches) {
        const total = m.goalsFor + m.goalsAgainst;
        goalsFor += m.goalsFor;
        goalsAgainst += m.goalsAgainst;
        if (total > 0) over05 += 1;
        if (total > 1) over15 += 1;
        if (total > 2) over25 += 1;
        if (total > 3) over35 += 1;
        if (m.goalsFor > 0 && m.goalsAgainst > 0) btts += 1;
        if (m.goalsAgainst === 0) cleanSheet += 1;
        if (m.goalsFor === 0) failedToScore += 1;
        if (m.withEvents) {
            bands.matches += 1;
            for (const minute of m.minutesFor) bands.for[bandOf(minute)] += 1;
            for (const minute of m.minutesAgainst) bands.against[bandOf(minute)] += 1;
            if ([...m.minutesFor, ...m.minutesAgainst].some((minute) => minute <= 45)) firstHalfGoal += 1;
            const firstFor = Math.min(...m.minutesFor, Infinity);
            const firstAgainst = Math.min(...m.minutesAgainst, Infinity);
            if (firstFor !== Infinity || firstAgainst !== Infinity) {
                withGoalsAndEvents += 1;
                if (firstFor <= firstAgainst) {
                    scoredFirst += 1;
                    if (m.goalsFor > m.goalsAgainst) wonWhenFirst += 1;
                }
            }
        }
        if (m.cornersFor !== null) cornersFor.push(m.cornersFor);
        if (m.cornersAgainst !== null) cornersAgainst.push(m.cornersAgainst);
        if (m.yellowFor !== null) yellowFor.push(m.yellowFor);
        if (m.yellowAgainst !== null) yellowAgainst.push(m.yellowAgainst);
        if ((venue === 'home') === m.home) {
            at.played += 1;
            at.goalsFor += m.goalsFor;
            at.goalsAgainst += m.goalsAgainst;
            if (total > 2) atOver += 1;
            if (m.goalsFor > 0 && m.goalsAgainst > 0) atBtts += 1;
        }
    }
    at.over25Pct = pct(atOver, at.played);
    at.bttsPct = pct(atBtts, at.played);
    return {
        played,
        bands,
        over05Pct: pct(over05, played),
        over15Pct: pct(over15, played),
        over25Pct: pct(over25, played),
        over35Pct: pct(over35, played),
        bttsPct: pct(btts, played),
        cleanSheetPct: pct(cleanSheet, played),
        failedToScorePct: pct(failedToScore, played),
        firstHalfGoalPct: pct(firstHalfGoal, bands.matches),
        scoredFirstPct: pct(scoredFirst, withGoalsAndEvents),
        wonWhenFirstPct: pct(wonWhenFirst, scoredFirst),
        goalsForAvg: avg([goalsFor / played], 2) ?? 0,
        goalsAgainstAvg: avg([goalsAgainst / played], 2) ?? 0,
        goalsAvg: avg([(goalsFor + goalsAgainst) / played], 2) ?? 0,
        cornersFor: avg(cornersFor),
        cornersAgainst: avg(cornersAgainst),
        yellowFor: avg(yellowFor),
        yellowAgainst: avg(yellowAgainst),
        venue: at,
    };
}

/**
 * Where this match's goals should fall: each side's goals scored and
 * conceded per quarter hour, per match played, both sides summed, as
 * the share of the whole (percent, summing to 100). Null when neither
 * side has the events of a match.
 */
export function bandHeat(home: TeamMarketProfile | null, away: TeamMarketProfile | null): number[] | null {
    const rate = (p: TeamMarketProfile | null): number[] | null => (p && p.bands.matches > 0 ? BANDS.map((_, i) => (p.bands.for[i] + p.bands.against[i]) / p.bands.matches) : null);
    const h = rate(home);
    const a = rate(away);
    if (!h && !a) return null;
    const sum = BANDS.map((_, i) => (h?.[i] ?? 0) + (a?.[i] ?? 0));
    const total = sum.reduce((s, v) => s + v, 0);
    if (total === 0) return null;
    const shares = sum.map((v) => Math.round((v / total) * 100));
    // Rounding must not lose the hundred: the biggest band takes the difference.
    const drift = 100 - shares.reduce((s, v) => s + v, 0);
    if (drift !== 0) shares[shares.indexOf(Math.max(...shares))] += drift;
    return shares;
}

/** A market's probability (percent) and the decimal odds that would pay it fairly (100 / percent). */
export interface MarketLine {
    pct: number;
    fair: number | null;
}

export interface MatchMarkets {
    outcome: {home: MarketLine; draw: MarketLine; away: MarketLine};
    doubleChance: {homeOrDraw: MarketLine; drawOrAway: MarketLine; homeOrAway: MarketLine};
    goals: {over15: MarketLine; under15: MarketLine; over25: MarketLine; under25: MarketLine; over35: MarketLine; under35: MarketLine};
    btts: {yes: MarketLine; no: MarketLine};
}

export function fairOdds(pct: number): number | null {
    return pct > 0 ? Math.round((100 / pct) * 100) / 100 : null;
}

const line = (pct: number): MarketLine => ({pct: Math.max(0, Math.min(100, Math.round(pct))), fair: fairOdds(Math.max(0, Math.min(100, Math.round(pct))))});

/** Every market's chance from the model's outcome and goal probabilities. */
export function matchMarkets(p: MatchPrediction): MatchMarkets {
    return {
        outcome: {home: line(p.home), draw: line(p.draw), away: line(p.away)},
        doubleChance: {homeOrDraw: line(p.home + p.draw), drawOrAway: line(p.draw + p.away), homeOrAway: line(p.home + p.away)},
        goals: {over15: line(p.over15), under15: line(100 - p.over15), over25: line(p.over25), under25: line(100 - p.over25), over35: line(p.over35), under35: line(100 - p.over35)},
        btts: {yes: line(p.btts), no: line(100 - p.btts)},
    };
}

/** What the match may bring in corners and yellow cards: each side's own habit against what the other concedes, summed. */
export function expectedTotals(home: TeamMarketProfile | null, away: TeamMarketProfile | null): {corners: number | null; yellows: number | null} {
    const side = (mine: number | null, theirs: number | null) => (mine === null && theirs === null ? null : mine === null ? theirs : theirs === null ? mine : (mine + theirs) / 2);
    const corners = home && away ? [side(home.cornersFor, away.cornersAgainst), side(away.cornersFor, home.cornersAgainst)] : [];
    const yellows = home && away ? [side(home.yellowFor, away.yellowAgainst), side(away.yellowFor, home.yellowAgainst)] : [];
    const sum = (v: Array<number | null>) => (v.length === 2 && v.every((x) => x !== null) ? Math.round((v[0]! + v[1]!) * 10) / 10 : null);
    return {corners: sum(corners), yellows: sum(yellows)};
}

/** A bookmaker's prices for the markets the site reads; a market missing is one the bookmaker did not offer. */
export interface OddsMarkets {
    outcome?: {home: number; draw: number; away: number};
    doubleChance?: {homeOrDraw: number; drawOrAway: number; homeOrAway: number};
    goals?: {over15: number | null; under15: number | null; over25: number | null; under25: number | null; over35: number | null; under35: number | null};
    btts?: {yes: number; no: number};
}

/** The bookmakers' price of one market: their average, the best one and who gives it, how many offer it. */
export interface OddsLine {
    avg: number;
    best: number;
    bestBook: string;
    books: number;
}

export type OddsSummary = {
    outcome?: {home: OddsLine; draw: OddsLine; away: OddsLine};
    doubleChance?: {homeOrDraw: OddsLine; drawOrAway: OddsLine; homeOrAway: OddsLine};
    goals?: Partial<Record<'over15' | 'under15' | 'over25' | 'under25' | 'over35' | 'under35', OddsLine>>;
    btts?: {yes: OddsLine; no: OddsLine};
    /** Bookmakers with at least one market. */
    books: number;
    updatedAt: string | null;
};

/** The bookmakers' rows folded into one line per market, or null without any. */
export function summarizeOdds(rows: Array<{bookmaker: string; markets: OddsMarkets; updatedAt?: string | null}>): OddsSummary | null {
    if (rows.length === 0) return null;
    const fold = (pick: (m: OddsMarkets) => number | null | undefined): OddsLine | null => {
        const prices = rows.map((r) => ({book: r.bookmaker, odd: pick(r.markets) ?? null})).filter((x): x is {book: string; odd: number} => x.odd !== null);
        if (prices.length === 0) return null;
        const best = prices.reduce((m, x) => (x.odd > m.odd ? x : m));
        return {avg: Math.round((prices.reduce((s, x) => s + x.odd, 0) / prices.length) * 100) / 100, best: best.odd, bestBook: best.book, books: prices.length};
    };
    const out: OddsSummary = {books: rows.filter((r) => Object.keys(r.markets).length > 0).length, updatedAt: rows.map((r) => r.updatedAt ?? null).filter((v): v is string => !!v).sort().at(-1) ?? null};
    const home = fold((m) => m.outcome?.home);
    const draw = fold((m) => m.outcome?.draw);
    const away = fold((m) => m.outcome?.away);
    if (home && draw && away) out.outcome = {home, draw, away};
    const homeOrDraw = fold((m) => m.doubleChance?.homeOrDraw);
    const drawOrAway = fold((m) => m.doubleChance?.drawOrAway);
    const homeOrAway = fold((m) => m.doubleChance?.homeOrAway);
    if (homeOrDraw && drawOrAway && homeOrAway) out.doubleChance = {homeOrDraw, drawOrAway, homeOrAway};
    const goals: NonNullable<OddsSummary['goals']> = {};
    for (const key of ['over15', 'under15', 'over25', 'under25', 'over35', 'under35'] as const) {
        const line = fold((m) => m.goals?.[key]);
        if (line) goals[key] = line;
    }
    if (Object.keys(goals).length > 0) out.goals = goals;
    const yes = fold((m) => m.btts?.yes);
    const no = fold((m) => m.btts?.no);
    if (yes && no) out.btts = {yes, no};
    return out.outcome || out.doubleChance || out.goals || out.btts ? out : null;
}

/** A selection of one market, as the betting slips name it. */
export type LegKey = '1' | 'X' | '2' | '1X' | 'X2' | '12' | 'over15' | 'under15' | 'over25' | 'under25' | 'over35' | 'under35' | 'btts' | 'noBtts';

export interface BetLeg {
    key: LegKey;
    /** The leg's own chance, percent. */
    pct: number;
    /** The bookmakers' average for the leg, when stored. */
    odds: number | null;
}

export interface BetSuggestion {
    /** How much risk the slip carries: the thresholds in SUGGESTION_TIERS. */
    tier: 'safe' | 'balanced' | 'bold';
    legs: BetLeg[];
    /** Chance of the whole slip, percent: every leg together, on the model's scorelines. */
    pct: number;
    fair: number;
    /** The bookmakers' price: the leg's average alone, the product of the averages for a slip of several (indicative). */
    odds: number | null;
}

/** The chance a slip of each tier must keep, in percent. */
export const SUGGESTION_TIERS: Array<{tier: BetSuggestion['tier']; min: number}> = [
    {tier: 'safe', min: 78},
    {tier: 'balanced', min: 62},
    {tier: 'bold', min: 45},
];

type Group = 'outcome' | 'goals' | 'btts';
const LEGS: Array<{key: LegKey; group: Group; test: (h: number, a: number) => boolean}> = [
    {key: '1', group: 'outcome', test: (h, a) => h > a},
    {key: 'X', group: 'outcome', test: (h, a) => h === a},
    {key: '2', group: 'outcome', test: (h, a) => h < a},
    {key: '1X', group: 'outcome', test: (h, a) => h >= a},
    {key: 'X2', group: 'outcome', test: (h, a) => h <= a},
    {key: '12', group: 'outcome', test: (h, a) => h !== a},
    {key: 'over15', group: 'goals', test: (h, a) => h + a > 1},
    {key: 'under15', group: 'goals', test: (h, a) => h + a < 2},
    {key: 'over25', group: 'goals', test: (h, a) => h + a > 2},
    {key: 'under25', group: 'goals', test: (h, a) => h + a < 3},
    {key: 'over35', group: 'goals', test: (h, a) => h + a > 3},
    {key: 'under35', group: 'goals', test: (h, a) => h + a < 4},
    {key: 'btts', group: 'btts', test: (h, a) => h > 0 && a > 0},
    {key: 'noBtts', group: 'btts', test: (h, a) => h === 0 || a === 0},
];
/** A leg below this chance is not worth a slip, whatever it pays. */
const LEG_MIN_PCT = 35;
/** A leg must cut the slip's chance by this much, or it adds nothing but words. */
const LEG_CUT_PCT = 3;
/** A slip of one leg more must pay this much more to be preferred over a shorter one of the same tier. */
const LEG_COST = 0.03;

/** The bookmakers' average for a leg, from the summary of the match. */
export function legOdds(odds: OddsSummary | null, key: LegKey): number | null {
    if (!odds) return null;
    switch (key) {
        case '1': return odds.outcome?.home.avg ?? null;
        case 'X': return odds.outcome?.draw.avg ?? null;
        case '2': return odds.outcome?.away.avg ?? null;
        case '1X': return odds.doubleChance?.homeOrDraw.avg ?? null;
        case 'X2': return odds.doubleChance?.drawOrAway.avg ?? null;
        case '12': return odds.doubleChance?.homeOrAway.avg ?? null;
        case 'btts': return odds.btts?.yes.avg ?? null;
        case 'noBtts': return odds.btts?.no.avg ?? null;
        default: return odds.goals?.[key]?.avg ?? null;
    }
}

/**
 * What the model would put on the slip, one suggestion per tier of
 * risk: among every selection and every combination of selections from
 * different markets (outcome, goals, both to score), the one that pays
 * most while keeping the tier's chance. The chance of a combination is
 * counted on the model's scorelines, so its legs never contradict each
 * other (a slip that cannot happen has no chance at all) and a leg that
 * does not narrow the slip is left out. Empty without a prediction.
 */
export function suggestBets(prediction: MatchPrediction, odds: OddsSummary | null): BetSuggestion[] {
    const grid = scoreGrid(prediction.lambda.home, prediction.lambda.away, prediction.rho);
    const chance = (legs: typeof LEGS): number => {
        let p = 0;
        for (let h = 0; h < grid.length; h += 1) for (let a = 0; a < grid[h].length; a += 1) if (legs.every((l) => l.test(h, a))) p += grid[h][a];
        return p * 100;
    };
    const own = new Map(LEGS.map((l) => [l.key, chance([l])]));
    const usable = LEGS.filter((l) => own.get(l.key)! >= LEG_MIN_PCT);
    const byGroup = (g: Group) => usable.filter((l) => l.group === g);
    const slips: Array<{legs: typeof LEGS; pct: number}> = [];
    const consider = (legs: typeof LEGS) => {
        const pct = chance(legs);
        // Every leg must narrow the slip: without it the chance would be higher by a margin.
        if (legs.length > 1 && legs.some((l) => pct > chance(legs.filter((x) => x !== l)) - LEG_CUT_PCT)) return;
        slips.push({legs, pct});
    };
    for (const l of usable) consider([l]);
    for (const o of byGroup('outcome')) for (const g of byGroup('goals')) consider([o, g]);
    for (const o of byGroup('outcome')) for (const b of byGroup('btts')) consider([o, b]);
    for (const g of byGroup('goals')) for (const b of byGroup('btts')) consider([g, b]);
    for (const o of byGroup('outcome')) for (const g of byGroup('goals')) for (const b of byGroup('btts')) consider([o, g, b]);

    const out: BetSuggestion[] = [];
    const taken = new Set<string>();
    for (const {tier, min} of SUGGESTION_TIERS) {
        // The slip that pays most while keeping the tier's chance; a longer slip needs to pay a little more per leg.
        const worth = (s: {legs: typeof LEGS; pct: number}) => (100 / s.pct) * (1 - LEG_COST * (s.legs.length - 1));
        const best = slips.filter((s) => s.pct >= min && !taken.has(s.legs.map((l) => l.key).join('+'))).sort((a, b) => worth(b) - worth(a))[0];
        if (!best) continue;
        taken.add(best.legs.map((l) => l.key).join('+'));
        const legs: BetLeg[] = best.legs.map((l) => ({key: l.key, pct: Math.round(own.get(l.key)!), odds: legOdds(odds, l.key)}));
        const prices = legs.map((l) => l.odds);
        const pct = Math.round(best.pct);
        out.push({tier, legs, pct, fair: fairOdds(pct) ?? 0, odds: prices.every((p): p is number => p !== null) ? Math.round(prices.reduce((s, p) => s * p, 1) * 100) / 100 : null});
    }
    return out;
}

/** Whether a slip won on the final score: every leg true. Unknown legs never win. */
export function settleLegs(keys: LegKey[], homeScore: number, awayScore: number): boolean {
    return keys.length > 0 && keys.every((k) => LEGS.find((l) => l.key === k)?.test(homeScore, awayScore) === true);
}
