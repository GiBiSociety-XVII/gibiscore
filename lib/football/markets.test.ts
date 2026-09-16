import {describe, expect, it} from 'vitest';
import type {MatchPrediction} from './prediction';
import {bandHeat, bandOf, BANDS, expectedTotals, fairOdds, legOdds, matchMarkets, suggestBets, SUGGESTION_TIERS, summarizeOdds, teamMarketProfile, type TeamMatchFacts} from './markets';
import {scoreGrid} from './prediction';

const match = (over: Partial<TeamMatchFacts>): TeamMatchFacts => ({home: true, goalsFor: 0, goalsAgainst: 0, minutesFor: [], minutesAgainst: [], withEvents: true, cornersFor: null, cornersAgainst: null, yellowFor: null, yellowAgainst: null, ...over});

describe('bandOf', () => {
    it('puts a minute in its quarter hour, stoppage time with its half', () => {
        expect(bandOf(1)).toBe(0);
        expect(bandOf(15)).toBe(0);
        expect(bandOf(16)).toBe(1);
        expect(bandOf(45)).toBe(2);
        expect(bandOf(46)).toBe(3);
        expect(bandOf(90)).toBe(5);
        expect(bandOf(97)).toBe(5);
        expect(BANDS).toHaveLength(6);
    });
});

describe('teamMarketProfile', () => {
    const matches = [
        match({home: true, goalsFor: 2, goalsAgainst: 1, minutesFor: [12, 78], minutesAgainst: [50], cornersFor: 6, cornersAgainst: 3, yellowFor: 2, yellowAgainst: 3}),
        match({home: false, goalsFor: 0, goalsAgainst: 0, cornersFor: 4, cornersAgainst: 5, yellowFor: 1, yellowAgainst: 1}),
        match({home: true, goalsFor: 3, goalsAgainst: 3, minutesFor: [5, 44, 88], minutesAgainst: [3, 60, 90]}),
        match({home: false, goalsFor: 1, goalsAgainst: 2, minutesFor: [], minutesAgainst: [], withEvents: false}),
    ];

    it('counts the goal lines, both to score and the clean sheets', () => {
        const p = teamMarketProfile(matches, 'home')!;
        expect(p.played).toBe(4);
        expect(p.over05Pct).toBe(75);
        expect(p.over15Pct).toBe(75);
        expect(p.over25Pct).toBe(75);
        expect(p.over35Pct).toBe(25);
        expect(p.bttsPct).toBe(75);
        expect(p.cleanSheetPct).toBe(25);
        expect(p.failedToScorePct).toBe(25);
        expect(p.goalsForAvg).toBe(1.5);
        expect(p.goalsAgainstAvg).toBe(1.5);
        expect(p.goalsAvg).toBe(3);
    });

    it('spreads the goals over the quarter hours, only from matches with events', () => {
        const p = teamMarketProfile(matches, 'home')!;
        expect(p.bands.matches).toBe(3);
        expect(p.bands.for).toEqual([2, 0, 1, 0, 0, 2]);
        expect(p.bands.against).toEqual([1, 0, 0, 2, 0, 1]);
    });

    it('reads who scored first and what it led to', () => {
        const p = teamMarketProfile(matches, 'home')!;
        // Three matches with events, two with goals: scored first in the first (12' before 50'), not in the third (3' against).
        expect(p.scoredFirstPct).toBe(50);
        expect(p.wonWhenFirstPct).toBe(100);
        expect(p.firstHalfGoalPct).toBe(67);
    });

    it('averages corners and cards over the matches that have them, and keeps the venue record', () => {
        const p = teamMarketProfile(matches, 'home')!;
        expect(p.cornersFor).toBe(5);
        expect(p.cornersAgainst).toBe(4);
        expect(p.yellowFor).toBe(1.5);
        expect(p.venue).toEqual({played: 2, goalsFor: 5, goalsAgainst: 4, over25Pct: 100, bttsPct: 100});
        expect(teamMarketProfile(matches, 'away')!.venue.played).toBe(2);
    });

    it('is null without matches', () => {
        expect(teamMarketProfile([], 'home')).toBeNull();
    });
});

describe('matchMarkets', () => {
    const prediction: MatchPrediction = {lambda: {home: 1.6, away: 1.1}, home: 48, draw: 26, away: 26, over15: 74, over25: 52, over35: 30, btts: 55, scores: [], pick: '1', sample: 10, confidence: 'medium', factors: []};

    it('turns the prediction into every market with its fair odds', () => {
        const m = matchMarkets(prediction);
        expect(m.outcome.home).toEqual({pct: 48, fair: 2.08});
        expect(m.doubleChance.homeOrDraw).toEqual({pct: 74, fair: 1.35});
        expect(m.doubleChance.homeOrAway.pct).toBe(74);
        expect(m.goals.under25).toEqual({pct: 48, fair: 2.08});
        expect(m.goals.over15.pct + m.goals.under15.pct).toBe(100);
        expect(m.btts.no.pct).toBe(45);
    });

    it('has no fair odds for an impossible market', () => {
        expect(fairOdds(0)).toBeNull();
        expect(fairOdds(50)).toBe(2);
        expect(fairOdds(33)).toBe(3.03);
    });
});

describe('expectedTotals', () => {
    it('sums what each side produces against what the other concedes', () => {
        const home = teamMarketProfile([match({cornersFor: 6, cornersAgainst: 4, yellowFor: 2, yellowAgainst: 2})], 'home')!;
        const away = teamMarketProfile([match({cornersFor: 4, cornersAgainst: 6, yellowFor: 3, yellowAgainst: 1})], 'away')!;
        expect(expectedTotals(home, away)).toEqual({corners: 10, yellows: 4});
        expect(expectedTotals(home, null)).toEqual({corners: null, yellows: null});
    });
});

describe('summarizeOdds', () => {
    it('averages the bookmakers, keeps the best price and who gives it', () => {
        const s = summarizeOdds([
            {bookmaker: 'A', markets: {outcome: {home: 1.8, draw: 3.5, away: 4.0}, btts: {yes: 1.7, no: 2.1}}, updatedAt: '2026-09-19T10:00:00Z'},
            {bookmaker: 'B', markets: {outcome: {home: 1.9, draw: 3.4, away: 4.4}, goals: {over15: 1.3, under15: null, over25: 1.85, under25: 1.95, over35: null, under35: null}}, updatedAt: '2026-09-19T12:00:00Z'},
        ])!;
        expect(s.books).toBe(2);
        expect(s.updatedAt).toBe('2026-09-19T12:00:00Z');
        expect(s.outcome!.home).toEqual({avg: 1.85, best: 1.9, bestBook: 'B', books: 2});
        expect(s.outcome!.away.best).toBe(4.4);
        expect(s.btts!.yes).toEqual({avg: 1.7, best: 1.7, bestBook: 'A', books: 1});
        expect(s.goals!.over25!.avg).toBe(1.85);
        expect(s.goals!.under15).toBeUndefined();
        expect(s.doubleChance).toBeUndefined();
    });
    it('is null without rows or without any market', () => {
        expect(summarizeOdds([])).toBeNull();
        expect(summarizeOdds([{bookmaker: 'A', markets: {}}])).toBeNull();
    });
});

describe('bandHeat', () => {
    it('shares the goals of both sides, per match, over the quarter hours', () => {
        // Home: one match, goals at 10' and 80' for, 20' against. Away: two matches, 20' and 25' for, 85' against.
        const home = teamMarketProfile([match({goalsFor: 2, goalsAgainst: 1, minutesFor: [10, 80], minutesAgainst: [20]})], 'home');
        const away = teamMarketProfile([match({goalsFor: 2, goalsAgainst: 1, minutesFor: [20, 25], minutesAgainst: [85]}), match({goalsFor: 0, goalsAgainst: 0})], 'away');
        const heat = bandHeat(home, away)!;
        // Per match: home 0-15 1, 16-30 1, 76-90 1; away 16-30 1, 76-90 0.5 -> 1, 2, 0, 0, 0, 1.5 of 4.5.
        expect(heat).toEqual([22, 45, 0, 0, 0, 33]);
        expect(heat.reduce((s, v) => s + v, 0)).toBe(100);
        expect(heat.indexOf(Math.max(...heat))).toBe(1);
    });
    it('is null without events on either side', () => {
        expect(bandHeat(null, null)).toBeNull();
        expect(bandHeat(teamMarketProfile([match({withEvents: false, goalsFor: 1})], 'home'), null)).toBeNull();
    });
});

describe('scoreGrid', () => {
    it('is a distribution that favours the stronger side', () => {
        const grid = scoreGrid(1.8, 0.9);
        const total = grid.flat().reduce((s, p) => s + p, 0);
        expect(total).toBeCloseTo(1, 6);
        let home = 0;
        let away = 0;
        grid.forEach((row, h) => row.forEach((p, a) => { if (h > a) home += p; if (h < a) away += p; }));
        expect(home).toBeGreaterThan(away);
    });
});

describe('suggestBets', () => {
    const prediction: MatchPrediction = {lambda: {home: 1.9, away: 0.8}, home: 60, draw: 23, away: 17, over15: 74, over25: 50, over35: 27, btts: 44, scores: [], pick: '1', sample: 12, confidence: 'high', factors: []};
    const odds = summarizeOdds([{bookmaker: 'A', markets: {outcome: {home: 1.7, draw: 3.8, away: 5.0}, doubleChance: {homeOrDraw: 1.2, drawOrAway: 2.1, homeOrAway: 1.25}, goals: {over15: 1.3, under15: 3.4, over25: 1.9, under25: 1.9, over35: 3.2, under35: 1.33}, btts: {yes: 1.9, no: 1.85}}}]);

    it('gives one slip per tier, each within its chance, legs from different markets', () => {
        const slips = suggestBets(prediction, odds);
        expect(slips.length).toBeGreaterThanOrEqual(2);
        for (const s of slips) {
            const min = SUGGESTION_TIERS.find((t) => t.tier === s.tier)!.min;
            expect(s.pct).toBeGreaterThanOrEqual(min);
            expect(s.fair).toBeCloseTo(100 / s.pct, 1);
            // A slip is never more likely than its least likely leg.
            expect(s.pct).toBeLessThanOrEqual(Math.min(...s.legs.map((l) => l.pct)));
            const groups = s.legs.map((l) => (['1', 'X', '2', '1X', 'X2', '12'].includes(l.key) ? 'outcome' : l.key.startsWith('over') || l.key.startsWith('under') ? 'goals' : 'btts'));
            expect(new Set(groups).size).toBe(groups.length);
            // The bookmakers' price is the product of the legs' averages.
            expect(s.odds).toBeCloseTo(s.legs.reduce((p, l) => p * (l.odds ?? 1), 1), 1);
        }
        // Tiers pay more as they risk more.
        for (let i = 1; i < slips.length; i += 1) expect(slips[i].fair).toBeGreaterThan(slips[i - 1].fair);
        // The three slips differ.
        expect(new Set(slips.map((s) => s.legs.map((l) => l.key).join('+'))).size).toBe(slips.length);
    });

    it('never puts contradicting legs together', () => {
        const slips = suggestBets(prediction, null);
        for (const s of slips) {
            const keys = s.legs.map((l) => l.key);
            expect(keys.includes('under15') && keys.includes('btts')).toBe(false);
            expect(keys.includes('X') && keys.includes('12')).toBe(false);
            expect(s.odds).toBeNull();
        }
    });

    it('reads a leg price from the summary', () => {
        expect(legOdds(odds, '1X')).toBe(1.2);
        expect(legOdds(odds, 'under35')).toBe(1.33);
        expect(legOdds(null, '1')).toBeNull();
    });
});
