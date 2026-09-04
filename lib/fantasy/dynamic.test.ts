import {describe, expect, it} from 'vitest';
import {dynamicPrices, marketState, type PricedPlayer} from './dynamic';
import {suggestPrices, type FantaRole} from './scores';

function pool(): PricedPlayer[] {
    const out: PricedPlayer[] = [];
    let id = 0;
    const make = (role: FantaRole, n: number) => {
        for (let i = 0; i < n; i += 1) {
            id += 1;
            out.push({id, role, scores: {overall: Math.max(5, 92 - i * 2)}});
        }
    };
    make('P', 30);
    make('D', 90);
    make('C', 90);
    make('A', 70);
    return out;
}

const config = {credits: 500, participants: 8, slots: {P: 3, D: 8, C: 8, A: 6}};
const roleShare = {P: 0.06, D: 0.18, C: 0.28, A: 0.48};

describe('dynamicPrices', () => {
    it('equals the list before any purchase', () => {
        const players = pool();
        const list = suggestPrices(players, {...config, roleShare});
        const dyn = dynamicPrices(players, list, config, []);
        expect([...dyn.entries()]).toEqual([...list.entries()]);
    });

    it('raises the remaining tops when the first tops go for list price and the money stays', () => {
        const players = pool();
        const list = suggestPrices(players, {...config, roleShare});
        // A1 and A2 (ids 211, 212) bought at list price by other managers.
        const purchases = [211, 212].map((id) => ({playerId: id, price: list.get(id)!, manager: 1}));
        const dyn = dynamicPrices(players, list, config, purchases);
        expect(dyn.get(213)!).toBeGreaterThan(list.get(213)! * 1.1);
        expect(dyn.get(211)).toBe(list.get(211));
        // A mid-table attacker barely moves.
        expect(Math.abs(dyn.get(240)! - list.get(240)!)).toBeLessThanOrEqual(3);
    });

    it('lowers the remaining tops when the table has already burnt its money', () => {
        const players = pool();
        const list = suggestPrices(players, {...config, roleShare});
        // Every manager blew 400 of 500 on a cheap attacker: nobody can pay for a top any more.
        const purchases = Array.from({length: 8}, (_, i) => ({playerId: 250 + i, price: 400, manager: i}));
        const m = marketState(players, list, config, purchases);
        expect(m.byRole.A.hungry).toBe(0);
        const dyn = dynamicPrices(players, list, config, purchases);
        expect(dyn.get(211)!).toBeLessThan(list.get(211)! * 0.8);
    });

    it('reports the market: money left, slots left, tops left, inflation', () => {
        const players = pool();
        const list = suggestPrices(players, {...config, roleShare});
        const purchases = [211, 212, 213].map((id) => ({playerId: id, price: Math.round(list.get(id)! * 1.3), manager: 1}));
        const m = marketState(players, list, config, purchases);
        expect(m.spent).toBe(purchases.reduce((s, p) => s + p.price, 0));
        expect(m.remaining).toBe(4000 - m.spent);
        expect(m.byRole.A.slotsLeft).toBe(45);
        expect(m.byRole.A.topLeft).toBe(1);
        expect(m.byRole.A.topTotal).toBe(4);
        expect(m.byRole.A.inflation).toBeCloseTo(1.3, 1);
        expect(m.byRole.A.hungry).toBe(7);
        expect(m.byRole.A.scarcity).toBe(7);
        expect(m.byRole.P.slotsLeft).toBe(24);
    });
});
