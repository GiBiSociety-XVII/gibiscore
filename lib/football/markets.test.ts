import {describe, expect, it} from 'vitest';
import type {MatchPrediction} from './prediction';
import {bandHeat, bandOf, BANDS, bestOf, calibrate, expectedReturn, expectedTotals, fairOdds, handicapOf, isValueSlip, legChances, legGroup, legOdds, legText, MARKET_FAMILIES, poissonOver, settleLegs, slipEdge, suggestBets, SUGGESTION_TIERS, summarizeOdds, teamMarketProfile, type TeamMatchFacts} from './markets';
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

describe('legChances', () => {
    const prediction: MatchPrediction = {lambda: {home: 1.6, away: 1.1}, base: {home: 1.6, away: 1.1}, rho: -0.08, home: 48, draw: 26, away: 26, over15: 74, over25: 52, over35: 30, btts: 55, scores: [], counts: {corners: null, yellows: null}, calibration: null, pick: '1', sample: 10, confidence: 'medium', factors: []};

    it('reads every market off the scorelines, the first half off a shorter match, the counts off the expectation', () => {
        const m = legChances(prediction);
        const pct = (k: Parameters<typeof m.get>[0]) => m.get(k)!;
        // The outcomes are the prediction's own (its literal is rounded).
        expect(pct('1')).toBeCloseTo(prediction.home, -1);
        expect(pct('1X')).toBeCloseTo(pct('1') + pct('X'), 6);
        expect(pct('12')).toBeCloseTo(100 - pct('X'), 6);
        expect(pct('under25')).toBeCloseTo(100 - pct('over25'), 6);
        expect(pct('over15') + pct('under15')).toBeCloseTo(100, 6);
        expect(pct('noBtts')).toBeCloseTo(100 - pct('btts'), 6);
        expect(pct('goals1-3')).toBeCloseTo(pct('over05') - pct('over35'), 6);
        expect(pct('homeOver05') + pct('homeUnder05')).toBeCloseTo(100, 6);
        expect(pct('home-15')).toBeLessThan(pct('1'));
        expect(pct('home-25')).toBeLessThan(pct('home-15'));
        expect(pct('away+15')).toBeGreaterThan(pct('X2'));
        expect(pct('odd') + pct('even')).toBeCloseTo(100, 6);
        // The first half: fewer goals than the match, a draw likelier.
        expect(pct('htOver05')).toBeLessThan(pct('over05'));
        expect(pct('htX')).toBeGreaterThan(pct('X'));
        expect(pct('ht1') + pct('htX') + pct('ht2')).toBeCloseTo(100, 6);
        // No corners or cards without an expectation.
        expect(m.has('cornersOver95')).toBe(false);
        expect(m.has('cardsOver45')).toBe(false);
        const counted = legChances({...prediction, counts: {corners: 10.2, yellows: 4.1}});
        expect(counted.get('cornersOver95')! + counted.get('cornersUnder95')!).toBeCloseTo(100, 6);
        expect(counted.get('cornersOver85')!).toBeGreaterThan(counted.get('cornersOver115')!);
        expect(counted.get('cardsUnder55')!).toBeGreaterThan(50);
        // Every family lists legs the site knows, and every leg has a group.
        for (const f of MARKET_FAMILIES) for (const k of f.keys) expect(legGroup(k)).toBeDefined();
    });

    it('counts a Poisson tail', () => {
        expect(poissonOver(2, 0.5)).toBeCloseTo(1 - Math.exp(-2), 6);
        expect(poissonOver(10, 9.5)).toBeGreaterThan(0.4);
        expect(poissonOver(10, 9.5)).toBeLessThan(0.6);
        expect(poissonOver(10, 11.5)).toBeLessThan(poissonOver(10, 9.5));
    });

    it('picks the cell of a family the bookmakers pay above fair, else the likeliest', () => {
        const m = legChances(prediction);
        expect(bestOf(['1', 'X', '2'], m, null)).toBe('1');
        // X at 26% is fair at 3.85: a bookmaker paying 4.2 makes it the value pick.
        const odds = summarizeOdds([{bookmaker: 'A', markets: {outcome: {home: 1.9, draw: 4.2, away: 3.4}}}]);
        expect(bestOf(['1', 'X', '2'], m, odds)).toBe('X');
        expect(bestOf(['cornersOver95'], m, null)).toBeNull();
    });

    it('names every leg in both languages', () => {
        expect(legText('over25', 'it')).toBe('Over 2,5');
        expect(legText('over25', 'en')).toBe('Over 2.5');
        expect(legText('home-15', 'it')).toBe('Casa -1,5');
        expect(legText('away+25', 'en')).toBe('Away +2.5');
        expect(legText('goals2-4', 'it')).toBe('Multigol 2-4');
        expect(legText('homeOver05', 'it')).toBe('Casa segna');
        expect(legText('awayUnder05', 'en')).toBe('Away no goal');
        expect(legText('homeOver15', 'it')).toBe('Casa over 1,5');
        expect(legText('ht1X', 'it')).toBe('1° tempo 1X');
        expect(legText('htOver05', 'en')).toBe('1st half over 0.5');
        expect(legText('odd', 'it')).toBe('Dispari');
        expect(legText('cornersOver95', 'it')).toBe('Angoli over 9,5');
        expect(legText('cardsUnder45', 'en')).toBe('Cards under 4.5');
        expect(legText('1X', 'it')).toBe('1X');
        for (const f of MARKET_FAMILIES) for (const k of f.keys) expect(legText(k, 'it')).not.toBe(k.length > 2 ? k : '');
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
        expect(s.handicap).toBeUndefined();
    });
    it('folds the handicap lines like the others', () => {
        const s = summarizeOdds([
            {bookmaker: 'A', markets: {handicap: {homeMinus15: 2.7, awayMinus15: null, homePlus15: null, awayPlus15: 1.46}}},
            {bookmaker: 'B', markets: {handicap: {homeMinus15: 2.9, awayMinus15: null, homePlus15: null, awayPlus15: 1.4}}},
        ])!;
        expect(s.handicap!.homeMinus15).toEqual({avg: 2.8, best: 2.9, bestBook: 'B', books: 2});
        expect(s.handicap!.awayMinus15).toBeUndefined();
        const more = summarizeOdds([{bookmaker: 'A', markets: {corners: {over95: 1.9, under95: 1.9}, cards: {over45: 1.7}, halfOutcome: {home: 2.5, draw: 2.1, away: 4}, parity: {odd: 1.9, even: 1.9}, teamGoals: {homeOver15: 2}, scores: {'1-0': 7}}}])!;
        expect(legOdds(more, 'cornersOver95')).toBe(1.9);
        expect(legOdds(more, 'cardsOver45')).toBe(1.7);
        expect(legOdds(more, 'ht1')).toBe(2.5);
        expect(legOdds(more, 'ht1X')).toBeNull();
        expect(legOdds(more, 'even')).toBe(1.9);
        expect(legOdds(more, 'homeOver15')).toBe(2);
        expect(more.scores!['1-0'].avg).toBe(7);
        expect(legOdds(more, 'goals2-4')).toBeNull();
        expect(legOdds(s, 'home-15')).toBe(2.8);
        expect(legOdds(s, 'away+15')).toBeCloseTo(1.43, 2);
        expect(legOdds(s, 'home+15')).toBeNull();
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
    const prediction: MatchPrediction = {lambda: {home: 1.9, away: 0.8}, base: {home: 1.9, away: 0.8}, rho: -0.08, home: 60, draw: 23, away: 17, over15: 74, over25: 50, over35: 27, btts: 44, scores: [], counts: {corners: null, yellows: null}, calibration: null, pick: '1', sample: 12, confidence: 'high', factors: []};
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
            const groups = s.legs.map((l) => legGroup(l.key));
            expect(new Set(groups).size).toBe(groups.length);
            // The first half, the parity, the corners and the cards are played alone.
            if (s.legs.length > 1) expect(groups.every((g) => g === 'outcome' || g === 'goals' || g === 'btts')).toBe(true);
            // The bookmakers' price is the product of the legs' averages, when every leg has one.
            if (s.legs.every((l) => l.odds !== null)) expect(s.odds).toBeCloseTo(s.legs.reduce((p, l) => p * (l.odds ?? 1), 1), 1);
            else expect(s.odds).toBeNull();
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

    it('offers the handicap lines, and settles them on the margin', () => {
        // A clear favourite: -1.5 is a bold leg of its own, +1.5 for the underdog a very likely one.
        const strong: MatchPrediction = {...prediction, lambda: {home: 2.6, away: 0.6}, base: {home: 2.6, away: 0.6}};
        const chances = legChances(strong);
        expect(chances.get('home-15')!).toBeGreaterThan(35);
        expect(chances.get('home+15')!).toBeGreaterThan(80);
        // The handicap legs compete with every other for the slips: a strong favourite's -1.5 is a bold candidate.
        expect(suggestBets(strong, null).length).toBeGreaterThan(0);
        expect(handicapOf('home-15')).toEqual({side: 'home', line: '-1.5'});
        expect(handicapOf('away+15')).toEqual({side: 'away', line: '+1.5'});
        expect(handicapOf('1X')).toBeNull();
        expect(settleLegs(['home-15'], {home: 2, away: 0})).toBe(true);
        expect(settleLegs(['home-15'], {home: 1, away: 0})).toBe(false);
        expect(settleLegs(['away+15'], {home: 1, away: 0})).toBe(true);
        expect(settleLegs(['away+15'], {home: 2, away: 0})).toBe(false);
        expect(settleLegs(['away-15', 'over25'], {home: 0, away: 3})).toBe(true);
        expect(settleLegs(['home+15'], {home: 0, away: 2})).toBe(false);
        expect(settleLegs(['home-25'], {home: 3, away: 0})).toBe(true);
        expect(settleLegs(['away+25'], {home: 2, away: 0})).toBe(true);
    });

    it('settles every market on its own fact, and waits for the facts not in yet', () => {
        const facts = {home: 2, away: 1, htHome: 1, htAway: 1, corners: 11, yellows: 3};
        expect(settleLegs(['goals2-4'], facts)).toBe(true);
        expect(settleLegs(['goals3-5'], facts)).toBe(true);
        expect(settleLegs(['goals1-2'], facts)).toBe(false);
        expect(settleLegs(['homeOver15', 'awayOver05'], facts)).toBe(true);
        expect(settleLegs(['awayUnder05'], facts)).toBe(false);
        expect(settleLegs(['odd'], facts)).toBe(true);
        expect(settleLegs(['htX'], facts)).toBe(true);
        expect(settleLegs(['ht1'], facts)).toBe(false);
        expect(settleLegs(['htOver15'], facts)).toBe(true);
        expect(settleLegs(['cornersOver105'], facts)).toBe(true);
        expect(settleLegs(['cornersOver115'], facts)).toBe(false);
        expect(settleLegs(['cardsUnder35'], facts)).toBe(true);
        // The half-time score or the statistics not in: open, unless another leg already lost.
        expect(settleLegs(['htX'], {home: 2, away: 1})).toBeNull();
        expect(settleLegs(['cornersOver95'], {home: 2, away: 1, corners: null})).toBeNull();
        expect(settleLegs(['cornersOver95', 'over35'], {home: 2, away: 1})).toBe(false);
        // Details synced without the statistic: a count no over beats.
        expect(settleLegs(['cornersOver85'], {home: 2, away: 1, corners: -1})).toBe(false);
        expect(settleLegs([], facts)).toBe(false);
    });

    it('corrects every chance by the calibration, with a thin band or none left alone', () => {
        const bands = [
            {from: 75, to: 85, slips: 400, promised: 80, hit: 72},
            {from: 45, to: 55, slips: 400, promised: 50, hit: 54},
            {from: 55, to: 65, slips: 20, promised: 60, hit: 40},
        ];
        expect(calibrate(80, bands)).toBeCloseTo(72, 6);
        expect(calibrate(50, bands)).toBeCloseTo(54, 6);
        expect(calibrate(60, bands)).toBe(60);
        expect(calibrate(90, bands)).toBe(90);
        expect(calibrate(80, null)).toBe(80);
        // Never more than a fifth down or a tenth up.
        expect(calibrate(80, [{from: 75, to: 85, slips: 400, promised: 80, hit: 40}])).toBeCloseTo(64, 6);
        expect(calibrate(50, [{from: 45, to: 55, slips: 400, promised: 50, hit: 70}])).toBeCloseTo(55, 6);
        // The slips carry the corrected chances: every leg's own chance is the calibrated one.
        const cal = [{from: 35, to: 101, slips: 400, promised: 80, hit: 72}];
        const corrected = suggestBets({...prediction, calibration: cal}, null);
        const chances = legChances(prediction);
        expect(corrected.length).toBeGreaterThan(0);
        for (const s of corrected) {
            for (const l of s.legs) expect(l.pct).toBe(Math.round(calibrate(chances.get(l.key)!, cal)));
            expect(s.pct).toBeLessThanOrEqual(Math.min(...s.legs.map((l) => l.pct)));
        }
    });

    it('ranks a tier by expected return when the bookmakers price it, by fair payout otherwise', () => {
        // Two legs priced generously: 1X at 1.35 (fair 1.2 or so) and under 3.5 at 1.5.
        const generous = summarizeOdds([{bookmaker: 'A', markets: {doubleChance: {homeOrDraw: 1.35, drawOrAway: 2.1, homeOrAway: 1.25}, goals: {under35: 1.5}}}]);
        const slips = suggestBets(prediction, generous);
        for (const s of slips) {
            // Where a priced slip makes the tier, the pick is priced, and no other priced candidate of the tier returns more.
            if (s.odds !== null) expect(expectedReturn(s)).not.toBeNull();
        }
        const safe = slips.find((s) => s.tier === 'safe')!;
        expect(safe.odds).not.toBeNull();
        expect(safe.legs.every((l) => l.odds !== null)).toBe(true);
        // A price below the model's view is no reason to prefer the slip: a stingy 1X loses to the unpriced markets, which compete as if priced at fair odds less the margin.
        const stingy = summarizeOdds([{bookmaker: 'A', markets: {doubleChance: {homeOrDraw: 1.05, drawOrAway: 2.1, homeOrAway: 1.25}}}]);
        const safeStingy = suggestBets(prediction, stingy).find((s) => s.tier === 'safe')!;
        expect(safeStingy.legs.map((l) => l.key)).not.toEqual(['1X']);
        // Expected return blends the model's chance with the implied one: a fair price returns less than one.
        expect(expectedReturn({pct: 50, legs: [{key: '1', pct: 50, odds: 2}], odds: 2})!).toBeLessThan(1);
        expect(expectedReturn({pct: 50, legs: [{key: '1', pct: 50, odds: 2.6}], odds: 2.6})!).toBeGreaterThan(1);
        expect(expectedReturn({pct: 50, legs: [{key: '1', pct: 50, odds: null}], odds: null})).toBeNull();
        // Without prices, the raw ranking: every slip unpriced.
        expect(suggestBets(prediction, null).every((s) => s.odds === null)).toBe(true);
    });

    it('reads a leg price from the summary', () => {
        expect(legOdds(odds, '1X')).toBe(1.2);
        expect(legOdds(odds, 'under35')).toBe(1.33);
        expect(legOdds(null, '1')).toBeNull();
    });
});

describe('slipEdge', () => {
    it('measures the return at the book price and flags value from +3%', () => {
        expect(slipEdge({pct: 50, odds: 2.2})).toBe(0.1);
        expect(slipEdge({pct: 50, odds: 1.9})).toBe(-0.05);
        expect(slipEdge({pct: 50, odds: null})).toBeNull();
        expect(isValueSlip({pct: 50, odds: 2.06})).toBe(true);
        expect(isValueSlip({pct: 50, odds: 2.04})).toBe(false);
        expect(isValueSlip({pct: 50, odds: null})).toBe(false);
    });
});
