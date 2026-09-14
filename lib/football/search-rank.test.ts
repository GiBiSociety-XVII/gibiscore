import {describe, expect, it} from 'vitest';
import {foldName, playerScore, prefixMatch, rankBy, teamScore} from './search-rank';

describe('foldName', () => {
    it('drops accents and special letters, lower case', () => {
        expect(foldName('Højlund')).toBe('hojlund');
        expect(foldName('H. Çalhanoğlu')).toBe('h. calhanoglu');
        expect(foldName('Lautaro Martínez')).toBe('lautaro martinez');
        expect(foldName('Łukasz Skorupski')).toBe('lukasz skorupski');
        expect(foldName('Đorđe Petrović')).toBe('dorde petrovic');
        expect(foldName('Müller-Straße ')).toBe('muller-strasse');
    });
});

describe('prefixMatch', () => {
    it('matches the start of the name or of a word in it, accents ignored', () => {
        expect(prefixMatch('Lautaro Martínez', 'lautaro')).toBe(2);
        expect(prefixMatch('Lautaro Martínez', 'martin')).toBe(1);
        expect(prefixMatch('Lautaro Martínez', 'utaro')).toBe(0);
        expect(prefixMatch('Rasmus Højlund', 'hoj')).toBe(1);
    });
});

describe('ranking', () => {
    it('puts the Serie A player with a team above namesakes without one, and the big leagues above the small', () => {
        const hits = [
            {name: 'Lautaro Blanco', hasTeam: false},
            {name: 'Lautaro Martínez', hasTeam: true, leagueSlug: 'serie-a', leagueTier: 'featured', minutes: 2800},
            {name: 'Lautaro Comas', hasTeam: true, leagueSlug: 'primera-b', leagueTier: 'basic', minutes: 900},
            {name: 'Lautaro Díaz', hasTeam: true, leagueSlug: 'premier-league', leagueTier: 'featured', minutes: 400},
        ];
        const ranked = rankBy(hits, (p) => playerScore(p, 'lautaro')).map((p) => p.name);
        expect(ranked[0]).toBe('Lautaro Martínez');
        expect(ranked[1]).toBe('Lautaro Díaz');
        expect(ranked[2]).toBe('Lautaro Comas');
        expect(ranked[3]).toBe('Lautaro Blanco');
    });

    it('prefers a name that starts with the query at equal standing', () => {
        const hits = [
            {name: 'Marco Lautaro', hasTeam: true, leagueSlug: 'serie-a'},
            {name: 'Lautaro Marco', hasTeam: true, leagueSlug: 'serie-a'},
        ];
        expect(rankBy(hits, (p) => playerScore(p, 'lautaro'))[0].name).toBe('Lautaro Marco');
        expect(rankBy(hits, (p) => playerScore(p, 'marco'))[0].name).toBe('Marco Lautaro');
    });

    it('ranks teams by the competition they play, Inter before Inter Miami', () => {
        const teams = [{name: 'Inter Miami', leagueSlug: 'mls', leagueTier: 'basic'}, {name: 'Inter', leagueSlug: 'serie-a', leagueTier: 'featured'}];
        expect(rankBy(teams, (t) => teamScore(t, 'inter'))[0].name).toBe('Inter');
    });
});
