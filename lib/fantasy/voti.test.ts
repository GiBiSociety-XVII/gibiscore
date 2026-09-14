import {describe, expect, it} from 'vitest';
import {matchVoti, parseVoti, type VotoRow} from './voti';

const rows: VotoRow[] = [
    ['Inter', 'A', 'Martinez L.', 7, 1, 0, 0, 0, 0, 0, 0, 0, 0],
    ['Inter', 'D', 'Bastoni', 6.5, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    ['Atalanta', 'C', 'Ederson', null, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    ['Atalanta', 'P', 'Carnesecchi', 6.5, 0, 1, 0, 0, 0, 0, 0, 0, 0],
];

describe('parseVoti', () => {
    it('reads the rows, a missing vote as null', () => {
        const entries = parseVoti(rows);
        expect(entries).toHaveLength(4);
        expect(entries[0]).toMatchObject({team: 'Inter', role: 'A', name: 'Martinez L.', voto: 7, goals: 1});
        expect(entries[2].voto).toBeNull();
        expect(entries[3].conceded).toBe(1);
    });
});

describe('matchVoti', () => {
    it('matches by club and surname, the initial telling namesakes apart', () => {
        const players = [
            {id: 1, name: 'L. Martínez', team: 'Inter'},
            {id: 2, name: 'J. Martínez', team: 'Inter'},
            {id: 3, name: 'A. Bastoni', team: 'Inter'},
            {id: 4, name: 'Ederson', team: 'Atalanta'},
            {id: 5, name: 'M. Carnesecchi', team: 'Atalanta'},
        ];
        const {byPlayer, unmatched} = matchVoti(parseVoti(rows), players);
        expect(byPlayer.get(1)?.voto).toBe(7);
        expect(byPlayer.has(2)).toBe(false);
        expect(byPlayer.get(3)?.voto).toBe(6.5);
        expect(byPlayer.get(4)?.voto).toBeNull();
        expect(byPlayer.get(5)?.conceded).toBe(1);
        expect(unmatched).toHaveLength(0);
    });
});
