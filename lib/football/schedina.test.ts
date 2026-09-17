import {describe, expect, it} from 'vitest';
import type {BetSuggestion} from './markets';
import {atLeast, autoSystemOf, buildSchedina, combinations, schedinaColumns, schedinaWon, stakePlan, suggestedStakes, systemGroups, type SchedinaCandidate} from './schedina';

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
    it('makes bankers of the safest selections, in every column, and combines the free ones', () => {
        // Low risk, four matches: 85, 80, 79 and (fallback none: low has safe only) -> only 1, 2, 4 are safe... use size 3 with bankers auto.
        const s = buildSchedina(candidates, {risk: 'low', kind: 'system', size: 3, system: 1, bankers: 'auto', days: [], competitions: [], now: NOW})!;
        // 85 and 80 are bankers (>= 75), at most size - 2 = 1: only the safest.
        expect(s.selections.filter((x) => x.banker).map((x) => x.fixtureId)).toEqual([1]);
        expect(s.system).toEqual({of: 1, free: 2, bankers: 1, columns: 2, atLeastPct: Math.round(0.85 * atLeast([0.8, 0.79], 1) * 100)});
        const two = buildSchedina(candidates, {risk: 'medium', kind: 'system', size: 4, system: 1, bankers: 2, days: [], competitions: [], now: NOW})!;
        expect(two.selections.filter((x) => x.banker).map((x) => x.fixtureId).sort()).toEqual([3, 4]);
        expect(two.system!.free).toBe(2);
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
