import {describe, expect, it} from 'vitest';
import {matchListone, normalizeName, parseListone, sameTeam, splitDbName} from './listone';

describe('names', () => {
    it('normalizes accents, apostrophes and odd letters', () => {
        expect(normalizeName('K. Yıldız')).toBe('k yildiz');
        expect(normalizeName('A. N&apos;Diaye')).toBe("a n'diaye");
        expect(normalizeName('A. Guðmundsson')).toBe('a gudmundsson');
        expect(normalizeName('Ł. Skorupski')).toBe('l skorupski');
    });

    it('splits database names into initial and surname', () => {
        expect(splitDbName('M. Svilar')).toMatchObject({initial: 'm', surname: 'svilar'});
        expect(splitDbName('David de Gea')).toMatchObject({initial: 'd', surname: 'de gea'});
        expect(splitDbName('Hermoso')).toMatchObject({initial: null, surname: 'hermoso'});
        expect(splitDbName('R. Floriani Mussolini')).toMatchObject({surname: 'floriani mussolini'});
    });

    it('reads the list, with initials', () => {
        const entries = parseListone([['P', 'Martinez J.', 'Inter', 29], ['D', 'De Gea', 'Fiorentina', 16], ['X', 'Nobody', '', 1]]);
        expect(entries).toHaveLength(2);
        expect(entries[0]).toMatchObject({surname: 'martinez', initial: 'j', team: 'inter', role: 'P'});
        expect(entries[1]).toMatchObject({surname: 'de gea', initial: null});
    });

    it('finds the club inside the database club name', () => {
        expect(sameTeam('milan', 'AC Milan')).toBe(true);
        expect(sameTeam('roma', 'AS Roma')).toBe(true);
        expect(sameTeam('inter', 'Inter')).toBe(true);
        expect(sameTeam('', 'Inter')).toBe(false);
    });
});

describe('matchListone', () => {
    const players = [
        {id: 1, name: 'Josep Martínez', team: 'Inter'},
        {id: 2, name: 'Lautaro Martínez', team: 'Inter'},
        {id: 3, name: 'A. Zambo Anguissa', team: 'Napoli'},
        {id: 4, name: 'V. Milinković-Savić', team: 'Napoli'},
        {id: 5, name: 'L. Pellegrini', team: 'AS Roma'},
        {id: 6, name: 'L. Pellegrini', team: 'Lazio'},
        {id: 7, name: 'E. Del Prato', team: 'Parma'},
        {id: 8, name: 'M. Kean', team: 'Fiorentina'},
        {id: 9, name: 'Mamedi Doucoure', team: 'Genoa'},
        {id: 10, name: 'Mamedi Doucoure', team: 'Genoa'},
        {id: 11, name: 'F. Bordon', team: 'Lazio'},
        {id: 12, name: 'Ricardo Bordon', team: 'Lazio'},
    ];
    const rows: Array<[string, string, string, number]> = [
        ['P', 'Martinez J.', 'Inter', 29], ['A', 'Martinez L.', 'Inter', 79], ['C', 'Anguissa', 'Napoli', 42], ['P', 'Milinkovic', 'Napoli', 11],
        ['C', 'Pellegrini Lo.', 'Roma', 14], ['D', 'Pellegrini Lu.', 'Lazio', 11], ['D', 'Delprato', 'Parma', 12], ['A', 'Kean', 'Como', 60],
        ['D', 'Doucoure', 'Genoa', 3], ['D', 'Bordon', 'Lazio', 2], ['P', 'Suzuki', '', 20],
    ];
    const {byPlayer, unmatched} = matchListone(parseListone(rows), players);

    it('tells namesakes apart by initial and club', () => {
        expect(byPlayer.get(1)).toMatchObject({role: 'P', quote: 29});
        expect(byPlayer.get(2)).toMatchObject({role: 'A', quote: 79});
        expect(byPlayer.get(5)!.role).toBe('C');
        expect(byPlayer.get(6)!.role).toBe('D');
    });

    it('matches partial surnames and spacing differences', () => {
        expect(byPlayer.get(3)!.role).toBe('C');
        expect(byPlayer.get(4)!.role).toBe('P');
        expect(byPlayer.get(7)!.role).toBe('D');
    });

    it('ignores the club when the surname is unique in the whole database', () => {
        expect(byPlayer.get(8)).toMatchObject({role: 'A', quote: 60});
    });

    it('gives the same person listed twice one role, and gives up on real ambiguity', () => {
        expect(byPlayer.get(9)!.role).toBe('D');
        expect(byPlayer.get(10)!.role).toBe('D');
        expect(byPlayer.has(11)).toBe(false);
        expect(byPlayer.has(12)).toBe(false);
        expect(unmatched.map((e) => e.name)).toEqual(['Bordon', 'Suzuki']);
    });
});
