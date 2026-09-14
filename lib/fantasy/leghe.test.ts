import {describe, expect, it} from 'vitest';
import {buildImportedAuction, parseLegheRoster, suggestCredits} from './leghe';

const EXPORT = `$,$,$
Jagernaut,4518,1
Jagernaut,2764,224
Jagernaut,254,87
$,$,$
Joga Benito,5585,245
Joga Benito,2809,1
Joga Benito,99999,3
$,$,$
`;

describe('parseLegheRoster', () => {
    it('reads the teams, their codes and prices, separators aside', () => {
        const teams = parseLegheRoster(EXPORT);
        expect(teams.map((t) => t.name)).toEqual(['Jagernaut', 'Joga Benito']);
        expect(teams[0].players).toEqual([{code: 4518, price: 1}, {code: 2764, price: 224}, {code: 254, price: 87}]);
        expect(teams[1].players).toHaveLength(3);
    });
    it('copes with a BOM, Windows line ends, semicolons and a comma in a club name', () => {
        const teams = parseLegheRoster('﻿$;$;$\r\nReal, Madrid;2764;10\r\nReal, Madrid;254;5\r\n$;$;$\r\n');
        expect(teams).toEqual([{name: 'Real, Madrid', players: [{code: 2764, price: 10}, {code: 254, price: 5}]}]);
    });
    it('suggests the usual credits, more when a team spent more', () => {
        expect(suggestCredits(parseLegheRoster(EXPORT))).toBe(500);
        expect(suggestCredits([{name: 'x', players: [{code: 1, price: 640}]}])).toBe(700);
    });
});

describe('buildImportedAuction', () => {
    const players = [
        {id: 1, role: 'A' as const, listCode: 2764},
        {id: 2, role: 'D' as const, listCode: 254},
        {id: 3, role: 'A' as const, listCode: 5585},
        {id: 4, role: 'P' as const, listCode: 2809},
        {id: 5, role: 'P' as const, listCode: 4518},
        {id: 6, role: 'C' as const, listCode: null},
    ];
    it('turns the export into an auction: managers, purchases at the prices paid, the unmatched apart', () => {
        const {config, purchases, unmatched} = buildImportedAuction(parseLegheRoster(EXPORT), players, {credits: 500, me: 1, name: 'Lega amici'});
        expect(config.managers).toEqual(['Jagernaut', 'Joga Benito']);
        expect(config.participants).toBe(2);
        expect(config.me).toBe(1);
        expect(config.name).toBe('Lega amici');
        expect(config.league).toBe('serie-a');
        expect(purchases).toEqual([
            {playerId: 5, price: 1, manager: 0},
            {playerId: 1, price: 224, manager: 0},
            {playerId: 2, price: 87, manager: 0},
            {playerId: 3, price: 245, manager: 1},
            {playerId: 4, price: 1, manager: 1},
        ]);
        expect(unmatched).toEqual([{team: 'Joga Benito', code: 99999, price: 3}]);
        expect(config.slots).toEqual({P: 3, D: 8, C: 8, A: 6});
    });
    it('widens a role\'s slots when a team holds more than the default', () => {
        const many = {name: 'Deep', players: Array.from({length: 4}, (_, i) => ({code: 100 + i, price: 1}))};
        const keepers = many.players.map((p, i) => ({id: 10 + i, role: 'P' as const, listCode: p.code}));
        const {config} = buildImportedAuction([many], keepers, {credits: 500, me: 0, name: 'x'});
        expect(config.slots.P).toBe(4);
    });
});
