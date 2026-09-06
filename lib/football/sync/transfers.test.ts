import {describe, expect, it} from 'vitest';
import {seasonWindowStart, squadChanges} from './transfers';

describe('squadChanges', () => {
    const moves = [
        {playerId: 1, name: 'In', date: '2026-08-20', inTeam: 10, outTeam: 20},
        {playerId: 2, name: 'Out', date: '2026-08-25', inTeam: 30, outTeam: 10},
        {playerId: 3, name: 'Back and forth', date: '2026-07-01', inTeam: 10, outTeam: 40},
        {playerId: 3, name: 'Back and forth', date: '2026-08-30', inTeam: 40, outTeam: 10},
        {playerId: 4, name: 'Old', date: '2025-01-15', inTeam: 10, outTeam: 50},
        {playerId: 5, name: 'Future', date: '2026-12-01', inTeam: 10, outTeam: 60},
        {playerId: 6, name: 'Elsewhere', date: '2026-08-01', inTeam: 70, outTeam: 80},
    ];
    const changes = squadChanges(moves, 10, seasonWindowStart(2026), '2026-09-06');

    it('takes arrivals and departures inside the window, the last move deciding', () => {
        expect([...changes.arrivals.keys()]).toEqual([1]);
        expect(changes.arrivals.get(1)).toBe('In');
        expect([...changes.departures]).toEqual([2, 3]);
    });

    it('ignores old moves, announced future moves and other clubs', () => {
        expect(changes.arrivals.has(4)).toBe(false);
        expect(changes.arrivals.has(5)).toBe(false);
        expect(changes.arrivals.has(6)).toBe(false);
        expect(changes.departures.has(6)).toBe(false);
    });
});
