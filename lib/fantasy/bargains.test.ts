import {describe, expect, it} from 'vitest';
import {bargains} from './bargains';

const P = (id: number, role: 'P' | 'D' | 'C' | 'A', listQuote: number | null) => ({id, role, listQuote});

describe('bargains', () => {
    it('compares site and list as shares of the role', () => {
        // List: 40/40/20. Site: 30/30/40 → the third is worth twice his list share.
        const players = [P(1, 'C', 40), P(2, 'C', 40), P(3, 'C', 20)];
        const prices = new Map([[1, 60], [2, 60], [3, 80]]);
        const out = bargains(players, prices);
        expect(out.get(3)!.index).toBeCloseTo(2);
        expect(out.get(3)!.equivQuote).toBe(40);
        expect(out.get(3)!.bargain).toBe(true);
        expect(out.get(1)!.index).toBeCloseTo(0.75);
        expect(out.get(1)!.bargain).toBe(false);
    });

    it('does not mix the roles', () => {
        const players = [P(1, 'P', 10), P(2, 'A', 10)];
        const prices = new Map([[1, 5], [2, 100]]);
        const out = bargains(players, prices);
        expect(out.get(1)!.index).toBeCloseTo(1);
        expect(out.get(2)!.index).toBeCloseTo(1);
    });

    it('ignores players without a quotation or a price', () => {
        const players = [P(1, 'D', null), P(2, 'D', 10), P(3, 'D', 10)];
        const prices = new Map([[1, 50], [2, 20], [3, 20]]);
        const out = bargains(players, prices);
        expect(out.has(1)).toBe(false);
        expect(out.get(2)!.index).toBeCloseTo(1);
    });

    it('needs a real gap on the list scale, not a doubled 1', () => {
        const players = [P(1, 'A', 1), P(2, 'A', 100), P(3, 'A', 100)];
        const prices = new Map([[1, 3], [2, 100], [3, 100]]);
        const out = bargains(players, prices);
        expect(out.get(1)!.index).toBeGreaterThan(1.4);
        expect(out.get(1)!.equivQuote).toBe(3);
        expect(out.get(1)!.bargain).toBe(false);
    });
});
