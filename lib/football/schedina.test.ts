import {describe, expect, it} from 'vitest';
import type {BetSuggestion} from './markets';
import {atLeast, buildSchedina, combinations, schedinaWon, type SchedinaCandidate} from './schedina';

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
        const s = buildSchedina(candidates, {risk: 'medium', kind: 'system', size: 3, system: 2, days: [], competitions: [], now: NOW})!;
        expect(s.system).toEqual({of: 2, columns: 3, atLeastPct: Math.round(atLeast([0.66, 0.63, 0.7], 2) * 100)});
        expect(s.system!.atLeastPct).toBeGreaterThan(s.pct);
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
    });
});
