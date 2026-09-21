import {describe, expect, it} from 'vitest';
import {isLater, liveOf, mergeLive, sameLive, type LiveFixture} from './live';

const at = (iso: string | null, over: Partial<LiveFixture> = {}): LiveFixture => ({id: 1, state: 'live', minute: 20, extraMinute: null, syncedAt: iso, homeScore: 0, awayScore: 0, ...over});

const T1 = '2026-09-21T15:00:00.000Z';
const T2 = '2026-09-21T15:00:20.000Z';

describe('isLater', () => {
    it('takes anything over nothing', () => {
        expect(isLater(at(T1), undefined)).toBe(true);
    });

    it('goes by when the sync wrote the row', () => {
        expect(isLater(at(T2), at(T1))).toBe(true);
        expect(isLater(at(T1), at(T2))).toBe(false);
    });

    it('lets a later reading take a goal back', () => {
        const scored = at(T1, {homeScore: 1});
        const disallowed = at(T2, {homeScore: 0});
        expect(isLater(disallowed, scored)).toBe(true);
    });

    it('keeps what it has when the two readings are the same', () => {
        expect(isLater(at(T1), at(T1))).toBe(false);
    });

    it('without a stamp, prefers the reading that has gone further', () => {
        expect(isLater(at(null, {minute: 30}), at(null, {minute: 20}))).toBe(true);
        expect(isLater(at(null, {minute: 20}), at(null, {minute: 30}))).toBe(false);
        expect(isLater(at(null, {state: 'finished', minute: null}), at(null))).toBe(true);
        expect(isLater(at(null), at(null, {state: 'finished', minute: null}))).toBe(false);
    });

    it('a reading with no stamp does not beat one that has it', () => {
        expect(isLater(at(null, {homeScore: 5}), at(T1))).toBe(false);
    });
});

describe('mergeLive', () => {
    it('lays over only what is later, and keeps the map when nothing is', () => {
        const have = new Map([[1, at(T2)], [2, at(T2, {id: 2})]]);
        expect(mergeLive(have, [at(T1, {homeScore: 9})])).toBe(have);
        const next = mergeLive(have, [at('2026-09-21T15:00:40.000Z', {homeScore: 1})]);
        expect(next).not.toBe(have);
        expect(next.get(1)!.homeScore).toBe(1);
        expect(next.get(2)).toBe(have.get(2));
    });

    it('adds a match it did not know', () => {
        const next = mergeLive(new Map(), [at(T1, {id: 7})]);
        expect(next.size).toBe(1);
        expect(next.get(7)!.id).toBe(7);
    });
});

describe('sameLive', () => {
    it('is true only when nothing on the row differs', () => {
        expect(sameLive(at(T1), at(T1))).toBe(true);
        expect(sameLive(at(T1), at(T1, {minute: 21}))).toBe(false);
    });
});

describe('liveOf', () => {
    it('takes a row of any read model down to the columns that move', () => {
        expect(liveOf({id: 3, state: 'scheduled', minute: null, homeScore: null, awayScore: null})).toEqual({id: 3, state: 'scheduled', minute: null, extraMinute: null, syncedAt: null, homeScore: null, awayScore: null});
    });
});
