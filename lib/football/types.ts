/**
 * Read models used by the UI. They mirror the football.* tables in
 * supabase/migrations but stay independent of the provider payloads.
 */

export type FixtureState =
    | 'scheduled'
    | 'live'
    | 'half_time'
    | 'extra_time'
    | 'penalties'
    | 'finished'
    | 'postponed'
    | 'cancelled';

export interface TeamSummary {
    id: number;
    name: string;
    shortCode: string | null;
    logoUrl: string | null;
}

export interface FixtureSummary {
    id: number;
    leagueName: string;
    round: string | null;
    startingAt: string; // ISO timestamp
    state: FixtureState;
    minute: number | null;
    home: TeamSummary;
    away: TeamSummary;
    homeScore: number | null;
    awayScore: number | null;
    stats: {
        homePossession: number | null;
        homeShots: number | null;
        awayShots: number | null;
        homeXg: number | null;
        awayXg: number | null;
    } | null;
    form: {home: string | null; away: string | null} | null;
}

export interface StandingRow {
    position: number;
    team: TeamSummary;
    played: number;
    won: number;
    drawn: number;
    lost: number;
    goalDifference: number;
    points: number;
}

export interface PlayerSpotlight {
    id: number;
    name: string;
    position: string;
    teamName: string;
    age: number | null;
    imageUrl: string | null;
    goals: number;
    assists: number;
    rating: number | null;
}

export interface HomeData {
    isSample: boolean;
    liveCount: number;
    fixtures: FixtureSummary[];
    standings: {leagueName: string; rows: StandingRow[]};
    spotlight: PlayerSpotlight | null;
}
