import type {MatchPrediction} from './prediction';

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
