import {describe, expect, it} from 'vitest';
import {suggestPrices, type FantaRole} from './scores';
import {planStrategy, rankStrategies, slotFractions, STRATEGIES, type PoolPlayer} from './strategies';

function pool(): PoolPlayer[] {
    const out: PoolPlayer[] = [];
    let id = 0;
    const make = (role: FantaRole, n: number) => {
        for (let i = 0; i < n; i += 1) {
            id += 1;
            const overall = Math.max(5, 92 - i * 2);
            out.push({id, name: `${role}${i + 1}`, role, team: {name: 'T'}, penaltyTaker: false, scores: {overall, starter: Math.min(100, overall + 5), fantaAvg: 5.5 + overall / 40}});
        }
    };
    make('P', 30);
    make('D', 90);
    make('C', 90);
    make('A', 70);
    return out;
}

const config = {credits: 500, participants: 8, slots: {P: 3, D: 8, C: 8, A: 6}, modifiers: {defence: false, captain: false, fairPlay: false, midfield: false}};

describe('slotFractions', () => {
    it('sums to one and gets steeper with focus', () => {
        const flat = slotFractions(6, 0.2);
        const steep = slotFractions(6, 0.8);
        expect(flat.reduce((s, v) => s + v, 0)).toBeCloseTo(1, 5);
        expect(steep[0]).toBeGreaterThan(flat[0]);
        expect(steep[5]).toBeLessThan(flat[5]);
    });
});

describe('planStrategy', () => {
    it('fills every slot inside the budget', () => {
        const players = pool();
        const prices = suggestPrices(players, {credits: 500, participants: 8, slots: config.slots, roleShare: {P: 0.08, D: 0.16, C: 0.28, A: 0.48}});
        const plan = planStrategy(STRATEGIES[0], players, prices, config);
        expect(plan.picks.P).toHaveLength(3);
        expect(plan.picks.A).toHaveLength(6);
        expect(plan.spent).toBeLessThanOrEqual(500);
        for (const role of ['P', 'D', 'C', 'A'] as const) expect(plan.picks[role].reduce((s, p) => s + p.price, 0)).toBeLessThanOrEqual(plan.budget[role]);
        expect(plan.lineupValue).toBeGreaterThan(60);
    });

    it('spends more on attack with the attack strategy', () => {
        const players = pool();
        const prices = suggestPrices(players, {credits: 500, participants: 8, slots: config.slots, roleShare: {P: 0.08, D: 0.16, C: 0.28, A: 0.48}});
        const attack = planStrategy(STRATEGIES.find((s) => s.key === 'topAttack')!, players, prices, config);
        const mid = planStrategy(STRATEGIES.find((s) => s.key === 'strongMidfield')!, players, prices, config);
        expect(attack.picks.A[0].overall).toBeGreaterThanOrEqual(mid.picks.A[0].overall);
        expect(mid.picks.C.reduce((s, p) => s + p.price, 0)).toBeGreaterThan(attack.picks.C.reduce((s, p) => s + p.price, 0));
    });

    it('skips players already taken', () => {
        const players = pool();
        const prices = suggestPrices(players, {credits: 500, participants: 8, slots: config.slots, roleShare: {P: 0.08, D: 0.16, C: 0.28, A: 0.48}});
        const plan = planStrategy(STRATEGIES[0], players, prices, config, new Set([1]));
        expect(plan.picks.P.some((p) => p.id === 1)).toBe(false);
    });
});

describe('preferences', () => {
    it('penalty takers strategy picks the taker over a slightly better non-taker', () => {
        const players = pool();
        players[220].penaltyTaker = true; // A11, overall 72, behind A1..A10
        const prices = suggestPrices(players, {credits: 500, participants: 8, slots: config.slots, roleShare: {P: 0.08, D: 0.16, C: 0.28, A: 0.48}});
        const plan = planStrategy(STRATEGIES.find((s) => s.key === 'penaltyTakers')!, players, prices, config);
        expect(plan.picks.A.some((p) => p.id === players[220].id)).toBe(true);
    });

    it('young upside prefers the younger of two equal players', () => {
        const players = pool();
        players[210].age = 33; // A1, overall 92
        players[211].age = 21; // A2, overall 90
        for (const p of players) if (p.age === undefined) p.age = 27;
        const prices = suggestPrices(players, {credits: 500, participants: 8, slots: config.slots, roleShare: {P: 0.08, D: 0.16, C: 0.28, A: 0.48}});
        // Enough credits that the first attacker slot can afford either: the younger one wins.
        const plan = planStrategy(STRATEGIES.find((s) => s.key === 'youngUpside')!, players, prices, {...config, credits: 1000});
        expect(plan.picks.A[0].id).toBe(players[211].id);
    });
});

describe('rankStrategies', () => {
    it('ranks available strategies first and marks the defence block unavailable without the modifier', () => {
        const players = pool();
        const prices = suggestPrices(players, {credits: 500, participants: 8, slots: config.slots, roleShare: {P: 0.08, D: 0.16, C: 0.28, A: 0.48}});
        const ranked = rankStrategies(players, prices, config);
        expect(ranked).toHaveLength(STRATEGIES.length);
        expect(ranked[ranked.length - 1].key).toBe('defenceBlock');
        expect(ranked[ranked.length - 1].available).toBe(false);
        expect(rankStrategies(players, prices, {...config, modifiers: {...config.modifiers, defence: true}}).every((p) => p.available)).toBe(true);
    });
});
