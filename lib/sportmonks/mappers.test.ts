import {describe, expect, it} from 'vitest';
import {
    extractMinute,
    extractScores,
    mapEventKind,
    mapFixtureState,
    mapLineups,
    mapStanding,
    mapTeamStats,
    slugify,
    splitParticipants,
    toIsoUtc,
} from './mappers';
import type {SmFixture, SmStanding, SmTeam} from './types';

const home: SmTeam = {id: 53, name: 'Celtic', short_code: 'CEL', meta: {location: 'home', winner: true}};
const away: SmTeam = {id: 62, name: 'Kilmarnock', short_code: 'KIL', meta: {location: 'away', winner: false}};

describe('states', () => {
    it('maps by developer_name when the state include is present', () => {
        expect(mapFixtureState({state_id: 99, state: {id: 22, state: 'INPLAY_2ND_HALF', name: '2nd Half', short_name: '2nd', developer_name: 'INPLAY_2ND_HALF'}})).toBe('live');
        expect(mapFixtureState({state_id: 99, state: {id: 3, state: 'HT', name: 'Half Time', short_name: 'HT', developer_name: 'HT'}})).toBe('half_time');
        expect(mapFixtureState({state_id: 99, state: {id: 8, state: 'FT_PEN', name: 'After Penalties', short_name: 'FTP', developer_name: 'FT_PEN'}})).toBe('finished');
    });

    it('falls back to the documented ids', () => {
        expect(mapFixtureState({state_id: 1})).toBe('scheduled');
        expect(mapFixtureState({state_id: 5})).toBe('finished');
        expect(mapFixtureState({state_id: 10})).toBe('postponed');
        expect(mapFixtureState({state_id: 12})).toBe('cancelled');
        expect(mapFixtureState({state_id: 4242})).toBe('unknown');
    });
});

describe('participants and scores', () => {
    it('uses meta.location, not array order', () => {
        const split = splitParticipants([away, home]);
        expect(split?.home.id).toBe(53);
        expect(split?.away.id).toBe(62);
    });

    it('returns null when a location is missing', () => {
        expect(splitParticipants([home, {id: 1, name: 'x'}])).toBeNull();
    });

    it('reads CURRENT and 1ST_HALF scores', () => {
        const scores = extractScores([
            {id: 1, fixture_id: 1, participant_id: 53, score: {goals: 4, participant: 'home'}, description: 'CURRENT'},
            {id: 2, fixture_id: 1, participant_id: 62, score: {goals: 0, participant: 'away'}, description: 'CURRENT'},
            {id: 3, fixture_id: 1, participant_id: 53, score: {goals: 2, participant: 'home'}, description: '1ST_HALF'},
            {id: 4, fixture_id: 1, participant_id: 62, score: {goals: 0, participant: 'away'}, description: '1ST_HALF'},
            {id: 5, fixture_id: 1, participant_id: 53, score: {goals: 2, participant: 'home'}, description: '2ND_HALF'},
        ]);
        expect(scores.current).toEqual({home: 4, away: 0});
        expect(scores.halfTime).toEqual({home: 2, away: 0});
    });

    it('returns nulls when there are no scores yet', () => {
        expect(extractScores(undefined).current).toEqual({home: null, away: null});
    });
});

describe('minute and dates', () => {
    it('takes the minute of the ticking period', () => {
        const minute = extractMinute(
            [
                {id: 1, fixture_id: 1, ticking: false, minutes: 45},
                {id: 2, fixture_id: 1, ticking: true, minutes: 67},
            ],
            'live',
        );
        expect(minute).toBe(67);
    });

    it('reports 45 at half time when nothing ticks', () => {
        expect(extractMinute([{id: 1, fixture_id: 1, ticking: false, minutes: 45}], 'half_time')).toBe(45);
        expect(extractMinute(undefined, 'scheduled')).toBeNull();
    });

    it('treats Sportmonks timestamps as UTC', () => {
        expect(toIsoUtc('2024-08-04 14:00:00')).toBe('2024-08-04T14:00:00Z');
    });
});

describe('events', () => {
    it('maps by developer_name and by id', () => {
        expect(mapEventKind({type_id: 999, type: {id: 14, name: 'Goal', developer_name: 'GOAL'}})).toBe('goal');
        expect(mapEventKind({type_id: 15})).toBe('own_goal');
        expect(mapEventKind({type_id: 18})).toBe('substitution');
        expect(mapEventKind({type_id: 126})).toBe('other');
    });
});

describe('team statistics', () => {
    it('groups by participant and maps known types', () => {
        const byTeam = mapTeamStats([
            {id: 1, fixture_id: 1, type_id: 45, participant_id: 53, data: {value: 61}},
            {id: 2, fixture_id: 1, type_id: 42, participant_id: 53, data: {value: 11}, type: {id: 42, name: 'Shots Total', developer_name: 'SHOTS_TOTAL'}},
            {id: 3, fixture_id: 1, type_id: 5304, participant_id: 53, data: {value: '1.83'}},
            {id: 4, fixture_id: 1, type_id: 45, participant_id: 62, data: {value: 39}},
            {id: 5, fixture_id: 1, type_id: 77777, participant_id: 62, data: {value: 3}, type: {id: 77777, name: 'Throw ins', developer_name: 'THROWINS'}},
        ]);
        expect(byTeam.get(53)?.possession).toBe(61);
        expect(byTeam.get(53)?.shots_total).toBe(11);
        expect(byTeam.get(53)?.xg).toBeCloseTo(1.83);
        expect(byTeam.get(62)?.possession).toBe(39);
        expect(byTeam.get(62)?.stats.THROWINS).toBe(3);
    });
});

describe('lineups', () => {
    it('separates starters from bench and reads rating and minutes', () => {
        const {lineups, playerStats} = mapLineups([
            {
                id: 1, fixture_id: 1, player_id: 100, team_id: 53, type_id: 11, jersey_number: 9, formation_position: 9, player_name: 'A. Striker',
                details: [
                    {id: 1, fixture_id: 1, player_id: 100, team_id: 53, lineup_id: 1, type_id: 118, data: {value: 7.8}},
                    {id: 2, fixture_id: 1, player_id: 100, team_id: 53, lineup_id: 1, type_id: 119, data: {value: 90}},
                    {id: 3, fixture_id: 1, player_id: 100, team_id: 53, lineup_id: 1, type_id: 1, data: {value: 2}, type: {id: 1, name: 'Goals', developer_name: 'GOALS'}},
                ],
            },
            {id: 2, fixture_id: 1, player_id: 101, team_id: 53, type_id: 12, jersey_number: 23},
            {id: 3, fixture_id: 1, player_id: 102, team_id: 53, type_id: 13},
        ]);
        expect(lineups).toHaveLength(2);
        expect(lineups[0].isStarter).toBe(true);
        expect(lineups[1].isStarter).toBe(false);
        expect(playerStats).toHaveLength(1);
        expect(playerStats[0].rating).toBe(7.8);
        expect(playerStats[0].minutes_played).toBe(90);
        expect(playerStats[0].goals).toBe(2);
    });
});

describe('standings', () => {
    const standing: SmStanding = {
        id: 1, participant_id: 53, league_id: 501, season_id: 23690, position: 1, points: 9,
        details: [
            {id: 1, type_id: 129, value: 3, type: {id: 129, name: 'Overall Matches Played', developer_name: 'OVERALL_MATCHES'}},
            {id: 2, type_id: 130, value: 3, type: {id: 130, name: 'Overall Won', developer_name: 'OVERALL_WON'}},
            {id: 3, type_id: 131, value: 0, type: {id: 131, name: 'Overall Draw', developer_name: 'OVERALL_DRAW'}},
            {id: 4, type_id: 132, value: 0, type: {id: 132, name: 'Overall Lost', developer_name: 'OVERALL_LOST'}},
            {id: 5, type_id: 133, value: 8, type: {id: 133, name: 'Overall Goals For', developer_name: 'OVERALL_GOALS_FOR'}},
            {id: 6, type_id: 134, value: 1, type: {id: 134, name: 'Overall Goals Against', developer_name: 'OVERALL_GOALS_AGAINST'}},
        ],
        form: [{form: 'W', sort_order: 1}, {form: 'W', sort_order: 2}, {form: 'W', sort_order: 3}],
    };

    it('maps detail rows and form', () => {
        const row = mapStanding(standing);
        expect(row).toMatchObject({sportmonksTeamId: 53, position: 1, points: 9, played: 3, won: 3, drawn: 0, lost: 0, goalsFor: 8, goalsAgainst: 1, form: 'WWW'});
    });

    it('matches on readable names when developer_name is missing', () => {
        const row = mapStanding({
            ...standing,
            details: [{id: 1, type_id: 1, value: 5, type: {id: 1, name: 'Overall Matches Played', developer_name: null}}],
            form: null,
        });
        expect(row.played).toBe(5);
        expect(row.form).toBeNull();
    });
});

describe('slugify', () => {
    it('is ascii, lowercase and unique by id', () => {
        expect(slugify('Atalanta BC', 102)).toBe('atalanta-bc-102');
        expect(slugify('Lazio Città', 7)).toBe('lazio-citta-7');
    });
});

// Keep the type import in use so a payload shape change breaks compilation here too.
export const _fixtureShape: SmFixture = {id: 1, league_id: 384, season_id: 1, state_id: 1, starting_at: '2026-09-03 18:45:00'};
