import {describe, expect, it} from 'vitest';
import {bargains} from './bargains';

const P = (id: number, role: 'P' | 'D' | 'C' | 'A', listQuote: number | null, value = 0) => ({id, role, listQuote, value});

describe('bargains', () => {
    it('a cheap player the site ranks high is a bargain; the tops are not', () => {
        // The list: 40, 30, 20, 10, 4, 1. The site puts player 5 (quoted 4) third: the third quotation is 20.
        const players = [P(1, 'A', 40), P(2, 'A', 30), P(3, 'A', 20), P(4, 'A', 10), P(5, 'A', 4), P(6, 'A', 1)];
        const prices = new Map([[1, 200], [2, 150], [3, 60], [4, 40], [5, 100], [6, 1]]);
        const out = bargains(players, prices);
        expect(out.get(5)).toMatchObject({rank: 3, quote: 4, equivQuote: 20, bargain: true});
        expect(out.get(5)!.index).toBeCloseTo(5);
        // The best-paid top ranks first and the list agrees: his price is his job.
        expect(out.get(1)).toMatchObject({rank: 1, equivQuote: 40, bargain: false});
        // A top the site likes more than the list still is not "cheap".
        expect(out.get(2)).toMatchObject({rank: 2, equivQuote: 30, bargain: false});
    });

    it('a top the site ranks even higher is never a bargain: he is not cheap', () => {
        const players = [P(1, 'C', 30), P(2, 'C', 28), P(3, 'C', 15), P(4, 'C', 2)];
        const prices = new Map([[1, 100], [2, 120], [3, 200], [4, 1]]);
        const out = bargains(players, prices);
        expect(out.get(3)!.equivQuote).toBe(30);
        expect(out.get(3)!.bargain).toBe(false);
    });

    it('ranks inside the role only', () => {
        const players = [P(1, 'P', 10), P(2, 'P', 1), P(3, 'A', 40), P(4, 'A', 1)];
        const prices = new Map([[1, 20], [2, 5], [3, 200], [4, 5]]);
        const out = bargains(players, prices);
        expect(out.get(2)).toMatchObject({rank: 2, equivQuote: 1, bargain: false});
        expect(out.get(4)).toMatchObject({rank: 2, equivQuote: 1, bargain: false});
    });

    it('needs a real gap, and skips players without a quotation or a price', () => {
        const players = [P(1, 'D', 1), P(2, 'D', 3), P(3, 'D', 12), P(4, 'D', null)];
        const prices = new Map([[1, 30], [2, 20], [3, 40], [4, 90]]);
        const out = bargains(players, prices);
        // Player 1 ranks second: the second quotation is 3, two above his own: not enough.
        expect(out.get(1)).toMatchObject({rank: 2, equivQuote: 3, bargain: false});
        expect(out.has(4)).toBe(false);
    });

    it('breaks equal prices by the site mark', () => {
        const players = [P(1, 'A', 20, 70), P(2, 'A', 5, 80), P(3, 'A', 1, 60)];
        const prices = new Map([[1, 50], [2, 50], [3, 10]]);
        const out = bargains(players, prices);
        expect(out.get(2)!.rank).toBe(1);
        expect(out.get(1)!.rank).toBe(2);
    });
});
