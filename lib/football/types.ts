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
    | 'cancelled'
    | 'abandoned'
    | 'unknown';

export const LIVE_STATES: readonly FixtureState[] = ['live', 'half_time', 'extra_time', 'penalties'];

export interface TeamSummary {
    id: number;
    name: string;
    shortCode: string | null;
    logoUrl: string | null;
    slug?: string;
}

export interface CompetitionSummary {
    id: number;
    name: string;
    slug: string;
    country: string | null;
    logoUrl: string | null;
    type: string | null;
    featured?: boolean;
}

export interface SeasonSummary {
    id: number;
    name: string;
    year: number;
}

export interface FixtureSummary {
    id: number;
    leagueName: string;
    leagueSlug?: string;
    leagueCountry?: string | null;
    leagueFeatured?: boolean;
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
    goalsFor?: number;
    goalsAgainst?: number;
    form?: string | null;
}

export interface StandingGroup {
    name: string; // '' for the main table
    rows: StandingRow[];
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

// ---------------------------------------------------------------------------
// Competition page
// ---------------------------------------------------------------------------

export interface RoundFixtures {
    round: string;
    fixtures: FixtureSummary[];
}

export interface CompetitionPage {
    competition: CompetitionSummary;
    season: SeasonSummary | null;
    standings: StandingGroup[];
    results: RoundFixtures[];
    upcoming: RoundFixtures[];
    live: FixtureSummary[];
}

// ---------------------------------------------------------------------------
// Match page
// ---------------------------------------------------------------------------

export type EventKind =
    | 'goal'
    | 'own_goal'
    | 'penalty'
    | 'missed_penalty'
    | 'yellow_card'
    | 'red_card'
    | 'yellow_red_card'
    | 'substitution'
    | 'var';

export interface MatchEvent {
    id: number;
    teamId: number | null;
    side: 'home' | 'away' | null;
    type: EventKind;
    minute: number | null;
    extraMinute: number | null;
    player: {id: number | null; name: string | null; slug: string | null};
    related: {id: number | null; name: string | null; slug: string | null};
    info: string | null;
}

export interface LineupPlayer {
    id: number;
    name: string;
    slug: string;
    number: number | null;
    position: string | null;
    formationPosition: number | null;
    rating: number | null;
}

export interface TeamLineup {
    team: TeamSummary;
    formation: string | null;
    starters: LineupPlayer[];
    bench: LineupPlayer[];
}

export interface TeamMatchStats {
    possession: number | null;
    shotsTotal: number | null;
    shotsOnTarget: number | null;
    corners: number | null;
    fouls: number | null;
    yellowCards: number | null;
    redCards: number | null;
    passesTotal: number | null;
    passAccuracy: number | null;
    xg: number | null;
}

export interface PlayerMatchLine {
    player: {id: number; name: string; slug: string; imageUrl: string | null};
    teamId: number;
    position: string | null;
    minutes: number | null;
    rating: number | null;
    goals: number;
    assists: number;
    shots: number | null;
    shotsOnTarget: number | null;
    keyPasses: number | null;
    yellowCards: number;
    redCards: number;
    fantasy: number | null;
}

export interface MatchPage {
    fixture: FixtureSummary & {
        competition: CompetitionSummary;
        venue: string | null;
        referee: string | null;
        homeScoreHt: number | null;
        awayScoreHt: number | null;
    };
    events: MatchEvent[];
    lineups: {home: TeamLineup | null; away: TeamLineup | null};
    stats: {home: TeamMatchStats | null; away: TeamMatchStats | null};
    players: {home: PlayerMatchLine[]; away: PlayerMatchLine[]};
}

// ---------------------------------------------------------------------------
// Team page
// ---------------------------------------------------------------------------

export interface SquadPlayer {
    id: number;
    name: string;
    slug: string;
    number: number | null;
    position: string | null;
    age: number | null;
    imageUrl: string | null;
}

export interface TeamStandingLine {
    competition: CompetitionSummary;
    season: SeasonSummary;
    row: StandingRow;
    totalTeams: number;
}

export interface TeamPage {
    team: TeamSummary & {country: string | null; venue: string | null; founded: number | null};
    standings: TeamStandingLine[];
    recent: FixtureSummary[];
    upcoming: FixtureSummary[];
    live: FixtureSummary[];
    squad: SquadPlayer[];
    sidelined: Array<{player: SquadPlayer; category: string; description: string | null}>;
}

// ---------------------------------------------------------------------------
// Player page
// ---------------------------------------------------------------------------

export interface PlayerSeasonTotals {
    matches: number;
    minutes: number;
    goals: number;
    assists: number;
    yellowCards: number;
    redCards: number;
    averageRating: number | null;
    averageFantasy: number | null;
}

export interface PlayerMatchRow {
    fixture: FixtureSummary;
    teamId: number;
    minutes: number | null;
    rating: number | null;
    goals: number;
    assists: number;
    yellowCards: number;
    redCards: number;
    fantasy: number | null;
}

export interface PlayerPage {
    player: SquadPlayer & {nationality: string | null; height: number | null; weight: number | null};
    team: TeamSummary | null;
    totals: PlayerSeasonTotals;
    matches: PlayerMatchRow[];
}

// ---------------------------------------------------------------------------
// Live page
// ---------------------------------------------------------------------------

export interface CompetitionFixtures {
    competition: CompetitionSummary;
    fixtures: FixtureSummary[];
}
