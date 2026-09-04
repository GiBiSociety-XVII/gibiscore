import {describe, expect, it} from 'vitest';
import type {FantaRole} from './scores';
import {assignTiers, explainTiers, groupByTier, TIERS, type TierPlayer} from './tiers';

const pool = (role: FantaRole, n: number, offset: number) => Array.from({length: n}, (_, i) => ({id: offset + i + 1, role, scores: {overall: 95 - i}}));
const config = {participants: 8, slots: {P: 3, D: 8, C: 8, A: 6}};

describe('assignTiers', () => {
    it('sizes the seven ranked tiers on how many players the league buys', () => {
        const players = [...pool('A', 70, 0), ...pool('P', 30, 100)];
        const tiers = assignTiers(players, config);
        // Attackers: 48 bought -> 4 top, 6 semi-top, 8 first, 9 second, 9 third, 7 fourth, 6 fifth, the rest by profile.
        expect(tiers.get(1)).toBe('top');
        expect(tiers.get(4)).toBe('top');
        expect(tiers.get(5)).toBe('semiTop');
        expect(tiers.get(11)).toBe('first');
        expect(tiers.get(19)).toBe('second');
        expect(tiers.get(28)).toBe('third');
        expect(tiers.get(37)).toBe('fourth');
        expect(tiers.get(44)).toBe('fifth');
        expect(tiers.get(49)).toBe('fifth');
        expect(tiers.get(60)).toBe('filler');
        // Keepers: 24 bought -> 2 top, 3 semi-top, 4 first, 4 second, 4 third, 4 fourth, 3 fifth.
        expect(tiers.get(101)).toBe('top');
        expect(tiers.get(102)).toBe('top');
        expect(tiers.get(103)).toBe('semiTop');
        expect(tiers.get(124)).toBe('fifth');
        expect(tiers.get(125)).toBe('filler');
        expect(TIERS).toHaveLength(10);
    });

    it('keeps thin-evidence players out of the top two tiers', () => {
        const players = pool('A', 70, 0).map((p, i) => ({...p, scores: {...p.scores, confidence: (i === 0 ? 'low' : 'high') as 'low' | 'high'}}));
        const tiers = assignTiers(players, config);
        expect(tiers.get(1)).not.toBe('top');
        expect(tiers.get(1)).not.toBe('semiTop');
        expect(tiers.get(2)).toBe('top');
        expect([...tiers.values()].filter((t) => t === 'top')).toHaveLength(4);
    });

    it('marks the bets and the players to avoid below the bought ones', () => {
        const players: TierPlayer[] = pool('A', 70, 0).map((p) => ({...p, age: 28, scores: {...p.scores, starter: 60, fitness: 70, bonus: 40, form: 50, confidence: 'high' as const}}));
        // 55th attacker: 21 years old with bonus in him -> jolly. 56th: hot start -> jolly.
        players[54].age = 21;
        players[54].scores = {...players[54].scores, bonus: 55};
        players[55].scores = {...players[55].scores, form: 70};
        // 57th: never plays -> avoid. 58th: long-term injury -> avoid. 59th: a plain filler.
        players[56].scores = {...players[56].scores, starter: 10};
        const injured = {...players[57], injury: {longTerm: true}};
        players[57] = injured;
        // 65th: young with bonus but far below the bar -> a filler, not a bet.
        players[64].age = 20;
        players[64].scores = {...players[64].scores, bonus: 60};
        const tiers = assignTiers(players, config);
        expect(tiers.get(65)).toBe('filler');
        expect(tiers.get(55)).toBe('jolly');
        expect(tiers.get(56)).toBe('jolly');
        expect(tiers.get(57)).toBe('avoid');
        expect(tiers.get(58)).toBe('avoid');
        expect(tiers.get(59)).toBe('filler');
    });

    it('sends a long-term injury below the first tier to avoid, but keeps a thin-evidence newcomer as a bet', () => {
        const players: TierPlayer[] = pool('C', 90, 0).map((p) => ({...p, scores: {...p.scores, starter: 60, fitness: 70, confidence: 'high' as const}}));
        players[30] = {...players[30], injury: {longTerm: true}}; // ranked 31st of 64 bought: third tier by ranking
        players[65] = {...players[65], scores: {...players[65].scores, starter: 10, confidence: 'low' as const}}; // no data yet, marks just under the bar (64 bought)
        const tiers = assignTiers(players, config);
        expect(tiers.get(31)).toBe('avoid');
        expect(tiers.get(66)).toBe('jolly');
    });

    it('explains every tier with its rank and the rule that put him there', () => {
        const players: TierPlayer[] = pool('A', 70, 0).map((p) => ({...p, age: 28, scores: {...p.scores, starter: 60, fitness: 70, bonus: 40, form: 50, confidence: 'high' as const}}));
        players[0] = {...players[0], scores: {...players[0].scores, confidence: 'low', sample: 3}};
        players[54] = {...players[54], age: 21, scores: {...players[54].scores, bonus: 55}};
        players[57] = {...players[57], injury: {longTerm: true, daysOut: 120}};
        const infos = explainTiers(players, config);
        expect(infos.get(2)).toMatchObject({tier: 'top', rank: 1, ofRole: 70, bought: 48, why: [{kind: 'ranked', tier: 'top', from: 1, to: 4}]});
        // Thin evidence: top by mark alone, ranked after the first ten solid players instead.
        const thin = infos.get(1)!;
        expect(thin.tier).toBe('first');
        expect(thin.rank).toBe(11);
        expect(thin.why).toContainEqual({kind: 'thinDropped', from: 'top', sample: 3});
        expect(infos.get(55)!.why).toEqual([{kind: 'belowBought'}, {kind: 'young', age: 21, bonus: 55}]);
        expect(infos.get(58)!.why).toEqual([{kind: 'belowBought'}, {kind: 'longInjury', daysOut: 120}]);
        expect(infos.get(60)!.why).toEqual([{kind: 'belowBought'}, {kind: 'filler'}]);
    });

    it('groups by role and tier, best first', () => {
        const players = pool('D', 10, 0);
        const grouped = groupByTier(players, assignTiers(players, {participants: 2, slots: {P: 1, D: 3, C: 3, A: 2}}));
        expect(grouped.D.top.map((p) => p.id)).toEqual([1]);
        expect(grouped.D.semiTop.map((p) => p.id)).toEqual([2]);
        expect(grouped.A.top).toEqual([]);
        expect(Object.keys(grouped.D)).toEqual(TIERS);
    });
});
