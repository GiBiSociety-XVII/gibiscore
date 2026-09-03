import type {HomeData} from './types';

/**
 * SAMPLE DATA. Used only until the API-Football sync fills the database.
 * Every value here is invented for layout purposes; the UI shows a
 * "Dati di esempio" badge whenever `isSample` is true.
 */
export const SAMPLE_HOME_DATA: HomeData = {
    isSample: true,
    liveCount: 2,
    fixtures: [
        {
            id: 1,
            leagueName: 'Serie A',
            round: '3',
            startingAt: '2026-09-03T18:45:00Z',
            state: 'live',
            minute: 78,
            home: {id: 1, name: 'Inter', shortCode: 'INT', logoUrl: null},
            away: {id: 2, name: 'Juventus', shortCode: 'JUV', logoUrl: null},
            homeScore: 2,
            awayScore: 1,
            stats: {homePossession: 54, homeShots: 11, awayShots: 7, homeXg: 1.8, awayXg: 0.9},
            form: null,
        },
        {
            id: 2,
            leagueName: 'Serie A',
            round: '3',
            startingAt: '2026-09-03T18:45:00Z',
            state: 'half_time',
            minute: 45,
            home: {id: 3, name: 'Milan', shortCode: 'MIL', logoUrl: null},
            away: {id: 4, name: 'Roma', shortCode: 'ROM', logoUrl: null},
            homeScore: 0,
            awayScore: 0,
            stats: {homePossession: 61, homeShots: 6, awayShots: 3, homeXg: 0.7, awayXg: 0.3},
            form: null,
        },
        {
            id: 3,
            leagueName: 'Serie A',
            round: '3',
            startingAt: '2026-09-03T18:45:00Z',
            state: 'scheduled',
            minute: null,
            home: {id: 5, name: 'Napoli', shortCode: 'NAP', logoUrl: null},
            away: {id: 6, name: 'Atalanta', shortCode: 'ATA', logoUrl: null},
            homeScore: null,
            awayScore: null,
            stats: null,
            form: {home: 'V V N V P', away: 'V P V V N'},
        },
    ],
    standings: {
        leagueName: 'Serie A',
        rows: [
            {position: 1, team: {id: 1, name: 'Inter', shortCode: 'INT', logoUrl: null}, played: 3, won: 3, drawn: 0, lost: 0, goalDifference: 7, points: 9},
            {position: 2, team: {id: 5, name: 'Napoli', shortCode: 'NAP', logoUrl: null}, played: 3, won: 2, drawn: 1, lost: 0, goalDifference: 4, points: 7},
            {position: 3, team: {id: 2, name: 'Juventus', shortCode: 'JUV', logoUrl: null}, played: 3, won: 2, drawn: 0, lost: 1, goalDifference: 3, points: 6},
            {position: 4, team: {id: 6, name: 'Atalanta', shortCode: 'ATA', logoUrl: null}, played: 3, won: 2, drawn: 0, lost: 1, goalDifference: 2, points: 6},
            {position: 5, team: {id: 3, name: 'Milan', shortCode: 'MIL', logoUrl: null}, played: 3, won: 1, drawn: 2, lost: 0, goalDifference: 2, points: 5},
            {position: 6, team: {id: 4, name: 'Roma', shortCode: 'ROM', logoUrl: null}, played: 3, won: 1, drawn: 1, lost: 1, goalDifference: 0, points: 4},
        ],
    },
    spotlight: {
        id: 100,
        name: '[Nome giocatore]',
        position: 'Attaccante',
        teamName: 'Inter',
        age: 27,
        imageUrl: null,
        goals: 4,
        assists: 2,
        rating: 7.8,
    },
};
