import {describe, expect, it} from 'vitest';
import {applyTrade, releasePlayer, tradeIssues, type RosterPlayer} from './trade';
import {creditsLeft, type Purchase} from './config';

const players = new Map<number, RosterPlayer>([[1, {id: 1, role: 'A'}], [2, {id: 2, role: 'A'}], [3, {id: 3, role: 'D'}], [4, {id: 4, role: 'C'}], [5, {id: 5, role: 'A'}]]);
const purchases: Purchase[] = [{playerId: 1, price: 100, manager: 0}, {playerId: 3, price: 20, manager: 0}, {playerId: 2, price: 60, manager: 1}, {playerId: 4, price: 10, manager: 1}, {playerId: 5, price: 5, manager: 1}];
const config = {credits: 500, slots: {P: 3, D: 8, C: 8, A: 2}, ledger: []};

describe('applyTrade', () => {
    it('moves the players at their price and writes the balance to the ledger', () => {
        const out = applyTrade(config, purchases, {a: {manager: 0, players: [1]}, b: {manager: 1, players: [2]}, credits: 15}, 'x', 'now');
        expect(out.purchases.find((p) => p.playerId === 1)).toMatchObject({manager: 1, price: 100});
        expect(out.purchases.find((p) => p.playerId === 2)).toMatchObject({manager: 0, price: 60});
        expect(out.ledger).toEqual([{manager: 0, credits: -15, kind: 'trade', note: 'x', at: 'now'}, {manager: 1, credits: 15, kind: 'trade', note: 'x', at: 'now'}]);
        // a gave away 100 of roster value, took 60 and paid 15: 55 more to spend; b the opposite.
        expect(creditsLeft({credits: 500, ledger: out.ledger}, out.purchases, 0)).toBe(500 - 80 - 15);
        expect(creditsLeft({credits: 500, ledger: out.ledger}, out.purchases, 1)).toBe(500 - 115 + 15);
    });
    it('writes nothing to the ledger without a balance', () => {
        expect(applyTrade(config, purchases, {a: {manager: 0, players: [1]}, b: {manager: 1, players: [2]}, credits: 0}).ledger).toEqual([]);
    });
});

describe('tradeIssues', () => {
    it('lets a fair swap through', () => {
        expect(tradeIssues(config, purchases, players, {a: {manager: 0, players: [1]}, b: {manager: 1, players: [2]}, credits: 0})).toEqual([]);
    });
    it('refuses an empty trade, the same manager on both sides and a player not owned', () => {
        expect(tradeIssues(config, purchases, players, {a: {manager: 0, players: []}, b: {manager: 1, players: []}, credits: 0})).toEqual([{kind: 'empty'}]);
        expect(tradeIssues(config, purchases, players, {a: {manager: 0, players: [1]}, b: {manager: 0, players: [2]}, credits: 0})).toEqual([{kind: 'same'}]);
        expect(tradeIssues(config, purchases, players, {a: {manager: 0, players: [2]}, b: {manager: 1, players: []}, credits: 0})).toEqual([{kind: 'notOwned', manager: 0, playerId: 2}]);
    });
    it('refuses a roster with more players of a role than the slots', () => {
        // Manager 0 takes two attackers for a defender: three attackers against two slots.
        const issues = tradeIssues(config, purchases, players, {a: {manager: 0, players: [3]}, b: {manager: 1, players: [2, 5]}, credits: 0});
        expect(issues).toEqual([{kind: 'roleFull', manager: 0, role: 'A', count: 3, max: 2}]);
    });
    it('refuses a balance the payer cannot afford with his open slots', () => {
        const poor = {...config, credits: 130};
        // Manager 0 has spent 120 of 130; after the swap 80, plus a 45 balance: 5 left for 19 open slots.
        const issues = tradeIssues(poor, purchases, players, {a: {manager: 0, players: [1]}, b: {manager: 1, players: [2]}, credits: 45});
        expect(issues).toEqual([{kind: 'credits', manager: 0, left: 5}]);
    });
});

describe('releasePlayer', () => {
    it('drops the player and books the part of the price not refunded', () => {
        const out = releasePlayer(config, purchases, [1], 50, 'half', 'now');
        expect(out.purchases.some((p) => p.playerId === 1)).toBe(false);
        expect(out.ledger).toEqual([{manager: 0, credits: -50, kind: 'release', note: 'half', at: 'now'}]);
        expect(creditsLeft({credits: 500, ledger: out.ledger}, out.purchases, 0)).toBe(500 - 20 - 50);
    });
    it('a full refund leaves the ledger alone; a refund above the price credits the difference', () => {
        expect(releasePlayer(config, purchases, [1], 100).ledger).toEqual([]);
        expect(releasePlayer(config, purchases, [3], 25, '', 'now').ledger).toEqual([{manager: 0, credits: 5, kind: 'release', note: '', at: 'now'}]);
    });
});
