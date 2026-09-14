import {describe, expect, it} from 'vitest';
import {teamAlerts, type PlayerStatusLite} from './alerts';
import {DEFAULT_RULES, type SavedTeam} from './config';

const team: SavedTeam = {id: 't1', name: 'Mia', leagueName: 'Lega', league: 'serie-a', mode: 'classic', rules: DEFAULT_RULES, modifiers: {defence: true}, defenceBonus: {minDefenders: 4, points: [1, 3, 6]}, formation: null, cupsCount: false, roleOverrides: {}, players: [1, 2, 3, 4, 5], savedAt: '2026-09-14T00:00:00Z'};
const statuses: Record<number, PlayerStatusLite> = {
    1: {name: 'Solet', official: null, sidelined: {category: 'injury', description: 'Knee'}},
    2: {name: 'Bisseck', official: 'bench', sidelined: null},
    3: {name: 'Kamara', official: 'starter', sidelined: null},
    4: {name: 'Thuram', official: null, sidelined: {category: 'doubtful', description: null}},
    5: {name: 'Riserva', official: 'out', sidelined: null},
};

describe('teamAlerts', () => {
    it('warns about the advised starters who are out, benched or in doubt, and about the rest of the roster only when absent', () => {
        const a = teamAlerts(team, statuses, new Set([1, 2, 3, 4]));
        expect(a.hasLineup).toBe(true);
        expect(a.starters.map((x) => `${x.name}:${x.kind}`)).toEqual(['Solet:injury', 'Bisseck:benchOfficial', 'Thuram:doubtful']);
        // The fifth is out of the official lineup but was not advised: nothing to say.
        expect(a.others).toEqual([]);
    });
    it('without a lineup for the round, lists the absences of the whole roster', () => {
        const a = teamAlerts(team, statuses, null);
        expect(a.hasLineup).toBe(false);
        expect(a.starters).toEqual([]);
        expect(a.others.map((x) => x.name)).toEqual(['Solet', 'Thuram']);
    });
});
