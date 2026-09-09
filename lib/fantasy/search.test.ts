import {describe, expect, it} from 'vitest';
import {foldText, playerMatches} from './search';

describe('foldText', () => {
    it('drops accents and case', () => {
        expect(foldText('Gonçalves')).toBe('goncalves');
        expect(foldText('Calò')).toBe('calo');
        expect(foldText('Guðmundsson')).toBe('guðmundsson');
    });
});

describe('playerMatches', () => {
    const pote = {name: 'Pote', fullName: 'Pedro António Pereira Gonçalves', team: {name: 'Fiorentina'}};
    it('finds a player by the name the provider does not show', () => {
        expect(playerMatches(pote, 'goncalves')).toBe(true);
        expect(playerMatches(pote, 'Gonçalves')).toBe(true);
        expect(playerMatches(pote, 'pote')).toBe(true);
        expect(playerMatches(pote, 'fiorent')).toBe(true);
        expect(playerMatches(pote, 'pellegrini')).toBe(false);
    });
    it('accents typed or not', () => {
        const calo = {name: 'G. Calò', fullName: null, team: {name: 'Frosinone'}};
        expect(playerMatches(calo, 'calo')).toBe(true);
        expect(playerMatches(calo, 'Calò')).toBe(true);
    });
    it('an empty query matches everyone', () => {
        expect(playerMatches(pote, '  ')).toBe(true);
    });
});
