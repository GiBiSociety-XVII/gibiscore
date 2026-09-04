import {describe, expect, it} from 'vitest';
import {deriveRole, findRivals, formationSpots, parseFormation, slotRole} from './roles';

describe('slotRole', () => {
    it('reads the back line and the keeper', () => {
        expect(slotRole('4-3-3', 11, null)).toBe('P');
        expect(slotRole('4-3-3', 21, 'C')).toBe('D');
        expect(slotRole('3-5-2', 23, null)).toBe('D');
        expect(slotRole('5-3-2', 25, null)).toBe('D');
    });

    it('makes wing-backs of a back three defenders, the inner men midfielders', () => {
        expect(slotRole('3-5-2', 31, 'C')).toBe('D');
        expect(slotRole('3-5-2', 35, 'D')).toBe('D');
        expect(slotRole('3-5-2', 33, 'C')).toBe('C');
        expect(slotRole('3-4-2-1', 31, 'C')).toBe('D');
        expect(slotRole('3-4-2-1', 32, 'C')).toBe('C');
        expect(slotRole('3-4-3', 34, 'C')).toBe('D');
    });

    it('keeps the wide men of a back four midfielders in a 4-4-2 and attackers on the last line', () => {
        expect(slotRole('4-4-2', 31, 'C')).toBe('C');
        expect(slotRole('4-4-2', 41, 'A')).toBe('A');
        expect(slotRole('4-3-3', 41, 'C')).toBe('A');
        expect(slotRole('4-3-3', 43, 'A')).toBe('A');
    });

    it('splits the line behind the striker: wide men attackers, the central one a midfielder', () => {
        expect(slotRole('4-2-3-1', 41, 'A')).toBe('A');
        expect(slotRole('4-2-3-1', 42, 'A')).toBe('C');
        expect(slotRole('4-2-3-1', 43, 'C')).toBe('A');
        expect(slotRole('4-2-3-1', 51, 'A')).toBe('A');
        expect(slotRole('4-2-3-1', 31, 'C')).toBe('C');
        expect(slotRole('4-1-4-1', 41, 'A')).toBe('A');
        expect(slotRole('4-1-4-1', 42, 'C')).toBe('C');
        expect(slotRole('4-3-1-2', 41, 'C')).toBe('C');
        // Two behind the striker: the provider's position breaks the tie.
        expect(slotRole('3-4-2-1', 41, 'A')).toBe('A');
        expect(slotRole('3-4-2-1', 42, 'C')).toBe('C');
    });

    it('counts the spots of a formation', () => {
        expect(formationSpots('3-5-2')).toEqual({P: 1, D: 5, C: 3, A: 2});
        expect(formationSpots('4-2-3-1')).toEqual({P: 1, D: 4, C: 3, A: 3});
        expect(formationSpots('4-3-3')).toEqual({P: 1, D: 4, C: 3, A: 3});
        expect(parseFormation('4-4-3')).toBeNull();
    });
});

describe('deriveRole', () => {
    it('takes the role he started most in, the current season counting more', () => {
        const call = deriveRole([
            {formation: '3-4-2-1', position: 31, starts: 20, weight: 1},
            {formation: '4-3-3', position: 32, starts: 2, weight: 3},
        ], 'C')!;
        expect(call.role).toBe('D');
        expect(call.source).toBe('lineups');
        expect(call.breakdown).toEqual({D: 20, C: 6});
    });

    it('falls back to the provider position with too few starts', () => {
        expect(deriveRole([{formation: '4-3-3', position: 41, starts: 1}], 'C')).toMatchObject({role: 'C', source: 'fallback'});
        expect(deriveRole([], null)).toBeNull();
    });
});

describe('findRivals', () => {
    it('names the teammates who started in the same slots, most shared first', () => {
        const me = {playerId: 1, slots: new Map([[24, 20], [31, 4]]), total: 24};
        const mates = [
            {playerId: 2, slots: new Map([[24, 12]]), total: 12},
            {playerId: 3, slots: new Map([[31, 30], [24, 2]]), total: 32},
            {playerId: 4, slots: new Map([[21, 30]]), total: 30},
        ];
        expect(findRivals(me, mates)).toEqual([{id: 2, shared: 12}, {id: 3, shared: 6}]);
    });
});
