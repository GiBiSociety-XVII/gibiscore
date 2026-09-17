import {describe, expect, it} from 'vitest';
import {covers, provides, type LeagueCoverage} from './coverage';

const full: LeagueCoverage = {fixtures: {events: true, lineups: true, statistics_fixtures: true, statistics_players: true}, standings: true, players: true, top_scorers: true, injuries: true, predictions: true, odds: true};
const thin: LeagueCoverage = {fixtures: {events: true, lineups: false, statistics_fixtures: false, statistics_players: false}, standings: true, players: false, top_scorers: false, injuries: false, predictions: true, odds: false};
const lineupsOnly: LeagueCoverage = {fixtures: {events: true, lineups: true, statistics_fixtures: false, statistics_players: false}, standings: false};

describe('covers', () => {
    it('reads every piece of a full coverage', () => {
        for (const key of ['events', 'lineups', 'teamStats', 'playerStats', 'detail', 'standings', 'players', 'injuries', 'odds'] as const) expect(covers(full, key)).toBe(true);
    });
    it('sees what a thin league lacks', () => {
        expect(covers(thin, 'events')).toBe(true);
        expect(covers(thin, 'standings')).toBe(true);
        expect(covers(thin, 'lineups')).toBe(false);
        expect(covers(thin, 'detail')).toBe(false);
        expect(covers(thin, 'players')).toBe(false);
        expect(covers(thin, 'odds')).toBe(false);
    });
    it('counts lineups alone as detail worth asking', () => {
        expect(covers(lineupsOnly, 'detail')).toBe(true);
        expect(covers(lineupsOnly, 'playerStats')).toBe(false);
    });
    it('treats unknown coverage as none', () => {
        expect(covers(null, 'events')).toBe(false);
        expect(covers(undefined, 'detail')).toBe(false);
        expect(covers({}, 'standings')).toBe(false);
    });
});

describe('provides', () => {
    it('asks a featured league for everything, whatever it declares', () => {
        expect(provides('featured', thin, 'playerStats')).toBe(true);
        expect(provides('featured', null, 'odds')).toBe(true);
    });
    it('asks a basic league only for what it covers', () => {
        expect(provides('basic', thin, 'standings')).toBe(true);
        expect(provides('basic', thin, 'lineups')).toBe(false);
        expect(provides('basic', null, 'standings')).toBe(false);
    });
});
