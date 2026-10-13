import {describe, expect, it} from 'vitest';
import type {BetSuggestion} from './markets';
import {atLeast, autoSystemOf, bankerOf, buildSchedina, combinations, settledReturn, schedinaColumns, schedinaLost, schedinaWon, stakePlan, suggestedStakes, systemGroups, ticketPlan, toStakeStep, type SchedinaCandidate} from './schedina';

const slip = (tier: BetSuggestion['tier'], pct: number, odds: number | null = null): BetSuggestion => ({tier, legs: [{key: '1', pct, odds}], pct, fair: Math.round((100 / pct) * 100) / 100, odds});
const match = (id: number, day: string, hour: string, competitionId: number, slips: BetSuggestion[]): SchedinaCandidate => ({fixtureId: id, competitionId, competition: `L${competitionId}`, home: `H${id}`, away: `A${id}`, startingAt: `${day}T${hour}:00Z`, day, slips});
const NOW = '2026-09-18T10:00:00Z';
const candidates = [
    match(1, '2026-09-18', '18:45', 1, [slip('safe', 85, 1.15), slip('balanced', 66, 1.5), slip('bold', 46, 2.1)]),
    match(2, '2026-09-18', '20:45', 1, [slip('safe', 80, 1.22), slip('balanced', 63, 1.6)]),
    match(3, '2026-09-19', '15:00', 2, [slip('balanced', 70, 1.4), slip('bold', 48, 2.0)]),
    match(4, '2026-09-19', '18:00', 2, [slip('safe', 79), slip('bold', 45)]),
    match(5, '2026-09-18', '08:00', 1, [slip('safe', 90, 1.1)]),
];

describe('buildSchedina', () => {
    it('takes the most likely selections of the risk, in kick-off order, and multiplies chance and odds', () => {
        const s = buildSchedina(candidates, {risk: 'medium', kind: 'multiple', size: 3, days: [], competitions: [], now: NOW})!;
        expect(s.selections.map((x) => x.fixtureId)).toEqual([1, 2, 3]);
        expect(s.selections.map((x) => x.tier)).toEqual(['balanced', 'balanced', 'balanced']);
        expect(s.pct).toBe(Math.round(0.66 * 0.63 * 0.7 * 100));
        expect(s.fair).toBeCloseTo(1.52 * 1.59 * 1.43, 1);
        expect(s.book).toBeCloseTo(1.5 * 1.6 * 1.4, 2);
        expect(s.firstKickoff).toBe('2026-09-18T18:45:00Z');
        expect(s.lastKickoff).toBe('2026-09-19T15:00:00Z');
    });
    it('falls back to a safer tier when the match has none of the risk asked, and never to a riskier one', () => {
        const s = buildSchedina(candidates, {risk: 'medium', kind: 'multiple', size: 4, days: [], competitions: [], now: NOW})!;
        expect(s.selections.find((x) => x.fixtureId === 4)!.tier).toBe('safe');
        const low = buildSchedina(candidates, {risk: 'low', kind: 'multiple', size: 3, days: [], competitions: [], now: NOW})!;
        expect(low.selections.every((x) => x.tier === 'safe')).toBe(true);
        expect(low.selections.some((x) => x.fixtureId === 3)).toBe(false);
    });
    it('respects the days and the competitions, and leaves out what already kicked off', () => {
        const s = buildSchedina(candidates, {risk: 'high', kind: 'multiple', size: 2, days: ['2026-09-19'], competitions: [2], now: NOW})!;
        expect(s.selections.map((x) => x.fixtureId)).toEqual([3, 4]);
        expect(buildSchedina(candidates, {risk: 'low', kind: 'single', size: 1, days: ['2026-09-18'], competitions: [], now: NOW})!.selections[0].fixtureId).toBe(1);
        expect(buildSchedina(candidates, {risk: 'low', kind: 'multiple', size: 5, days: [], competitions: [], now: NOW})).toBeNull();
    });
    it('describes a system by its columns and the chance of enough winners', () => {
        const s = buildSchedina(candidates, {risk: 'medium', kind: 'system', size: 3, system: 2, bankers: 0, days: [], competitions: [], now: NOW})!;
        expect(s.system).toEqual({of: 2, free: 3, bankers: 0, columns: 3, atLeastPct: Math.round(atLeast([0.66, 0.63, 0.7], 2) * 100)});
        expect(s.system!.atLeastPct).toBeGreaterThan(s.pct);
        expect(s.selections.every((x) => !x.banker)).toBe(true);
    });
    it('makes bankers of the matches with the surest leg, in every column, and combines the free ones', () => {
        const s = buildSchedina(candidates, {risk: 'low', kind: 'system', size: 3, system: 1, bankers: 'auto', days: [], competitions: [], now: NOW})!;
        // 85 and 80 are sure enough (>= 80), at most size - 2 = 1 (and a third of three): only the surest.
        expect(s.selections.filter((x) => x.banker).map((x) => x.fixtureId)).toEqual([1]);
        // High risk, five selections: a fifth of them at most, one banker, whatever is sure.
        const high = buildSchedina([...candidates, match(6, '2026-09-19', '20:45', 1, [slip('safe', 90, 1.1), slip('bold', 50, 2)]), match(7, '2026-09-19', '20:45', 1, [slip('safe', 88, 1.12), slip('bold', 48, 2.1)])], {risk: 'high', kind: 'system', size: 5, system: 'auto', bankers: 'auto', days: [], competitions: [], now: NOW})!;
        expect(high.system!.bankers).toBe(1);
        expect(high.selections.filter((x) => !x.banker).every((x) => x.tier === 'bold')).toBe(true);
        expect(s.system).toEqual({of: 1, free: 2, bankers: 1, columns: 2, atLeastPct: Math.round(0.85 * atLeast([0.8, 0.79], 1) * 100)});
        // Medium risk, two bankers asked: the two matches the model is surest of (1 at 85, 2 at 80) are the bankers, on their surest leg; the free selections are the medium picks of the other matches.
        const two = buildSchedina(candidates, {risk: 'medium', kind: 'system', size: 4, system: 1, bankers: 2, days: [], competitions: [], now: NOW})!;
        expect(two.selections.filter((x) => x.banker).map((x) => x.fixtureId).sort()).toEqual([1, 2]);
        expect(two.selections.filter((x) => !x.banker).map((x) => x.fixtureId).sort()).toEqual([3, 4]);
        expect(two.selections.find((x) => x.fixtureId === 1)!.slip.pct).toBe(85);
        expect(two.selections.find((x) => x.fixtureId === 3)!.tier).toBe('balanced');
        expect(two.system!.free).toBe(2);
        // Never more bankers than size - 2, whatever is asked.
        const capped = buildSchedina(candidates, {risk: 'medium', kind: 'system', size: 3, system: 1, bankers: 5, days: [], competitions: [], now: NOW})!;
        expect(capped.system!.bankers).toBe(1);
    });
    it('reads a banker as the best-paying sure leg of a match, not the tier\'s combination', () => {
        // The safe slip is a two-leg combination at 79%; its legs alone are 1X at 88% (1.25) and under 3.5 at 86% (1.30): both sure, the banker is the one that pays more.
        const combo: BetSuggestion = {tier: 'safe', legs: [{key: '1X', pct: 88, odds: 1.25}, {key: 'under35', pct: 86, odds: 1.3}], pct: 79, fair: 1.27, odds: 1.63};
        const bold: BetSuggestion = {tier: 'bold', legs: [{key: 'home-15', pct: 46, odds: 2.4}], pct: 46, fair: 2.17, odds: 2.4};
        const b = bankerOf(match(9, '2026-09-20', '20:45', 1, [combo, bold]))!;
        expect(b.banker).toBe(true);
        expect(b.slip.legs.map((l) => l.key)).toEqual(['under35']);
        expect(b.slip.pct).toBe(86);
        expect(b.slip.odds).toBe(1.3);
        expect(b.slip.fair).toBeCloseTo(1.16, 2);
        expect(b.tier).toBe('safe');
        // "Over 0.5" at 93% paying 1.03 is not the banker when under 3.5 at 86% pays 1.30.
        const cheap: BetSuggestion = {tier: 'safe', legs: [{key: 'over05', pct: 93, odds: 1.03}], pct: 93, fair: 1.08, odds: 1.03};
        expect(bankerOf(match(11, '2026-09-20', '20:45', 1, [cheap, combo]))!.slip.legs[0].key).toBe('under35');
        // Nothing sure: the surest leg there is.
        const shaky: BetSuggestion = {tier: 'balanced', legs: [{key: '1', pct: 64, odds: 1.6}, {key: 'over15', pct: 75, odds: 1.3}], pct: 62, fair: 1.61, odds: 2.08};
        expect(bankerOf(match(12, '2026-09-20', '20:45', 1, [shaky]))!.slip.legs[0].key).toBe('over15');
        expect(bankerOf(match(10, '2026-09-20', '20:45', 1, []))).toBeNull();
        // A system takes the banker on that leg, and the free selections from the other matches' slips of the risk.
        const s = buildSchedina([...candidates, match(9, '2026-09-20', '20:45', 1, [combo, bold])], {risk: 'high', kind: 'system', size: 3, system: 1, bankers: 1, days: [], competitions: [], now: NOW})!;
        const banker = s.selections.find((x) => x.banker)!;
        expect(banker.fixtureId).toBe(9);
        expect(banker.slip.legs.map((l) => l.key)).toEqual(['under35']);
        expect(s.selections.filter((x) => !x.banker).every((x) => x.tier === 'bold')).toBe(true);
    });
});

describe('atLeast and combinations', () => {
    it('count right', () => {
        expect(combinations(5, 2)).toBe(10);
        expect(combinations(3, 3)).toBe(1);
        expect(atLeast([0.5, 0.5], 1)).toBeCloseTo(0.75, 6);
        expect(atLeast([0.5, 0.5], 2)).toBeCloseTo(0.25, 6);
        expect(atLeast([0.9, 0.8, 0.7], 3)).toBeCloseTo(0.504, 6);
    });
});

describe('schedinaWon', () => {
    it('needs every selection for a single or an accumulator, enough for a system', () => {
        expect(schedinaWon('single', [true], null)).toBe(true);
        expect(schedinaWon('multiple', [true, true, false], null)).toBe(false);
        expect(schedinaWon('multiple', [true, true, true], null)).toBe(true);
        expect(schedinaWon('system', [true, true, false], 2)).toBe(true);
        expect(schedinaWon('system', [true, false, false], 2)).toBe(false);
        expect(schedinaWon('multiple', [], null)).toBe(false);
        // A banker lost: the whole system is lost, whatever the free ones did.
        expect(schedinaWon('system', [false, true, true], 1, [true, false, false])).toBe(false);
        expect(schedinaWon('system', [true, true, false], 1, [true, false, false])).toBe(true);
        expect(schedinaWon('system', [true, false, false], 1, [true, false, false])).toBe(false);
    });
});

describe('columns, automatic k and the stake plan', () => {
    const NOW2 = '2026-09-18T10:00:00Z';
    const priced = [
        match(11, '2026-09-18', '18:45', 1, [slip('balanced', 80, 1.4)]),
        match(12, '2026-09-18', '20:45', 1, [slip('balanced', 70, 1.5)]),
        match(13, '2026-09-19', '15:00', 1, [slip('balanced', 60, 1.9)]),
        match(14, '2026-09-19', '18:00', 1, [slip('balanced', 55, 2.0)]),
    ];
    it('lists every column with the bankers in each', () => {
        const s = buildSchedina(priced, {risk: 'medium', kind: 'system', size: 4, system: 2, bankers: 1, days: [], competitions: [], now: NOW2})!;
        const columns = schedinaColumns(s.selections, 2);
        expect(columns).toHaveLength(3);
        for (const c of columns) expect(c.indices).toContain(s.selections.findIndex((x) => x.banker));
        expect(columns[0].odds).toBeCloseTo(1.4 * 1.5 * 1.9, 1);
        expect(columns[0].probability).toBeCloseTo(0.8 * 0.7 * 0.6, 6);
    });
    it('picks the k with the best expected return, and N-1 without prices', () => {
        const s = buildSchedina(priced, {risk: 'medium', kind: 'system', size: 4, system: 'auto', bankers: 0, days: [], competitions: [], now: NOW2})!;
        expect(s.system!.of).toBe(autoSystemOf(s.selections));
        expect(s.system!.of).toBeGreaterThanOrEqual(1);
        const noPrices = [match(21, '2026-09-18', '18:45', 1, [slip('balanced', 70)]), match(22, '2026-09-18', '20:45', 1, [slip('balanced', 65)]), match(23, '2026-09-19', '15:00', 1, [slip('balanced', 62)])];
        const unpriced = buildSchedina(noPrices, {risk: 'medium', kind: 'system', size: 3, system: 'auto', bankers: 0, days: [], competitions: [], now: NOW})!;
        expect(unpriced.system!.of).toBe(2);
    });
    it('lists the lines of a system ticket and values the stakes on them', () => {
        const s = buildSchedina(priced, {risk: 'medium', kind: 'system', size: 4, system: 2, bankers: 1, days: [], competitions: [], now: NOW2})!;
        const groups = systemGroups(s.selections);
        // One banker, three free: lines 3 su 3 (1 column), 2 su 3 (3), 1 su 3 (3).
        expect(groups.map((g) => [g.k, g.n, g.columns.length])).toEqual([[3, 3, 1], [2, 3, 3], [1, 3, 3]]);
        expect(groups[0].atLeastPct).toBeLessThan(groups[2].atLeastPct);
        const full = suggestedStakes(groups, 70, 'full');
        expect(full.every((v) => v === 10)).toBe(true);
        const recommended = suggestedStakes(groups, 70, 'recommended');
        expect(recommended.some((v) => v > 0)).toBe(true);
        const plan = stakePlan(s.selections, groups, full);
        expect(plan.total).toBe(70);
        expect(plan.lines[0].lineStake).toBe(10);
        expect(plan.lines[1].lineStake).toBe(30);
        expect(plan.maxPayout).toBeCloseTo(plan.lines.reduce((sum, l) => sum + l.linePayout, 0), 2);
        expect(plan.profitChance).toBeGreaterThan(0);
        expect(plan.profitChance).toBeLessThanOrEqual(100);
        expect(stakePlan(s.selections, groups, [0, 0, 0]).total).toBe(0);
        const single = buildSchedina(priced, {risk: 'medium', kind: 'single', size: 1, days: [], competitions: [], now: NOW2})!;
        const one = systemGroups(single.selections);
        expect(one).toHaveLength(1);
        expect(stakePlan(single.selections, one, [10]).maxPayout).toBe(14);
    });
});

describe('toStakeStep', () => {
    it('keeps stakes on five-cent steps, never above what was asked', () => {
        expect(toStakeStep(5.12)).toBe(5.1);
        expect(toStakeStep(5.15)).toBe(5.15);
        expect(toStakeStep(5.14)).toBe(5.1);
        expect(toStakeStep(0.03)).toBe(0);
        expect(toStakeStep(10)).toBe(10);
        const stakes = suggestedStakes(systemGroups(buildSchedina([match(31, '2026-09-18', '18:45', 1, [slip('balanced', 70, 1.5)]), match(32, '2026-09-18', '20:45', 1, [slip('balanced', 65, 1.6)]), match(33, '2026-09-19', '15:00', 1, [slip('balanced', 62, 1.7)])], {risk: 'medium', kind: 'system', size: 3, system: 2, bankers: 0, days: [], competitions: [], now: '2026-09-18T10:00:00Z'})!.selections), 33.33, 'full');
        for (const v of stakes) expect(Math.round(v * 100) % 5).toBe(0);
    });
});

describe('ticketPlan', () => {
    it('values an accumulator at the book odds', () => {
        const plan = ticketPlan({pct: 40, fair: 2.5, book: 2.8}, 10);
        expect(plan.payout).toBe(28);
        expect(plan.expectedReturn).toBe(11.2);
        expect(plan.expectedProfit).toBe(1.2);
        expect(plan.winChance).toBe(40);
        expect(plan.priced).toBe(true);
    });
    it('falls back to the fair odds, a bet at par', () => {
        const plan = ticketPlan({pct: 40, fair: 2.5, book: null}, 10);
        expect(plan.payout).toBe(25);
        expect(plan.expectedReturn).toBe(10);
        expect(plan.expectedProfit).toBe(0);
        expect(plan.priced).toBe(false);
    });
    it('never stakes below zero', () => {
        expect(ticketPlan({pct: 50, fair: 2, book: 2}, -5).stake).toBe(0);
    });
});

describe('schedinaLost', () => {
    it('kills an accumulator with the first lost selection, and waits otherwise', () => {
        expect(schedinaLost('multiple', [true, false, null, null], null)).toBe(true);
        expect(schedinaLost('multiple', [true, null, null], null)).toBe(false);
        expect(schedinaLost('single', [null], null)).toBe(false);
    });
    it('kills a system with a lost banker or too few free selections left', () => {
        expect(schedinaLost('system', [false, null, null, null], 2, [true, false, false, false])).toBe(true);
        expect(schedinaLost('system', [true, false, false, null], 2, [true, false, false, false])).toBe(true);
        expect(schedinaLost('system', [true, false, null, null], 2, [true, false, false, false])).toBe(false);
        expect(schedinaLost('system', [false, false, null], 1, undefined)).toBe(false);
        expect(schedinaLost('system', [false, false, false], 1, undefined)).toBe(true);
    });
});

describe('settledReturn', () => {
    it('pays a single or an accumulator its payout when every selection won, nothing otherwise', () => {
        const sel = [{pct: 60, odds: 1.6}, {pct: 50, odds: 2}];
        expect(settledReturn('multiple', sel, [true, true], 32, null)).toBe(32);
        expect(settledReturn('multiple', sel, [true, false], 32, null)).toBe(0);
        expect(settledReturn('single', [sel[0]], [true], 16, null)).toBe(16);
        expect(settledReturn('multiple', sel, [true, true], null, null)).toBe(0);
    });
    it('pays a system every column of every line whose selections won, the bankers in each', () => {
        // One banker (1.2) and three free selections (2, 1.5, 3); line 2 of 3 at 1 € a column, line 3 of 3 at 2 €.
        const sel = [{banker: true, pct: 85, odds: 1.2}, {pct: 50, odds: 2}, {pct: 66, odds: 1.5}, {pct: 33, odds: 3}];
        const lines = [{k: 2, stake: 1}, {k: 3, stake: 2}];
        // The first two free selections won: one column of the 2-of-3 line pays 1 × 1.2 × 2 × 1.5 = 3.6; the 3-of-3 line pays nothing.
        expect(settledReturn('system', sel, [true, true, true, false], 99, lines)).toBeCloseTo(3.6, 2);
        // Everything won: three columns of 2 (3.6 + 7.2 + 5.4) and the 3-of-3 column at 2 € (2 × 1.2 × 9 = 21.6).
        expect(settledReturn('system', sel, [true, true, true, true], 99, lines)).toBeCloseTo(3.6 + 7.2 + 5.4 + 21.6, 2);
        // The banker lost: nothing.
        expect(settledReturn('system', sel, [false, true, true, true], 99, lines)).toBe(0);
        // No price on a selection: its fair odds stand in.
        expect(settledReturn('system', [{banker: false, pct: 50, odds: null}, {banker: false, pct: 50, odds: 2}], [true, true], 9, [{k: 2, stake: 1}])).toBeCloseTo(4, 2);
        expect(settledReturn('system', sel, [true, true, true, true], 99, null)).toBe(0);
    });
});
