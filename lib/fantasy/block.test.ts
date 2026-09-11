import {describe, expect, it} from 'vitest';
import {keeperBlocks} from './block';

describe('keeperBlocks', () => {
    it('groups the keepers by club, the first keeper first, the others as backups', () => {
        const players = [
            {id: 1, role: 'P' as const, team: {id: 10}, scores: {starter: 8, overall: 60}},
            {id: 2, role: 'P' as const, team: {id: 10}, scores: {starter: 98, overall: 85}},
            {id: 3, role: 'P' as const, team: {id: 10}, scores: {starter: 1, overall: 20}},
            {id: 4, role: 'P' as const, team: {id: 20}, scores: {starter: 95, overall: 80}},
            {id: 5, role: 'D' as const, team: {id: 10}, scores: {starter: 90, overall: 75}},
        ];
        const b = keeperBlocks(players);
        expect(b.byTeam.get(10)).toEqual([2, 1, 3]);
        expect(b.byTeam.get(20)).toEqual([4]);
        expect(b.starterOf.get(3)).toBe(2);
        expect([...b.backups].sort()).toEqual([1, 3]);
        expect(b.starterOf.has(5)).toBe(false);
    });
});
