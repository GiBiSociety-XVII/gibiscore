import {describe, expect, it} from 'vitest';
import {teamReport, type ReportPlayer} from './report';
import type {FantaRole} from './scores';

let nextId = 1;
function player(role: FantaRole, starter: number, overall: number, fantaAvg: number | null = 6, extra: Partial<ReportPlayer> = {}): ReportPlayer {
    const id = nextId++;
    return {id, name: `${role}${id}`, role, scores: {starter, overall, fantaAvg, bonus: 50, fitness: 80}, injury: null, contested: false, ...extra};
}

const SLOTS = {P: 3, D: 8, C: 8, A: 6};

describe('teamReport', () => {
    it('marks an empty roster with zeros and the slots to fill', () => {
        const r = teamReport([], [], SLOTS);
        expect(r.overall).toBe(0);
        expect(r.filled).toBe(0);
        expect(r.total).toBe(25);
        expect(r.lineup).toBeNull();
        expect(r.roles.map((x) => x.count)).toEqual([0, 0, 0, 0]);
    });

    it('rates the eleven it would field, not the bench', () => {
        const players = [
            player('P', 95, 90),
            player('P', 10, 40),
            ...Array.from({length: 4}, () => player('D', 85, 70)),
            player('D', 20, 30),
            ...Array.from({length: 3}, () => player('C', 80, 75)),
            ...Array.from({length: 3}, () => player('A', 90, 85)),
        ];
        const purchases = players.map((p) => ({playerId: p.id, price: 10, manager: 0}));
        const r = teamReport(players, purchases, SLOTS);
        expect(r.filled).toBe(13);
        expect(r.lineup).not.toBeNull();
        expect(r.formation).toBe('4-3-3');
        // Best eleven: 90 + 4×70 + 3×75 + 3×85 = 850 / 11.
        expect(r.overall).toBe(77);
        expect(r.starters).toBe(11);
        const keepers = r.roles.find((x) => x.role === 'P')!;
        expect(keepers.count).toBe(2);
        expect(keepers.starters).toBe(1);
        expect(keepers.spent).toBe(20);
        expect(keepers.best?.overall).toBe(90);
        expect(keepers.starter).toBe(53);
    });

    it('counts the injured and the contested per role', () => {
        const players = [player('A', 90, 80, 7, {injury: {longTerm: true}}), player('A', 60, 60, 6, {contested: true})];
        const r = teamReport(players, [], SLOTS);
        const attack = r.roles.find((x) => x.role === 'A')!;
        expect(attack.injured).toBe(1);
        expect(attack.contested).toBe(1);
        expect(attack.fantaAvg).toBe(6.5);
        expect(r.injured).toBe(1);
        expect(r.lineup).toBeNull();
        // Two players over eleven places: (80 + 60) / 11.
        expect(r.overall).toBe(13);
    });
});
