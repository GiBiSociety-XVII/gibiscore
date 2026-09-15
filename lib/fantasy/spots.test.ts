import {describe, expect, it} from 'vitest';
import {keepSpots, sameSpots} from './spots';

const ids = (spots: ReadonlyArray<{id: number}>) => spots.map((s) => s.id);

describe('keepSpots', () => {
    const eleven = [{id: 1, role: 'P' as const}, {id: 2, role: 'D' as const}, {id: 3, role: 'D' as const}, {id: 4, role: 'D' as const}, {id: 5, role: 'C' as const}, {id: 6, role: 'C' as const}, {id: 7, role: 'C' as const}, {id: 8, role: 'A' as const}, {id: 9, role: 'A' as const}, {id: 10, role: 'A' as const}];
    it('lays the first lineup out as it comes', () => {
        expect(ids(keepSpots([], eleven))).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    });
    it('puts the one who comes in where the one who left stood', () => {
        const before = keepSpots([], eleven);
        const swapped = eleven.map((p) => (p.id === 6 ? {id: 66, role: 'C' as const} : p)).sort((a, b) => a.id - b.id);
        expect(ids(keepSpots(before, swapped))).toEqual([1, 2, 3, 4, 5, 66, 7, 8, 9, 10]);
    });
    it('keeps the others still when the line grows or shrinks', () => {
        const before = keepSpots([], eleven);
        const fourAtTheBack = [...eleven.filter((p) => p.id !== 7), {id: 11, role: 'D' as const}];
        expect(ids(keepSpots(before, fourAtTheBack))).toEqual([1, 2, 3, 4, 11, 5, 6, 8, 9, 10]);
        const back = keepSpots(keepSpots(before, fourAtTheBack), eleven);
        expect(ids(back)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    });
    it('tells identical layouts apart from changed ones', () => {
        const a = keepSpots([], eleven);
        expect(sameSpots(a, keepSpots(a, eleven))).toBe(true);
        expect(sameSpots(a, keepSpots(a, eleven.slice(1)))).toBe(false);
    });
});
