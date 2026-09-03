import {describe, expect, it} from 'vitest';
import {
    asNumber,
    currentSeason,
    extractMinute,
    mapEventKind,
    mapEvents,
    mapFixtureState,
    mapLineups,
    mapPlayerProfile,
    mapPlayerSeason,
    mapPlayerStats,
    mapStandings,
    parseMeasure,
    mapTeamStats,
    positionName,
    seasonName,
    slugify,
} from './mappers';
import type {AfEvent, AfLineup, AfPlayerMatchStats, AfPlayerProfile, AfPlayerSeasonStats, AfStanding, AfTeamStatistics} from './types';

describe('states', () => {
    it('maps status codes', () => {
        expect(mapFixtureState('NS')).toBe('scheduled');
        expect(mapFixtureState('1H')).toBe('live');
        expect(mapFixtureState('HT')).toBe('half_time');
        expect(mapFixtureState('ET')).toBe('extra_time');
        expect(mapFixtureState('P')).toBe('penalties');
        expect(mapFixtureState('PEN')).toBe('finished');
        expect(mapFixtureState('PST')).toBe('postponed');
        expect(mapFixtureState('CANC')).toBe('cancelled');
        expect(mapFixtureState('ABD')).toBe('abandoned');
        expect(mapFixtureState('XYZ')).toBe('unknown');
    });

    it('reports the elapsed minute only while live', () => {
        expect(extractMinute({short: '2H', elapsed: 67}, 'live')).toBe(67);
        expect(extractMinute({short: 'HT', elapsed: 45}, 'half_time')).toBe(45);
        expect(extractMinute({short: 'FT', elapsed: 90}, 'finished')).toBeNull();
    });
});

describe('seasons', () => {
    it('prefers the current season and names it by span', () => {
        const s = currentSeason([
            {year: 2025, start: '2025-08-23', end: '2026-05-24', current: false},
            {year: 2026, start: '2026-08-22', end: '2027-05-23', current: true},
        ]);
        expect(s?.year).toBe(2026);
        expect(seasonName(s!)).toBe('2026/2027');
        expect(seasonName({year: 2026, start: '2026-01-10', end: '2026-11-30'})).toBe('2026');
    });

    it('falls back to the latest season', () => {
        expect(currentSeason([{year: 2024, start: '', end: '', current: false}, {year: 2025, start: '', end: '', current: false}])?.year).toBe(2025);
    });
});

describe('events', () => {
    it('classifies goals, cards, substitutions and VAR', () => {
        expect(mapEventKind({type: 'Goal', detail: 'Normal Goal'})).toBe('goal');
        expect(mapEventKind({type: 'Goal', detail: 'Own Goal'})).toBe('own_goal');
        expect(mapEventKind({type: 'Goal', detail: 'Penalty'})).toBe('penalty');
        expect(mapEventKind({type: 'Goal', detail: 'Missed Penalty'})).toBe('missed_penalty');
        expect(mapEventKind({type: 'Card', detail: 'Yellow Card'})).toBe('yellow_card');
        expect(mapEventKind({type: 'Card', detail: 'Red Card'})).toBe('red_card');
        expect(mapEventKind({type: 'subst', detail: 'Substitution 1'})).toBe('substitution');
        expect(mapEventKind({type: 'Var', detail: 'Goal cancelled'})).toBe('var');
    });

    it('keeps order and player references', () => {
        const events: AfEvent[] = [
            {time: {elapsed: 12, extra: null}, team: {id: 505, name: 'Inter', logo: null}, player: {id: 1, name: 'A'}, assist: {id: 2, name: 'B'}, type: 'Goal', detail: 'Normal Goal', comments: null},
            {time: {elapsed: 45, extra: 2}, team: {id: 496, name: 'Juventus', logo: null}, player: {id: 3, name: 'C'}, assist: {id: null, name: null}, type: 'Card', detail: 'Yellow Card', comments: 'Foul'},
        ];
        const rows = mapEvents(events);
        expect(rows).toHaveLength(2);
        expect(rows[0]).toMatchObject({providerPlayerId: 1, providerRelatedPlayerId: 2, type: 'goal', minute: 12, sortOrder: 0});
        expect(rows[1]).toMatchObject({type: 'yellow_card', minute: 45, extraMinute: 2, info: 'Foul', sortOrder: 1});
    });
});

describe('team statistics', () => {
    it('parses percentages and xG strings', () => {
        const stats: AfTeamStatistics[] = [
            {team: {id: 505, name: 'Inter', logo: null}, statistics: [
                {type: 'Ball Possession', value: '61%'},
                {type: 'Total Shots', value: 11},
                {type: 'Shots on Goal', value: 5},
                {type: 'expected_goals', value: '1.83'},
                {type: 'Passes %', value: '88%'},
                {type: 'Goalkeeper Saves', value: 2},
            ]},
            {team: {id: 496, name: 'Juventus', logo: null}, statistics: [{type: 'Ball Possession', value: '39%'}]},
        ];
        const byTeam = mapTeamStats(stats);
        expect(byTeam.get(505)).toMatchObject({possession: 61, shots_total: 11, shots_on_target: 5, pass_accuracy: 88});
        expect(byTeam.get(505)?.xg).toBeCloseTo(1.83);
        expect(byTeam.get(505)?.stats['Goalkeeper Saves']).toBe(2);
        expect(byTeam.get(496)?.possession).toBe(39);
    });

    it('asNumber tolerates null and junk', () => {
        expect(asNumber(null)).toBeNull();
        expect(asNumber('abc')).toBeNull();
        expect(asNumber('7.3')).toBe(7.3);
    });
});

describe('lineups and player stats', () => {
    const lineup: AfLineup = {
        team: {id: 505, name: 'Inter', logo: null},
        formation: '3-5-2',
        startXI: [
            {player: {id: 10, name: 'Keeper', number: 1, pos: 'G', grid: '1:1'}},
            {player: {id: 11, name: 'Striker', number: 9, pos: 'F', grid: '4:2'}},
        ],
        substitutes: [{player: {id: 12, name: 'Sub', number: 23, pos: 'M', grid: null}}],
        coach: {id: 1, name: 'Coach', photo: null},
    };

    it('splits starters and bench and derives a slot from the grid', () => {
        const rows = mapLineups([lineup]);
        expect(rows).toHaveLength(3);
        expect(rows[0]).toMatchObject({providerPlayerId: 10, isStarter: true, formation: '3-5-2', formationPosition: 11, jerseyNumber: 1});
        expect(rows[2]).toMatchObject({providerPlayerId: 12, isStarter: false, formationPosition: null});
    });

    it('reads rating, minutes, goals and cards', () => {
        const stats: AfPlayerMatchStats = {
            games: {minutes: 90, number: 9, position: 'F', rating: '7.8', captain: false, substitute: false},
            offsides: 1,
            shots: {total: 4, on: 2},
            goals: {total: 2, conceded: null, assists: 1, saves: null},
            passes: {total: 20, key: 3, accuracy: '85%'},
            tackles: {total: 0, blocks: 0, interceptions: 0},
            duels: {total: 10, won: 6},
            dribbles: {attempts: 3, success: 2, past: null},
            fouls: {drawn: 2, committed: 1},
            cards: {yellow: 1, red: 0},
            penalty: {won: null, commited: null, scored: 1, missed: 0, saved: null},
        };
        const rows = mapPlayerStats([{team: {id: 505, name: 'Inter', logo: null}, players: [{player: {id: 11, name: 'Striker', photo: null}, statistics: [stats]}]}]);
        expect(rows).toHaveLength(1);
        expect(rows[0]).toMatchObject({providerPlayerId: 11, minutes_played: 90, rating: 7.8, goals: 2, assists: 1, key_passes: 3, yellow_cards: 1});
        expect(rows[0].stats.penalty_scored).toBe(1);
        expect(rows[0].stats.passes_accuracy).toBe(85);
    });
});

describe('standings', () => {
    const row = (rank: number, id: number, group: string): AfStanding => ({
        rank, team: {id, name: `T${id}`, logo: null}, points: 9 - rank, goalsDiff: 3, group, form: 'WWD', status: 'same', description: null,
        all: {played: 3, win: 2, draw: 1, lose: 0, goals: {for: 6, against: 3}},
        home: {played: 2, win: 1, draw: 1, lose: 0, goals: {for: 3, against: 2}},
        away: {played: 1, win: 1, draw: 0, lose: 0, goals: {for: 3, against: 1}},
        update: '2026-09-03T00:00:00+00:00',
    });

    it('flattens a single-table league into the main group', () => {
        const rows = mapStandings([[row(1, 505, 'Serie A'), row(2, 496, 'Serie A')]]);
        expect(rows).toHaveLength(2);
        expect(rows[0]).toMatchObject({providerTeamId: 505, position: 1, points: 8, played: 3, won: 2, drawn: 1, lost: 0, goalsFor: 6, goalsAgainst: 3, form: 'WWD', group: ''});
    });

    it('keeps group names for cups with several tables', () => {
        const rows = mapStandings([[row(1, 1, 'Group A')], [row(1, 2, 'Group B')]]);
        expect(rows.map((r) => r.group)).toEqual(['Group A', 'Group B']);
    });
});

describe('helpers', () => {
    it('slugify and positionName', () => {
        expect(slugify('Atalanta BC', 499)).toBe('atalanta-bc-499');
        expect(positionName('Goalkeeper')).toBe('goalkeeper');
        expect(positionName('F')).toBe('attacker');
        expect(positionName(null)).toBeNull();
    });
});

describe('player seasons', () => {
    it('parses heights and weights', () => {
        expect(parseMeasure('180 cm')).toBe(180);
        expect(parseMeasure('75 kg')).toBe(75);
        expect(parseMeasure(null)).toBeNull();
        expect(parseMeasure('')).toBeNull();
    });

    it('maps a player profile', () => {
        const profile: AfPlayerProfile = {
            id: 1, name: 'N. González', firstname: 'Nicolás', lastname: 'González', age: 28,
            birth: {date: '1998-04-06', place: 'Escobar', country: 'Argentina'}, nationality: 'Argentina',
            height: '180 cm', weight: '78 kg', injured: false, photo: 'https://x/1.png',
        };
        const row = mapPlayerProfile(profile, 'Attacker');
        expect(row.provider_id).toBe(1);
        expect(row.date_of_birth).toBe('1998-04-06');
        expect(row.height_cm).toBe(180);
        expect(row.weight_kg).toBe(78);
        expect(row.position).toBe('attacker');
        expect(row.slug).toBe('n-gonzalez-1');
    });

    it('flattens season statistics', () => {
        const stats: AfPlayerSeasonStats = {
            team: {id: 496, name: 'Juventus', logo: null},
            league: {id: 135, name: 'Serie A', country: 'Italy', logo: null, flag: null, season: 2026},
            games: {appearences: 3, lineups: 2, minutes: 190, number: 11, position: 'Attacker', rating: '7.233333', captain: false},
            substitutes: {in: 1, out: 0, bench: 1},
            shots: {total: 8, on: 4},
            goals: {total: 2, conceded: 0, assists: 1, saves: null},
            passes: {total: 60, key: 5, accuracy: 82},
            tackles: {total: 3, blocks: null, interceptions: 1},
            duels: {total: 30, won: 14},
            dribbles: {attempts: 10, success: 6, past: null},
            fouls: {drawn: 4, committed: 2},
            cards: {yellow: 1, yellowred: 0, red: 0},
            penalty: {won: null, commited: null, scored: 1, missed: 0, saved: null},
        };
        const row = mapPlayerSeason(stats);
        expect(row.season_year).toBe(2026);
        expect(row.rating).toBe(7.23);
        expect(row.goals).toBe(2);
        expect(row.assists).toBe(1);
        expect(row.passes_accuracy).toBe(82);
        expect(row.penalties_scored).toBe(1);
        expect(row.position).toBe('attacker');
        expect(row.saves).toBeNull();
    });
});
