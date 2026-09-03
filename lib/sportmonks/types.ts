/**
 * Sportmonks Football API v3 payload shapes, limited to the fields we read.
 * Everything is optional-by-default because includes vary per request and
 * per subscription. Mappers must tolerate missing pieces.
 */

export interface SmType {
    id: number;
    name: string;
    code?: string | null;
    developer_name: string | null;
    model_type?: string;
    stat_group?: string | null;
}

export interface SmState {
    id: number;
    state: string;
    name: string;
    short_name: string;
    developer_name: string;
}

export interface SmLeague {
    id: number;
    name: string;
    short_code?: string | null;
    image_path?: string | null;
    type?: string | null;
    sub_type?: string | null;
    active?: boolean;
    country_id?: number | null;
    currentseason?: SmSeason | null;
    currentSeason?: SmSeason | null;
}

export interface SmSeason {
    id: number;
    league_id: number;
    name: string;
    is_current?: boolean;
    starting_at?: string | null;
    ending_at?: string | null;
}

export interface SmTeam {
    id: number;
    name: string;
    short_code?: string | null;
    image_path?: string | null;
    founded?: number | null;
    country_id?: number | null;
    venue_id?: number | null;
    venue?: {name?: string | null} | null;
    meta?: {location?: 'home' | 'away' | string; winner?: boolean | null; position?: number | null};
}

export interface SmPlayer {
    id: number;
    name?: string | null;
    display_name?: string | null;
    common_name?: string | null;
    firstname?: string | null;
    lastname?: string | null;
    image_path?: string | null;
    date_of_birth?: string | null;
    height?: number | null;
    weight?: number | null;
    position_id?: number | null;
    detailed_position_id?: number | null;
    nationality_id?: number | null;
    nationality?: {name?: string | null} | null;
    position?: {name?: string | null} | null;
    detailedposition?: {name?: string | null} | null;
    detailedPosition?: {name?: string | null} | null;
}

export interface SmSquadMember {
    id: number;
    player_id: number;
    team_id: number;
    jersey_number?: number | null;
    captain?: boolean | null;
    player?: SmPlayer | null;
}

export interface SmScore {
    id: number;
    fixture_id: number;
    type_id?: number;
    participant_id: number;
    score: {goals: number; participant: 'home' | 'away' | string};
    description: string; // CURRENT, 1ST_HALF, 2ND_HALF, ET, PENALTY_SHOOTOUT ...
}

export interface SmPeriod {
    id: number;
    fixture_id: number;
    type_id?: number;
    started?: number | null;
    ended?: number | null;
    counts_from?: number | null;
    ticking: boolean;
    sort_order?: number;
    description?: string | null;
    time_added?: number | null;
    period_length?: number | null;
    minutes?: number | null;
    seconds?: number | null;
}

export interface SmEvent {
    id: number;
    fixture_id: number;
    period_id?: number | null;
    participant_id: number | null;
    type_id: number;
    section?: string | null;
    player_id: number | null;
    related_player_id: number | null;
    player_name?: string | null;
    related_player_name?: string | null;
    result?: string | null;
    info?: string | null;
    addition?: string | null;
    minute: number | null;
    extra_minute: number | null;
    injured?: boolean | null;
    on_bench?: boolean | null;
    sort_order?: number | null;
    type?: SmType | null;
}

export interface SmStatistic {
    id: number;
    fixture_id: number;
    type_id: number;
    participant_id: number;
    data: {value: number | string | null};
    location?: 'home' | 'away' | string;
    type?: SmType | null;
}

export interface SmLineupDetail {
    id: number;
    fixture_id: number;
    player_id: number;
    team_id: number;
    lineup_id: number;
    type_id: number;
    data: {value: number | string | null};
    type?: SmType | null;
}

export interface SmLineup {
    id: number;
    fixture_id: number;
    player_id: number;
    team_id: number;
    position_id?: number | null;
    formation_field?: string | null;
    formation_position?: number | null;
    type_id: number; // 11 lineup, 12 bench
    player_name?: string | null;
    jersey_number?: number | null;
    player?: SmPlayer | null;
    details?: SmLineupDetail[];
}

export interface SmRound {
    id: number;
    name: string;
    finished?: boolean;
    is_current?: boolean;
}

export interface SmFixture {
    id: number;
    league_id: number;
    season_id: number;
    stage_id?: number | null;
    round_id?: number | null;
    state_id: number;
    venue_id?: number | null;
    name?: string | null;
    starting_at: string; // "YYYY-MM-DD HH:mm:ss" in UTC
    starting_at_timestamp?: number;
    result_info?: string | null;
    leg?: string | null;
    length?: number | null;
    participants?: SmTeam[];
    scores?: SmScore[];
    state?: SmState | null;
    periods?: SmPeriod[];
    events?: SmEvent[];
    statistics?: SmStatistic[];
    lineups?: SmLineup[];
    round?: SmRound | null;
    stage?: {id: number; name: string} | null;
    venue?: {id: number; name?: string | null} | null;
    referees?: Array<{id: number; referee?: {common_name?: string | null; name?: string | null} | null; type_id?: number}>;
    formations?: Array<{participant_id: number; formation: string}>;
}

export interface SmStandingDetail {
    id: number;
    standing_type?: string | null;
    type_id: number;
    value: number | string | null;
    type?: SmType | null;
}

export interface SmStanding {
    id: number;
    participant_id: number;
    league_id: number;
    season_id: number;
    stage_id?: number | null;
    group_id?: number | null;
    round_id?: number | null;
    position: number;
    points: number;
    result?: string | null;
    participant?: SmTeam | null;
    details?: SmStandingDetail[];
    form?: Array<{form: string; sort_order?: number}> | string | null;
    stage?: {id: number; name: string} | null;
    group?: {id: number; name: string} | null;
}

export interface SmSidelined {
    id: number;
    player_id: number;
    team_id?: number | null;
    season_id?: number | null;
    category?: string | null; // injury, suspension
    start_date?: string | null;
    end_date?: string | null;
    games_missed?: number | null;
    completed?: boolean | null;
    type?: SmType | null;
    player?: SmPlayer | null;
}
