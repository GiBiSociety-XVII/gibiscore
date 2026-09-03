/**
 * API-Football v3 payload shapes (api-sports.io), limited to what we read.
 * Everything nested is optional-by-default because coverage differs per
 * league and season. Mappers must tolerate missing pieces.
 */

export interface AfEnvelope<T> {
    get: string;
    parameters: Record<string, string>;
    /** `[]` when fine, an object keyed by field (e.g. {token: '...'}) on errors. */
    errors: Record<string, string> | string[];
    results: number;
    paging: {current: number; total: number};
    response: T;
}

export type AfStatusCode =
    | 'TBD' | 'NS' | '1H' | 'HT' | '2H' | 'ET' | 'BT' | 'P' | 'SUSP' | 'INT'
    | 'FT' | 'AET' | 'PEN' | 'PST' | 'CANC' | 'ABD' | 'AWD' | 'WO' | 'LIVE';

export interface AfLeague {
    id: number;
    name: string;
    type: 'League' | 'Cup' | string;
    logo: string | null;
}

export interface AfSeason {
    year: number;
    start: string;
    end: string;
    current: boolean;
    coverage?: {
        fixtures?: {events?: boolean; lineups?: boolean; statistics_fixtures?: boolean; statistics_players?: boolean};
        standings?: boolean;
        players?: boolean;
        top_scorers?: boolean;
        injuries?: boolean;
        predictions?: boolean;
        odds?: boolean;
    };
}

export interface AfLeagueResponse {
    league: AfLeague;
    country: {name: string; code: string | null; flag: string | null};
    seasons: AfSeason[];
}

export interface AfTeam {
    id: number;
    name: string;
    code?: string | null;
    country?: string | null;
    founded?: number | null;
    national?: boolean;
    logo: string | null;
}

export interface AfTeamResponse {
    team: AfTeam;
    venue: {id: number | null; name: string | null; city: string | null; capacity?: number | null} | null;
}

export interface AfSquadPlayer {
    id: number;
    name: string;
    age: number | null;
    number: number | null;
    position: string | null; // Goalkeeper, Defender, Midfielder, Attacker
    photo: string | null;
}

export interface AfSquadResponse {
    team: {id: number; name: string; logo: string | null};
    players: AfSquadPlayer[];
}

export interface AfFixtureCore {
    id: number;
    referee: string | null;
    timezone: string;
    date: string; // ISO 8601 with offset
    timestamp: number;
    periods: {first: number | null; second: number | null};
    venue: {id: number | null; name: string | null; city: string | null};
    status: {long: string; short: AfStatusCode | string; elapsed: number | null; extra?: number | null};
}

export interface AfFixtureTeam {
    id: number;
    name: string;
    logo: string | null;
    winner: boolean | null;
}

export interface AfGoals {
    home: number | null;
    away: number | null;
}

export interface AfEvent {
    time: {elapsed: number; extra: number | null};
    team: {id: number; name: string; logo: string | null};
    player: {id: number | null; name: string | null};
    assist: {id: number | null; name: string | null};
    type: 'Goal' | 'Card' | 'subst' | 'Var' | string;
    detail: string; // Normal Goal, Own Goal, Penalty, Missed Penalty, Yellow Card, Red Card, Substitution 1, Goal cancelled ...
    comments: string | null;
}

export interface AfLineupPlayer {
    player: {id: number; name: string; number: number | null; pos: string | null; grid: string | null};
}

export interface AfLineup {
    team: {id: number; name: string; logo: string | null};
    formation: string | null;
    startXI: AfLineupPlayer[];
    substitutes: AfLineupPlayer[];
    coach: {id: number | null; name: string | null; photo: string | null};
}

export interface AfTeamStatistics {
    team: {id: number; name: string; logo: string | null};
    statistics: Array<{type: string; value: number | string | null}>;
}

export interface AfPlayerMatchStats {
    games: {
        minutes: number | null;
        number: number | null;
        position: string | null;
        rating: string | null;
        captain: boolean;
        substitute: boolean;
    };
    offsides: number | null;
    shots: {total: number | null; on: number | null};
    goals: {total: number | null; conceded: number | null; assists: number | null; saves: number | null};
    passes: {total: number | null; key: number | null; accuracy: string | number | null};
    tackles: {total: number | null; blocks: number | null; interceptions: number | null};
    duels: {total: number | null; won: number | null};
    dribbles: {attempts: number | null; success: number | null; past: number | null};
    fouls: {drawn: number | null; committed: number | null};
    cards: {yellow: number | null; red: number | null};
    penalty: {won: number | null; commited: number | null; scored: number | null; missed: number | null; saved: number | null};
}

export interface AfFixturePlayers {
    team: {id: number; name: string; logo: string | null; update?: string};
    players: Array<{player: {id: number; name: string; photo: string | null}; statistics: AfPlayerMatchStats[]}>;
}

export interface AfFixtureResponse {
    fixture: AfFixtureCore;
    league: {id: number; name: string; country: string; logo: string | null; flag: string | null; season: number; round: string};
    teams: {home: AfFixtureTeam; away: AfFixtureTeam};
    goals: AfGoals;
    score: {halftime: AfGoals; fulltime: AfGoals; extratime: AfGoals; penalty: AfGoals};
    // Present when requesting by id / ids (and events also with live=)
    events?: AfEvent[];
    lineups?: AfLineup[];
    statistics?: AfTeamStatistics[];
    players?: AfFixturePlayers[];
}

export interface AfStanding {
    rank: number;
    team: {id: number; name: string; logo: string | null};
    points: number;
    goalsDiff: number;
    group: string;
    form: string | null;
    status: string | null;
    description: string | null;
    all: {played: number; win: number; draw: number; lose: number; goals: {for: number; against: number}};
    home: AfStanding['all'];
    away: AfStanding['all'];
    update: string;
}

export interface AfStandingsResponse {
    league: {id: number; name: string; country: string; logo: string | null; season: number; standings: AfStanding[][]};
}

export interface AfInjuryResponse {
    player: {id: number; name: string; photo: string | null; type: string | null; reason: string | null};
    team: {id: number; name: string; logo: string | null};
    fixture: {id: number; timezone: string; date: string; timestamp: number};
    league: {id: number; season: number; name: string; country: string; logo: string | null; flag: string | null};
}

export interface AfStatusResponse {
    account: {firstname: string; lastname: string; email: string};
    subscription: {plan: string; end: string; active: boolean};
    requests: {current: number; limit_day: number};
}
