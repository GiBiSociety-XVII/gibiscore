import {describe, expect, it} from 'vitest';
import type {FantaRole} from './scores';
import {assignTiers, groupByTier} from './tiers';

const pool = (role: FantaRole, n: number, offset: number) => Array.from({length: n}, (_, i) => ({id: offset + i + 1, role, scores: {overall: 95 - i}}));

describe('assignTiers', () => {
    it('sizes the tiers on how many players the league buys', () => {
        const players = [...pool('A', 70, 0), ...pool('P', 30, 100)];
        const tiers = assignTiers(players, {participants: 8, slots: {P: 3, D: 8, C: 8, A: 6}});
        // Attackers: 48 bought -> 4 top, 6 semi-top, 10 first, 12 second, 17 third, rest filler.
        expect(tiers.get(1)).toBe('top');
        expect(tiers.get(4)).toBe('top');
        expect(tiers.get(5)).toBe('semiTop');
        expect(tiers.get(11)).toBe('first');
        expect(tiers.get(21)).toBe('second');
        expect(tiers.get(33)).toBe('third');
        expect(tiers.get(60)).toBe('filler');
        // Keepers: 24 bought -> 2 top, 3 semi-top, 5 first, 6 second, 8 third.
        expect(tiers.get(101)).toBe('top');
        expect(tiers.get(102)).toBe('top');
        expect(tiers.get(103)).toBe('semiTop');
        expect(tiers.get(125)).toBe('filler');
    });

    it('keeps thin-evidence players out of the top two tiers', () => {
        const players = pool('A', 70, 0).map((p, i) => ({...p, scores: {...p.scores, confidence: (i === 0 ? 'low' : 'high') as 'low' | 'high'}}));
        const tiers = assignTiers(players, {participants: 8, slots: {P: 3, D: 8, C: 8, A: 6}});
        expect(tiers.get(1)).not.toBe('top');
        expect(tiers.get(1)).not.toBe('semiTop');
        expect(tiers.get(2)).toBe('top');
        expect([...tiers.values()].filter((t) => t === 'top')).toHaveLength(4);
    });

    it('groups by role and tier, best first', () => {
        const players = pool('D', 10, 0);
        const grouped = groupByTier(players, assignTiers(players, {participants: 2, slots: {P: 1, D: 3, C: 3, A: 2}}));
        expect(grouped.D.top.map((p) => p.id)).toEqual([1]);
        expect(grouped.D.semiTop.map((p) => p.id)).toEqual([2]);
        expect(grouped.A.top).toEqual([]);
    });
});
