import {describe, expect, it} from 'vitest';
import type {MatchPrediction} from './prediction';
import {bandOf, BANDS, expectedTotals, fairOdds, matchMarkets, summarizeOdds, teamMarketProfile, type TeamMatchFacts} from './markets';

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
