import {scoreGrid, type CalibrationBand, type MatchPrediction} from './prediction';

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

export function fairOdds(pct: number): number | null {
    return pct > 0 ? Math.round((100 / pct) * 100) / 100 : null;
}

/** What the match may bring in corners and yellow cards: each side's own habit against what the other concedes, summed. */
export function expectedTotals(home: TeamMarketProfile | null, away: TeamMarketProfile | null): {corners: number | null; yellows: number | null} {
    const side = (mine: number | null, theirs: number | null) => (mine === null && theirs === null ? null : mine === null ? theirs : theirs === null ? mine : (mine + theirs) / 2);
    const corners = home && away ? [side(home.cornersFor, away.cornersAgainst), side(away.cornersFor, home.cornersAgainst)] : [];
    const yellows = home && away ? [side(home.yellowFor, away.yellowAgainst), side(away.yellowFor, home.yellowAgainst)] : [];
    const sum = (v: Array<number | null>) => (v.length === 2 && v.every((x) => x !== null) ? Math.round((v[0]! + v[1]!) * 10) / 10 : null);
    return {corners: sum(corners), yellows: sum(yellows)};
}

/** The keys of the markets priced per line, as the bookmakers' rows and their summary store them. */
export type GoalsKey = 'over05' | 'under05' | 'over15' | 'under15' | 'over25' | 'under25' | 'over35' | 'under35' | 'over45' | 'under45';
export type HandicapKey = 'homeMinus15' | 'awayMinus15' | 'homePlus15' | 'awayPlus15' | 'homeMinus25' | 'awayMinus25' | 'homePlus25' | 'awayPlus25';
export type TeamGoalsKey = 'homeOver05' | 'homeUnder05' | 'homeOver15' | 'homeUnder15' | 'awayOver05' | 'awayUnder05' | 'awayOver15' | 'awayUnder15';
export type HalfOutcomeKey = 'home' | 'draw' | 'away' | 'homeOrDraw' | 'drawOrAway';
export type HalfGoalsKey = 'over05' | 'under05' | 'over15' | 'under15';
export type ParityKey = 'odd' | 'even';
export type CornersKey = 'over85' | 'under85' | 'over95' | 'under95' | 'over105' | 'under105' | 'over115' | 'under115';
export type CardsKey = 'over35' | 'under35' | 'over45' | 'under45' | 'over55' | 'under55';

/** A bookmaker's prices for the markets the site reads; a market missing is one the bookmaker did not offer, a line null one it did not price. */
export interface OddsMarkets {
    outcome?: {home: number; draw: number; away: number};
    doubleChance?: {homeOrDraw: number; drawOrAway: number; homeOrAway: number};
    goals?: Partial<Record<GoalsKey, number | null>>;
    btts?: {yes: number; no: number};
    /** The Asian handicap at a goal and a half and at two and a half: minus, the side wins by more; plus, it does not lose by more. */
    handicap?: Partial<Record<HandicapKey, number | null>>;
    /** Goals of one side. */
    teamGoals?: Partial<Record<TeamGoalsKey, number | null>>;
    /** The first half: its result and its goals. */
    halfOutcome?: Partial<Record<HalfOutcomeKey, number | null>>;
    halfGoals?: Partial<Record<HalfGoalsKey, number | null>>;
    parity?: Partial<Record<ParityKey, number | null>>;
    corners?: Partial<Record<CornersKey, number | null>>;
    /** Cards of the match, as the bookmakers count them (a yellow one each). */
    cards?: Partial<Record<CardsKey, number | null>>;
    /** Exact scores, "2-1" style keys. */
    scores?: Record<string, number>;
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
    goals?: Partial<Record<GoalsKey, OddsLine>>;
    btts?: {yes: OddsLine; no: OddsLine};
    handicap?: Partial<Record<HandicapKey, OddsLine>>;
    teamGoals?: Partial<Record<TeamGoalsKey, OddsLine>>;
    halfOutcome?: Partial<Record<HalfOutcomeKey, OddsLine>>;
    halfGoals?: Partial<Record<HalfGoalsKey, OddsLine>>;
    parity?: Partial<Record<ParityKey, OddsLine>>;
    corners?: Partial<Record<CornersKey, OddsLine>>;
    cards?: Partial<Record<CardsKey, OddsLine>>;
    scores?: Record<string, OddsLine>;
    /** Bookmakers with at least one market. */
    books: number;
    updatedAt: string | null;
};

const GOALS_KEYS: GoalsKey[] = ['over05', 'under05', 'over15', 'under15', 'over25', 'under25', 'over35', 'under35', 'over45', 'under45'];
const HANDICAP_KEYS: HandicapKey[] = ['homeMinus15', 'awayMinus15', 'homePlus15', 'awayPlus15', 'homeMinus25', 'awayMinus25', 'homePlus25', 'awayPlus25'];
const TEAM_GOALS_KEYS: TeamGoalsKey[] = ['homeOver05', 'homeUnder05', 'homeOver15', 'homeUnder15', 'awayOver05', 'awayUnder05', 'awayOver15', 'awayUnder15'];
const HALF_OUTCOME_KEYS: HalfOutcomeKey[] = ['home', 'draw', 'away', 'homeOrDraw', 'drawOrAway'];
const HALF_GOALS_KEYS: HalfGoalsKey[] = ['over05', 'under05', 'over15', 'under15'];
const PARITY_KEYS: ParityKey[] = ['odd', 'even'];
const CORNERS_KEYS: CornersKey[] = ['over85', 'under85', 'over95', 'under95', 'over105', 'under105', 'over115', 'under115'];
const CARDS_KEYS: CardsKey[] = ['over35', 'under35', 'over45', 'under45', 'over55', 'under55'];

/** The bookmakers' rows folded into one line per market, or null without any. */
export function summarizeOdds(rows: Array<{bookmaker: string; markets: OddsMarkets; updatedAt?: string | null}>): OddsSummary | null {
    if (rows.length === 0) return null;
    const fold = (pick: (m: OddsMarkets) => number | null | undefined): OddsLine | null => {
        const prices = rows.map((r) => ({book: r.bookmaker, odd: pick(r.markets) ?? null})).filter((x): x is {book: string; odd: number} => x.odd !== null);
        if (prices.length === 0) return null;
        const best = prices.reduce((m, x) => (x.odd > m.odd ? x : m));
        return {avg: Math.round((prices.reduce((s, x) => s + x.odd, 0) / prices.length) * 100) / 100, best: best.odd, bestBook: best.book, books: prices.length};
    };
    /** A market of lines, each folded on its own: the lines nobody prices are left out, a market nobody offers is undefined. */
    const foldLines = <K extends string>(keys: readonly K[], pick: (m: OddsMarkets) => Partial<Record<K, number | null>> | undefined): Partial<Record<K, OddsLine>> | undefined => {
        const out: Partial<Record<K, OddsLine>> = {};
        for (const key of keys) {
            const line = fold((m) => pick(m)?.[key]);
            if (line) out[key] = line;
        }
        return Object.keys(out).length > 0 ? out : undefined;
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
    const yes = fold((m) => m.btts?.yes);
    const no = fold((m) => m.btts?.no);
    if (yes && no) out.btts = {yes, no};
    const goals = foldLines(GOALS_KEYS, (m) => m.goals);
    if (goals) out.goals = goals;
    const handicap = foldLines(HANDICAP_KEYS, (m) => m.handicap);
    if (handicap) out.handicap = handicap;
    const teamGoals = foldLines(TEAM_GOALS_KEYS, (m) => m.teamGoals);
    if (teamGoals) out.teamGoals = teamGoals;
    const halfOutcome = foldLines(HALF_OUTCOME_KEYS, (m) => m.halfOutcome);
    if (halfOutcome) out.halfOutcome = halfOutcome;
    const halfGoals = foldLines(HALF_GOALS_KEYS, (m) => m.halfGoals);
    if (halfGoals) out.halfGoals = halfGoals;
    const parity = foldLines(PARITY_KEYS, (m) => m.parity);
    if (parity) out.parity = parity;
    const corners = foldLines(CORNERS_KEYS, (m) => m.corners);
    if (corners) out.corners = corners;
    const cards = foldLines(CARDS_KEYS, (m) => m.cards);
    if (cards) out.cards = cards;
    const scoreKeys = [...new Set(rows.flatMap((r) => Object.keys(r.markets.scores ?? {})))];
    const scores = foldLines(scoreKeys, (m) => m.scores);
    if (scores) out.scores = scores as Record<string, OddsLine>;
    return Object.keys(out).length > 2 ? out : null;
}

/**
 * A selection of one market, as the betting slips name it.
 *
 * - the final result: 1 X 2, the double chances, the Asian handicaps at
 *   a goal and a half and two and a half (`home-15`: the home side wins
 *   by two or more; `away+15`: the away side does not lose by two or more)
 * - the goals of the match: over and under from 0.5 to 4.5, the multigol
 *   ranges (`goals2-4`: two to four goals)
 * - who scores: both teams, each side's goals (`homeOver15`: the home side
 *   scores twice or more; `awayUnder05`: the away side does not score)
 * - the first half: its result, double chances and goals
 * - odd or even goals
 * - corners and cards of the match, over and under their lines
 */
export type LegKey =
    | '1' | 'X' | '2' | '1X' | 'X2' | '12'
    | 'home-15' | 'away-15' | 'home+15' | 'away+15' | 'home-25' | 'away-25' | 'home+25' | 'away+25'
    | 'over05' | 'under05' | 'over15' | 'under15' | 'over25' | 'under25' | 'over35' | 'under35' | 'over45' | 'under45'
    | 'goals1-2' | 'goals1-3' | 'goals2-3' | 'goals2-4' | 'goals2-5' | 'goals3-5'
    | 'btts' | 'noBtts'
    | 'homeOver05' | 'homeUnder05' | 'homeOver15' | 'homeUnder15' | 'awayOver05' | 'awayUnder05' | 'awayOver15' | 'awayUnder15'
    | 'ht1' | 'htX' | 'ht2' | 'ht1X' | 'htX2' | 'htOver05' | 'htUnder05' | 'htOver15' | 'htUnder15'
    | 'odd' | 'even'
    | 'cornersOver85' | 'cornersUnder85' | 'cornersOver95' | 'cornersUnder95' | 'cornersOver105' | 'cornersUnder105' | 'cornersOver115' | 'cornersUnder115'
    | 'cardsOver35' | 'cardsUnder35' | 'cardsOver45' | 'cardsUnder45' | 'cardsOver55' | 'cardsUnder55';

/**
 * The market a leg belongs to. Outcome, goals and both-to-score legs
 * combine with one another on a slip (one of each at most, their joint
 * chance counted on the scorelines); the first half, the parity, the
 * corners and the cards are played on their own.
 */
export type LegGroup = 'outcome' | 'goals' | 'btts' | 'half' | 'parity' | 'corners' | 'cards';
const COMBINABLE: LegGroup[] = ['outcome', 'goals', 'btts'];

/** A handicap leg read: which side and its line ("-1.5", "+2.5"); null for any other leg. */
export function handicapOf(key: LegKey): {side: 'home' | 'away'; line: string} | null {
    const m = /^(home|away)([+-])(15|25)$/.exec(key);
    return m ? {side: m[1] as 'home' | 'away', line: `${m[2]}${m[3][0]}.5`} : null;
}

/** What settles a leg: the final score, the half-time score, the corners and the cards of the match; null when not known yet, NaN when it is not coming (the leg that reads it is lost). */
export interface MatchFacts {
    home: number;
    away: number;
    htHome?: number | null;
    htAway?: number | null;
    corners?: number | null;
    /** Yellow cards of both sides: what the cards lines are read on. */
    yellows?: number | null;
}

interface LegDef {
    key: LegKey;
    group: LegGroup;
    /** A leg settled on a score: the final one, or the half-time one for the first-half group. */
    test?: (h: number, a: number) => boolean;
    /** A leg settled on a count of the match: corners or yellow cards over (or under) a line. */
    count?: {of: 'corners' | 'yellows'; over: boolean; line: number};
    /** The bookmakers' line for it in the summary. */
    price: (o: OddsSummary) => OddsLine | undefined;
}

const overUnder = (over: boolean, line: number) => (over ? (h: number, a: number) => h + a > line : (h: number, a: number) => h + a < line);
const LEGS: LegDef[] = [
    {key: '1', group: 'outcome', test: (h, a) => h > a, price: (o) => o.outcome?.home},
    {key: 'X', group: 'outcome', test: (h, a) => h === a, price: (o) => o.outcome?.draw},
    {key: '2', group: 'outcome', test: (h, a) => h < a, price: (o) => o.outcome?.away},
    {key: '1X', group: 'outcome', test: (h, a) => h >= a, price: (o) => o.doubleChance?.homeOrDraw},
    {key: 'X2', group: 'outcome', test: (h, a) => h <= a, price: (o) => o.doubleChance?.drawOrAway},
    {key: '12', group: 'outcome', test: (h, a) => h !== a, price: (o) => o.doubleChance?.homeOrAway},
    // Handicaps sit with the outcomes: a slip never carries two readings of the same result.
    {key: 'home-15', group: 'outcome', test: (h, a) => h - a > 1, price: (o) => o.handicap?.homeMinus15},
    {key: 'away-15', group: 'outcome', test: (h, a) => a - h > 1, price: (o) => o.handicap?.awayMinus15},
    {key: 'home+15', group: 'outcome', test: (h, a) => a - h < 2, price: (o) => o.handicap?.homePlus15},
    {key: 'away+15', group: 'outcome', test: (h, a) => h - a < 2, price: (o) => o.handicap?.awayPlus15},
    {key: 'home-25', group: 'outcome', test: (h, a) => h - a > 2, price: (o) => o.handicap?.homeMinus25},
    {key: 'away-25', group: 'outcome', test: (h, a) => a - h > 2, price: (o) => o.handicap?.awayMinus25},
    {key: 'home+25', group: 'outcome', test: (h, a) => a - h < 3, price: (o) => o.handicap?.homePlus25},
    {key: 'away+25', group: 'outcome', test: (h, a) => h - a < 3, price: (o) => o.handicap?.awayPlus25},
    {key: 'over05', group: 'goals', test: overUnder(true, 0.5), price: (o) => o.goals?.over05},
    {key: 'under05', group: 'goals', test: overUnder(false, 0.5), price: (o) => o.goals?.under05},
    {key: 'over15', group: 'goals', test: overUnder(true, 1.5), price: (o) => o.goals?.over15},
    {key: 'under15', group: 'goals', test: overUnder(false, 1.5), price: (o) => o.goals?.under15},
    {key: 'over25', group: 'goals', test: overUnder(true, 2.5), price: (o) => o.goals?.over25},
    {key: 'under25', group: 'goals', test: overUnder(false, 2.5), price: (o) => o.goals?.under25},
    {key: 'over35', group: 'goals', test: overUnder(true, 3.5), price: (o) => o.goals?.over35},
    {key: 'under35', group: 'goals', test: overUnder(false, 3.5), price: (o) => o.goals?.under35},
    {key: 'over45', group: 'goals', test: overUnder(true, 4.5), price: (o) => o.goals?.over45},
    {key: 'under45', group: 'goals', test: overUnder(false, 4.5), price: (o) => o.goals?.under45},
    {key: 'goals1-2', group: 'goals', test: (h, a) => h + a >= 1 && h + a <= 2, price: () => undefined},
    {key: 'goals1-3', group: 'goals', test: (h, a) => h + a >= 1 && h + a <= 3, price: () => undefined},
    {key: 'goals2-3', group: 'goals', test: (h, a) => h + a >= 2 && h + a <= 3, price: () => undefined},
    {key: 'goals2-4', group: 'goals', test: (h, a) => h + a >= 2 && h + a <= 4, price: () => undefined},
    {key: 'goals2-5', group: 'goals', test: (h, a) => h + a >= 2 && h + a <= 5, price: () => undefined},
    {key: 'goals3-5', group: 'goals', test: (h, a) => h + a >= 3 && h + a <= 5, price: () => undefined},
    {key: 'btts', group: 'btts', test: (h, a) => h > 0 && a > 0, price: (o) => o.btts?.yes},
    {key: 'noBtts', group: 'btts', test: (h, a) => h === 0 || a === 0, price: (o) => o.btts?.no},
    {key: 'homeOver05', group: 'btts', test: (h) => h > 0, price: (o) => o.teamGoals?.homeOver05},
    {key: 'homeUnder05', group: 'btts', test: (h) => h === 0, price: (o) => o.teamGoals?.homeUnder05},
    {key: 'homeOver15', group: 'btts', test: (h) => h > 1, price: (o) => o.teamGoals?.homeOver15},
    {key: 'homeUnder15', group: 'btts', test: (h) => h < 2, price: (o) => o.teamGoals?.homeUnder15},
    {key: 'awayOver05', group: 'btts', test: (_h, a) => a > 0, price: (o) => o.teamGoals?.awayOver05},
    {key: 'awayUnder05', group: 'btts', test: (_h, a) => a === 0, price: (o) => o.teamGoals?.awayUnder05},
    {key: 'awayOver15', group: 'btts', test: (_h, a) => a > 1, price: (o) => o.teamGoals?.awayOver15},
    {key: 'awayUnder15', group: 'btts', test: (_h, a) => a < 2, price: (o) => o.teamGoals?.awayUnder15},
    {key: 'ht1', group: 'half', test: (h, a) => h > a, price: (o) => o.halfOutcome?.home},
    {key: 'htX', group: 'half', test: (h, a) => h === a, price: (o) => o.halfOutcome?.draw},
    {key: 'ht2', group: 'half', test: (h, a) => h < a, price: (o) => o.halfOutcome?.away},
    {key: 'ht1X', group: 'half', test: (h, a) => h >= a, price: (o) => o.halfOutcome?.homeOrDraw},
    {key: 'htX2', group: 'half', test: (h, a) => h <= a, price: (o) => o.halfOutcome?.drawOrAway},
    {key: 'htOver05', group: 'half', test: overUnder(true, 0.5), price: (o) => o.halfGoals?.over05},
    {key: 'htUnder05', group: 'half', test: overUnder(false, 0.5), price: (o) => o.halfGoals?.under05},
    {key: 'htOver15', group: 'half', test: overUnder(true, 1.5), price: (o) => o.halfGoals?.over15},
    {key: 'htUnder15', group: 'half', test: overUnder(false, 1.5), price: (o) => o.halfGoals?.under15},
    {key: 'odd', group: 'parity', test: (h, a) => (h + a) % 2 === 1, price: (o) => o.parity?.odd},
    {key: 'even', group: 'parity', test: (h, a) => (h + a) % 2 === 0, price: (o) => o.parity?.even},
    {key: 'cornersOver85', group: 'corners', count: {of: 'corners', over: true, line: 8.5}, price: (o) => o.corners?.over85},
    {key: 'cornersUnder85', group: 'corners', count: {of: 'corners', over: false, line: 8.5}, price: (o) => o.corners?.under85},
    {key: 'cornersOver95', group: 'corners', count: {of: 'corners', over: true, line: 9.5}, price: (o) => o.corners?.over95},
    {key: 'cornersUnder95', group: 'corners', count: {of: 'corners', over: false, line: 9.5}, price: (o) => o.corners?.under95},
    {key: 'cornersOver105', group: 'corners', count: {of: 'corners', over: true, line: 10.5}, price: (o) => o.corners?.over105},
    {key: 'cornersUnder105', group: 'corners', count: {of: 'corners', over: false, line: 10.5}, price: (o) => o.corners?.under105},
    {key: 'cornersOver115', group: 'corners', count: {of: 'corners', over: true, line: 11.5}, price: (o) => o.corners?.over115},
    {key: 'cornersUnder115', group: 'corners', count: {of: 'corners', over: false, line: 11.5}, price: (o) => o.corners?.under115},
    {key: 'cardsOver35', group: 'cards', count: {of: 'yellows', over: true, line: 3.5}, price: (o) => o.cards?.over35},
    {key: 'cardsUnder35', group: 'cards', count: {of: 'yellows', over: false, line: 3.5}, price: (o) => o.cards?.under35},
    {key: 'cardsOver45', group: 'cards', count: {of: 'yellows', over: true, line: 4.5}, price: (o) => o.cards?.over45},
    {key: 'cardsUnder45', group: 'cards', count: {of: 'yellows', over: false, line: 4.5}, price: (o) => o.cards?.under45},
    {key: 'cardsOver55', group: 'cards', count: {of: 'yellows', over: true, line: 5.5}, price: (o) => o.cards?.over55},
    {key: 'cardsUnder55', group: 'cards', count: {of: 'yellows', over: false, line: 5.5}, price: (o) => o.cards?.under55},
];
const LEG_BY_KEY = new Map(LEGS.map((l) => [l.key, l]));

/** The market a leg belongs to; undefined for a key the site no longer knows. */
export const legGroup = (key: LegKey): LegGroup | undefined => LEG_BY_KEY.get(key)?.group;

/** Every leg the site knows, in the order of the markets. */
export const LEG_KEYS: LegKey[] = LEGS.map((l) => l.key);

/**
 * The families of markets a page lists, each with its legs in order:
 * one line of cells per family, the best pick of the family lit.
 */
export const MARKET_FAMILIES: Array<{id: string; keys: LegKey[]}> = [
    {id: 'outcome', keys: ['1', 'X', '2']},
    {id: 'doubleChance', keys: ['1X', 'X2', '12']},
    {id: 'handicap', keys: ['home-15', 'home-25', 'away-15', 'away-25']},
    {id: 'handicapPlus', keys: ['home+15', 'home+25', 'away+15', 'away+25']},
    {id: 'goals', keys: ['over05', 'over15', 'over25', 'over35', 'over45']},
    {id: 'under', keys: ['under05', 'under15', 'under25', 'under35', 'under45']},
    {id: 'multigol', keys: ['goals1-2', 'goals1-3', 'goals2-3', 'goals2-4', 'goals2-5', 'goals3-5']},
    {id: 'btts', keys: ['btts', 'noBtts']},
    {id: 'homeGoals', keys: ['homeOver05', 'homeUnder05', 'homeOver15', 'homeUnder15']},
    {id: 'awayGoals', keys: ['awayOver05', 'awayUnder05', 'awayOver15', 'awayUnder15']},
    {id: 'half', keys: ['ht1', 'htX', 'ht2', 'ht1X', 'htX2']},
    {id: 'halfGoals', keys: ['htOver05', 'htUnder05', 'htOver15', 'htUnder15']},
    {id: 'parity', keys: ['odd', 'even']},
    {id: 'corners', keys: ['cornersOver85', 'cornersOver95', 'cornersOver105', 'cornersOver115']},
    {id: 'cornersUnder', keys: ['cornersUnder85', 'cornersUnder95', 'cornersUnder105', 'cornersUnder115']},
    {id: 'cards', keys: ['cardsOver35', 'cardsOver45', 'cardsOver55']},
    {id: 'cardsUnder', keys: ['cardsUnder35', 'cardsUnder45', 'cardsUnder55']},
];

/** The first half carries this share of a match's goals (the second half, with its stoppage time and its tired legs, the rest). */
const HALF_SHARE = 0.44;
/**
 * The corners and cards lines are read on a Poisson count around the
 * expected total, which is a cruder model than the goals one (the
 * counts spread wider than Poisson, and the expectation rests on fewer
 * matches): every chance is pulled this much towards even.
 */
const COUNT_CONFIDENCE = 0.85;

/** The chance a Poisson count with this mean exceeds the line (a half: no tie). */
export function poissonOver(mean: number, line: number): number {
    const k = Math.floor(line);
    let term = Math.exp(-mean);
    let below = term;
    for (let i = 1; i <= k; i += 1) {
        term *= mean / i;
        below += term;
    }
    return Math.max(0, Math.min(1, 1 - below));
}

/** A count leg's chance, percent, from the match's expected count; null without one. */
function countChance(count: NonNullable<LegDef['count']>, counts: MatchPrediction['counts']): number | null {
    const mean = counts[count.of];
    if (mean === null) return null;
    const over = poissonOver(mean, count.line);
    const p = count.over ? over : 1 - over;
    return (0.5 + (p - 0.5) * COUNT_CONFIDENCE) * 100;
}

/** The chance of every leg on this prediction, percent: the scorelines for the score legs, the half-time scorelines for the first half, the expected counts for corners and cards (left out without them). */
export function legChances(prediction: MatchPrediction): Map<LegKey, number> {
    const grid = scoreGrid(prediction.lambda.home, prediction.lambda.away, prediction.rho);
    const half = scoreGrid(prediction.lambda.home * HALF_SHARE, prediction.lambda.away * HALF_SHARE, prediction.rho);
    const onGrid = (g: number[][], test: (h: number, a: number) => boolean): number => {
        let p = 0;
        for (let h = 0; h < g.length; h += 1) for (let a = 0; a < g[h].length; a += 1) if (test(h, a)) p += g[h][a];
        return p * 100;
    };
    const out = new Map<LegKey, number>();
    for (const l of LEGS) {
        if (l.test) out.set(l.key, onGrid(l.group === 'half' ? half : grid, l.test));
        else if (l.count) {
            const p = countChance(l.count, prediction.counts);
            if (p !== null) out.set(l.key, p);
        }
    }
    return out;
}

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
    /** The bookmakers' price: the leg's average alone; for a slip of several, the product of the averages divided by how much likelier the model finds the legs together than apart (indicative: a bookmaker's own price for the pair is what counts). */
    odds: number | null;
}

/** A slip is "value" when the bookmakers' price beats the model's fair odds by at least this much (expected return, e.g. 0.03 = +3%). */
export const VALUE_MIN_EDGE = 0.03;

/** The expected return of a slip at the bookmakers' price, as a fraction (0.08 = +8%); null without a price. */
export function slipEdge(slip: Pick<BetSuggestion, 'pct' | 'odds'>): number | null {
    if (slip.odds === null || !(slip.odds > 1)) return null;
    return Math.round(((slip.pct / 100) * slip.odds - 1) * 1000) / 1000;
}

/** Whether the slip is worth flagging as value: one leg only, since a combination's price is a reading of the legs' prices, not a bookmaker's. */
export const isValueSlip = (slip: Pick<BetSuggestion, 'pct' | 'odds' | 'legs'>): boolean => slip.legs.length === 1 && (slipEdge(slip) ?? -1) >= VALUE_MIN_EDGE;

/** The chance a slip of each tier must keep, in percent; a tier's band runs up to the safer tier's threshold. */
export const SUGGESTION_TIERS: Array<{tier: BetSuggestion['tier']; min: number}> = [
    {tier: 'safe', min: 78},
    {tier: 'balanced', min: 62},
    {tier: 'bold', min: 45},
];

/** A band of the calibration counts once it holds this many readings (every leg of every replayed match is one: a few dozen matches' worth). */
const CALIBRATION_MIN_SLIPS = 300;
/** The groups the calibration is measured on (a replay settles them on the final score): the others keep the model's own chance. */
const CALIBRATED_GROUPS: LegGroup[] = ['outcome', 'goals', 'btts', 'parity'];
/** A leg's chance corrected by the calibration when its group was measured, untouched otherwise. */
export const calibrateLeg = (key: LegKey, pct: number, calibration: CalibrationBand[] | null | undefined): number => (CALIBRATED_GROUPS.includes(legGroup(key) ?? 'half') ? calibrate(pct, calibration) : pct);
/** How far the calibration may move a chance: a tenth up, a fifth down. */
const CALIBRATION_FACTOR = {min: 0.8, max: 1.1};

/**
 * A chance the model promises, corrected by what came of the chances
 * it promised before: in the band this one falls in, the share of
 * slips that came true over the share promised (fit-model, on the
 * replays of past seasons). Untouched without a band or with a thin
 * one; moved at most a tenth up or a fifth down.
 */
export function calibrate(pct: number, calibration: CalibrationBand[] | null | undefined): number {
    const band = calibration?.find((b) => pct >= b.from && pct < b.to && b.slips >= CALIBRATION_MIN_SLIPS && b.promised > 0);
    if (!band) return pct;
    const factor = Math.max(CALIBRATION_FACTOR.min, Math.min(CALIBRATION_FACTOR.max, band.hit / band.promised));
    return Math.max(1, Math.min(99, pct * factor));
}

/** The bookmakers' prices carry a margin: an implied chance is the inverse price, this much smaller. */
const MARKET_MARGIN = 0.06;
/**
 * How much the model's chance weighs against the bookmakers' implied one
 * when a slip is ranked by its expected return: by the confidence of
 * the prediction, that is by how many matches of this competition the
 * two sides have behind them. A side with two matches in a cup (a
 * qualifier against a minnow, say) is read mostly through the market.
 */
const MODEL_WEIGHT: Record<MatchPrediction['confidence'], number> = {high: 0.6, medium: 0.35, low: 0.15};
/**
 * A model chance beyond this many times the market's is not value, it
 * is the model being wrong: a priced market is rarely off by half. Such
 * a slip is read at the market's chance, so it earns no edge.
 */
const DISAGREEMENT_MAX = 2;

/**
 * How much likelier the legs of a slip are together than apart, on the
 * model: the slip's chance over the product of its legs' (1 for one
 * leg). Over 2.5 and both to score, say, come together far more often
 * than two coins would, and a bookmaker's price for the pair knows it.
 */
export function correlationOf(slip: Pick<BetSuggestion, 'pct' | 'legs'>): number {
    if (slip.legs.length < 2) return 1;
    const apart = slip.legs.reduce((p, l) => p * (l.pct / 100), 1);
    return apart > 0 ? Math.max(1, slip.pct / 100 / apart) : 1;
}

/** The expected return of a unit stake on the slip, the chance a blend of the model's and the one the slip's price implies (a margin per leg removed), the model weighing by the prediction's confidence; null without a price on every leg. */
export function expectedReturn(slip: Pick<BetSuggestion, 'pct' | 'legs' | 'odds'>, confidence: MatchPrediction['confidence'] = 'high'): number | null {
    if (slip.odds === null || !(slip.odds > 1) || slip.legs.some((l) => l.odds === null || !(l.odds > 1))) return null;
    // The slip's own price already carries the legs' correlation (a combination is priced at the product over it).
    const implied = 1 / slip.odds / (1 + MARKET_MARGIN) ** slip.legs.length;
    const model = slip.pct / 100;
    const weight = MODEL_WEIGHT[confidence];
    const chance = model > implied * DISAGREEMENT_MAX ? implied : weight * model + (1 - weight) * implied;
    return Math.round(chance * slip.odds * 1000) / 1000;
}

/** A leg or a combination below this raw chance is not worth a slip, whatever it pays: the lowest tier's threshold, less what the calibration may lift. */
const LEG_MIN_PCT = Math.floor(SUGGESTION_TIERS[SUGGESTION_TIERS.length - 1].min / CALIBRATION_FACTOR.max);
/** A leg must cut the slip's chance by this much, or it adds nothing but words. */
const LEG_CUT_PCT = 3;
/** A slip of one leg more must pay this much more to be preferred over a shorter one of the same tier. */
const LEG_COST = 0.03;

/** The bookmakers' average for a leg, from the summary of the match. */
export function legOdds(odds: OddsSummary | null, key: LegKey): number | null {
    if (!odds) return null;
    return LEG_BY_KEY.get(key)?.price(odds)?.avg ?? null;
}

/** The bookmakers' line for a leg, whole (average, best, who gives it). */
export function legLine(odds: OddsSummary | null, key: LegKey): OddsLine | undefined {
    return odds ? LEG_BY_KEY.get(key)?.price(odds) : undefined;
}

/**
 * The pick of a family of markets: the cell the bookmakers pay above its
 * fair price by the most when one is priced that way (value), else the
 * likeliest; null when the family has no chance to read.
 */
export function bestOf(keys: LegKey[], chances: Map<LegKey, number>, odds: OddsSummary | null, confidence: MatchPrediction['confidence'] = 'high'): LegKey | null {
    const cells = keys.filter((k) => chances.has(k));
    if (cells.length === 0) return null;
    // The edge as the ranking reads it: the model's chance blended with the market's, by confidence, and no edge where the two disagree beyond belief.
    const edge = (k: LegKey): number | null => {
        const price = legOdds(odds, k);
        const r = expectedReturn({pct: Math.round(chances.get(k)!), legs: [{key: k, pct: Math.round(chances.get(k)!), odds: price}], odds: price}, confidence);
        return r === null ? null : Math.round((r - 1) * 1000) / 1000;
    };
    const valued = cells.filter((k) => (edge(k) ?? -1) >= VALUE_MIN_EDGE).sort((a, b) => edge(b)! - edge(a)!);
    if (valued.length > 0) return valued[0];
    return cells.sort((a, b) => chances.get(b)! - chances.get(a)!)[0];
}

/**
 * What the model would put on the slip, one suggestion per tier of
 * risk: among every selection and every combination of selections from
 * different markets (outcome or handicap, goals, who scores), the one
 * that pays most while keeping the tier's chance. The chance of a
 * combination is counted on the model's scorelines, so its legs never
 * contradict each other (a slip that cannot happen has no chance at
 * all) and a leg that does not narrow the slip is left out. The first
 * half, the parity, the corners and the cards stand alone, each on its
 * own chance. Empty without a prediction.
 *
 * Every chance is first corrected by the calibration (what came of the
 * chances promised before). The slip of a tier is the one with the
 * best expected return: at the bookmakers' price where there is one,
 * the chance a blend of the model's and the one implied by the price
 * (the market knows things the model does not); at fair odds less the
 * usual margin where there is none, so a priced slip wins only with
 * real value and the markets nobody prices (the goal ranges, the new
 * ones until the odds come) still compete. On a tie, what pays most.
 */
export function suggestBets(prediction: MatchPrediction, odds: OddsSummary | null): BetSuggestion[] {
    const grid = scoreGrid(prediction.lambda.home, prediction.lambda.away, prediction.rho);
    // The scorelines flat, and every combinable leg as a mask over them: a slip's chance is one pass over the cells.
    const cells = grid.flat();
    const own = legChances(prediction);
    interface Masked {
        leg: LegDef;
        mask: Uint8Array;
    }
    const masked = new Map<LegGroup, Masked[]>();
    for (const l of LEGS) {
        // A leg below the floor cannot lift a combination above it (a slip is never likelier than its least likely leg).
        if (!l.test || !COMBINABLE.includes(l.group) || (own.get(l.key) ?? 0) < LEG_MIN_PCT) continue;
        const mask = new Uint8Array(cells.length);
        for (let h = 0; h < grid.length; h += 1) for (let a = 0; a < grid[h].length; a += 1) if (l.test(h, a)) mask[h * grid[h].length + a] = 1;
        masked.set(l.group, [...(masked.get(l.group) ?? []), {leg: l, mask}]);
    }
    const byGroup = (g: LegGroup) => masked.get(g) ?? [];
    const chances = new Map<string, number>();
    const chance = (legs: Masked[]): number => {
        const id = legs.map((l) => l.leg.key).join('+');
        const known = chances.get(id);
        if (known !== undefined) return known;
        let p = 0;
        const [m0, m1, m2] = [legs[0].mask, legs[1]?.mask, legs[2]?.mask];
        for (let i = 0; i < cells.length; i += 1) if (m0[i] === 1 && (!m1 || m1[i] === 1) && (!m2 || m2[i] === 1)) p += cells[i];
        chances.set(id, p * 100);
        return p * 100;
    };
    const slips: Array<{legs: LegDef[]; pct: number}> = [];
    for (const l of LEGS) {
        const pct = own.get(l.key);
        if (pct !== undefined && pct >= LEG_MIN_PCT) slips.push({legs: [l], pct});
    }
    const consider = (legs: Masked[]) => {
        const pct = chance(legs);
        if (pct < LEG_MIN_PCT) return;
        // Every leg must narrow the slip: without it the chance would be higher by a margin.
        if (legs.some((l) => pct > chance(legs.filter((x) => x !== l)) - LEG_CUT_PCT)) return;
        slips.push({legs: legs.map((l) => l.leg), pct});
    };
    for (const o of byGroup('outcome')) for (const g of byGroup('goals')) consider([o, g]);
    for (const o of byGroup('outcome')) for (const b of byGroup('btts')) consider([o, b]);
    for (const g of byGroup('goals')) for (const b of byGroup('btts')) consider([g, b]);
    for (const o of byGroup('outcome')) for (const g of byGroup('goals')) {
        // The pair must already clear the floor for the triple to: a third leg only narrows.
        if (chance([o, g]) < LEG_MIN_PCT) continue;
        for (const b of byGroup('btts')) consider([o, g, b]);
    }

    // Every candidate as a slip: its chance calibrated, its price when every leg has one.
    const candidates: Array<BetSuggestion & {id: string}> = slips.map((s) => {
        const legs: BetLeg[] = s.legs.map((l) => ({key: l.key, pct: Math.round(calibrateLeg(l.key, own.get(l.key)!, prediction.calibration)), odds: legOdds(odds, l.key)}));
        const prices = legs.map((l) => l.odds);
        // A combination is of calibrated groups only: its chance is calibrated like its legs'.
        const pct = Math.round(s.legs.length > 1 || CALIBRATED_GROUPS.includes(s.legs[0].group) ? calibrate(s.pct, prediction.calibration) : s.pct);
        // The price of a combination: the legs' prices multiplied, then divided by how much likelier they are together, on the raw chances (the calibration moves bands apart and would read as correlation).
        const together = correlationOf({pct: s.pct, legs: s.legs.map((l) => ({key: l.key, pct: own.get(l.key)!, odds: null}))});
        return {id: s.legs.map((l) => l.key).join('+'), tier: 'bold', legs, pct, fair: fairOdds(pct) ?? 0, odds: prices.every((p): p is number => p !== null) ? Math.round((prices.reduce((x, p) => x * p, 1) / together) * 100) / 100 : null};
    });
    // A longer slip needs to pay a little more per leg.
    const length = (s: BetSuggestion) => 1 - LEG_COST * (s.legs.length - 1);
    // A slip nobody prices is taken as priced at its fair odds less the usual margin: a priced one beats it only with real value, and loses to it when the bookmakers rate it below the model.
    const score = (s: BetSuggestion) => (expectedReturn(s, prediction.confidence) ?? 1 - MARKET_MARGIN) * length(s);
    // On a tie, what pays most at fair odds (the slips without a price all tie): a likelier slip between two priced alike.
    const rank = (a: BetSuggestion, b: BetSuggestion) => score(b) - score(a) || (a.odds === null || b.odds === null ? (100 / b.pct) * length(b) - (100 / a.pct) * length(a) : b.pct - a.pct);
    const out: BetSuggestion[] = [];
    const taken = new Set<string>();
    for (const [i, {tier, min}] of SUGGESTION_TIERS.entries()) {
        // Each tier keeps its band: from its own threshold up to the safer tier's, so a bold slip is a bold one even when a near-certain one would return more.
        const max = i > 0 ? SUGGESTION_TIERS[i - 1].min : 101;
        const best = candidates.filter((s) => s.pct >= min && s.pct < max && !taken.has(s.id)).sort(rank)[0];
        if (!best) continue;
        taken.add(best.id);
        const {id, ...slip} = best;
        void id;
        out.push({...slip, tier});
    }
    return out;
}

/**
 * Whether a slip won on the match: every leg true. A lost leg loses the
 * slip at once; a leg that waits for a fact not known yet (the half-time
 * score, the statistics) leaves the slip open: null. Unknown legs never win.
 */
export function settleLegs(keys: LegKey[], facts: MatchFacts): boolean | null {
    if (keys.length === 0) return false;
    let open = false;
    for (const key of keys) {
        const leg = LEG_BY_KEY.get(key);
        if (!leg) return false;
        let hit: boolean | null;
        if (leg.count) {
            const value = facts[leg.count.of];
            hit = value === null || value === undefined ? null : leg.count.over ? value > leg.count.line : value < leg.count.line;
        } else if (leg.group === 'half') {
            hit = facts.htHome === null || facts.htHome === undefined || facts.htAway === null || facts.htAway === undefined ? null : leg.test!(facts.htHome, facts.htAway);
        } else hit = leg.test!(facts.home, facts.away);
        if (hit === false) return false;
        if (hit === null) open = true;
    }
    return open ? null : true;
}

/** A leg in words, in the language of the page: "Over 2,5", "Casa -1,5", "1° tempo over 0,5", "Angoli over 9,5". */
export function legText(key: LegKey, locale: string): string {
    const it = locale.toLowerCase().startsWith('it');
    const dec = (n: string) => (it ? n.replace('.', ',') : n);
    const side = (s: 'home' | 'away') => (it ? (s === 'home' ? 'Casa' : 'Ospite') : s === 'home' ? 'Home' : 'Away');
    const hc = handicapOf(key);
    if (hc) return `${side(hc.side)} ${dec(hc.line)}`;
    let m: RegExpExecArray | null;
    if ((m = /^(over|under)(\d)(\d)$/.exec(key))) return `${m[1] === 'over' ? 'Over' : 'Under'} ${dec(`${m[2]}.${m[3]}`)}`;
    if ((m = /^goals(\d)-(\d)$/.exec(key))) return it ? `Multigol ${m[1]}-${m[2]}` : `${m[1]}-${m[2]} goals`;
    if (key === 'btts') return it ? 'Gol' : 'BTTS yes';
    if (key === 'noBtts') return it ? 'No gol' : 'BTTS no';
    if ((m = /^(home|away)(Over|Under)(\d)(\d)$/.exec(key))) {
        const s = side(m[1] as 'home' | 'away');
        if (m[3] === '0') return m[2] === 'Over' ? (it ? `${s} segna` : `${s} scores`) : it ? `${s} non segna` : `${s} no goal`;
        return `${s} ${m[2].toLowerCase()} ${dec(`${m[3]}.${m[4]}`)}`;
    }
    if ((m = /^ht(1X|X2|1|X|2)$/.exec(key))) return it ? `1° tempo ${m[1]}` : `1st half ${m[1]}`;
    if ((m = /^ht(Over|Under)(\d)(\d)$/.exec(key))) return `${it ? '1° tempo' : '1st half'} ${m[1].toLowerCase()} ${dec(`${m[2]}.${m[3]}`)}`;
    if (key === 'odd') return it ? 'Dispari' : 'Odd';
    if (key === 'even') return it ? 'Pari' : 'Even';
    if ((m = /^(corners|cards)(Over|Under)(\d+)(\d)$/.exec(key))) return `${m[1] === 'corners' ? (it ? 'Angoli' : 'Corners') : it ? 'Cartellini' : 'Cards'} ${m[2].toLowerCase()} ${dec(`${m[3]}.${m[4]}`)}`;
    return key;
}
