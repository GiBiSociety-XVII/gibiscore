/**
 * Pure functions that turn Sportmonks payloads into the rows we store.
 * No I/O here: everything is unit-tested in mappers.test.ts.
 *
 * Type matching is done on `developer_name` (from `include=...type`) with
 * the documented numeric ids as a fallback, so a payload without the nested
 * type still maps correctly.
 */
import type {FixtureState} from '@/lib/football/types';
import type {
    SmEvent,
    SmFixture,
    SmLineup,
    SmPeriod,
    SmScore,
    SmStanding,
    SmStatistic,
    SmTeam,
} from './types';

// ---------------------------------------------------------------------------
// States
// ---------------------------------------------------------------------------

/** Sportmonks state developer_name -> our fixture_state enum. */
const STATE_BY_NAME: Record<string, FixtureState> = {
    NS: 'scheduled',
    TBA: 'scheduled',
    DELAYED: 'scheduled',
    PENDING: 'scheduled',
    AWAITING_UPDATES: 'scheduled',
    INPLAY_1ST_HALF: 'live',
    INPLAY_2ND_HALF: 'live',
    BREAK: 'live',
    HT: 'half_time',
    INPLAY_ET: 'extra_time',
    EXTRA_TIME_BREAK: 'extra_time',
    INPLAY_PENALTIES: 'penalties',
    PEN_BREAK: 'penalties',
    FT: 'finished',
    AET: 'finished',
    FT_PEN: 'finished',
    AWARDED: 'finished',
    WALKOVER: 'finished',
    POSTPONED: 'postponed',
    SUSPENDED: 'postponed',
    INTERRUPTED: 'postponed',
    CANCELLED: 'cancelled',
    DELETED: 'cancelled',
    ABANDONED: 'abandoned',
};

/** Documented state ids, used only when the `state` include is missing. */
const STATE_BY_ID: Record<number, FixtureState> = {
    1: 'scheduled',
    2: 'live',
    3: 'half_time',
    4: 'live',
    5: 'finished',
    6: 'extra_time',
    7: 'finished',
    8: 'finished',
    9: 'penalties',
    10: 'postponed',
    11: 'postponed',
    12: 'cancelled',
    13: 'scheduled',
    21: 'extra_time',
    22: 'live',
    25: 'penalties',
};

export const LIVE_STATES: readonly FixtureState[] = ['live', 'half_time', 'extra_time', 'penalties'];

export function mapFixtureState(fixture: Pick<SmFixture, 'state' | 'state_id'>): FixtureState {
    const name = fixture.state?.developer_name?.toUpperCase();
    if (name && STATE_BY_NAME[name]) return STATE_BY_NAME[name];
    return STATE_BY_ID[fixture.state_id] ?? 'unknown';
}

export function isLiveState(state: FixtureState): boolean {
    return LIVE_STATES.includes(state);
}

// ---------------------------------------------------------------------------
// Participants and scores
// ---------------------------------------------------------------------------

export interface HomeAway<T> {
    home: T;
    away: T;
}

/** Always use meta.location, never array order. */
export function splitParticipants(participants: SmTeam[] | undefined): HomeAway<SmTeam> | null {
    if (!participants || participants.length < 2) return null;
    const home = participants.find((p) => p.meta?.location === 'home');
    const away = participants.find((p) => p.meta?.location === 'away');
    if (!home || !away) return null;
    return {home, away};
}

function goalsFor(scores: SmScore[] | undefined, description: string): HomeAway<number | null> {
    const result: HomeAway<number | null> = {home: null, away: null};
    for (const score of scores ?? []) {
        if (score.description !== description) continue;
        if (score.score.participant === 'home') result.home = score.score.goals;
        if (score.score.participant === 'away') result.away = score.score.goals;
    }
    return result;
}

/** Current score (covers extra time and penalties) and half-time score. */
export function extractScores(scores: SmScore[] | undefined): {
    current: HomeAway<number | null>;
    halfTime: HomeAway<number | null>;
} {
    return {
        current: goalsFor(scores, 'CURRENT'),
        halfTime: goalsFor(scores, '1ST_HALF'),
    };
}

// ---------------------------------------------------------------------------
// Minute
// ---------------------------------------------------------------------------

/** Minute of the running period, or null when nothing is ticking. */
export function extractMinute(periods: SmPeriod[] | undefined, state: FixtureState): number | null {
    const ticking = periods?.find((p) => p.ticking);
    if (ticking && typeof ticking.minutes === 'number') return ticking.minutes;
    if (state === 'half_time') return 45;
    return null;
}

// ---------------------------------------------------------------------------
// Dates
// ---------------------------------------------------------------------------

/** Sportmonks sends "YYYY-MM-DD HH:mm:ss" in UTC; store an ISO string. */
export function toIsoUtc(startingAt: string): string {
    const trimmed = startingAt.trim();
    if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(trimmed)) {
        return `${trimmed.replace(' ', 'T')}Z`;
    }
    return new Date(trimmed).toISOString();
}

// ---------------------------------------------------------------------------
// Events
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
    | 'var'
    | 'penalty_shootout_goal'
    | 'penalty_shootout_miss'
    | 'other';

const EVENT_BY_NAME: Record<string, EventKind> = {
    GOAL: 'goal',
    OWNGOAL: 'own_goal',
    PENALTY: 'penalty',
    MISSED_PENALTY: 'missed_penalty',
    YELLOWCARD: 'yellow_card',
    REDCARD: 'red_card',
    YELLOWREDCARD: 'yellow_red_card',
    SUBSTITUTION: 'substitution',
    VAR: 'var',
    VAR_CARD: 'var',
    PENALTY_SHOOTOUT_GOAL: 'penalty_shootout_goal',
    PENALTY_SHOOTOUT_MISS: 'penalty_shootout_miss',
};

const EVENT_BY_ID: Record<number, EventKind> = {
    10: 'var',
    14: 'goal',
    15: 'own_goal',
    16: 'penalty',
    17: 'missed_penalty',
    18: 'substitution',
    19: 'yellow_card',
    20: 'red_card',
    21: 'yellow_red_card',
    22: 'penalty_shootout_miss',
    23: 'penalty_shootout_goal',
    1697: 'var',
};

export function mapEventKind(event: Pick<SmEvent, 'type' | 'type_id'>): EventKind {
    const name = event.type?.developer_name?.toUpperCase();
    if (name && EVENT_BY_NAME[name]) return EVENT_BY_NAME[name];
    return EVENT_BY_ID[event.type_id] ?? 'other';
}

/** Events we store; shots, corners and offsides are noise for the timeline. */
export function isStoredEvent(kind: EventKind): boolean {
    return kind !== 'other';
}

// ---------------------------------------------------------------------------
// Team statistics
// ---------------------------------------------------------------------------

export interface TeamStatRow {
    possession: number | null;
    shots_total: number | null;
    shots_on_target: number | null;
    corners: number | null;
    fouls: number | null;
    yellow_cards: number | null;
    red_cards: number | null;
    passes_total: number | null;
    pass_accuracy: number | null;
    xg: number | null;
    xg_on_target: number | null;
    stats: Record<string, number | string | null>;
}

type StatKey = Exclude<keyof TeamStatRow, 'stats'>;

const STAT_BY_NAME: Record<string, StatKey> = {
    BALL_POSSESSION: 'possession',
    SHOTS_TOTAL: 'shots_total',
    SHOTS_ON_TARGET: 'shots_on_target',
    CORNERS: 'corners',
    FOULS: 'fouls',
    YELLOWCARDS: 'yellow_cards',
    REDCARDS: 'red_cards',
    PASSES: 'passes_total',
    SUCCESSFUL_PASSES_PERCENTAGE: 'pass_accuracy',
    EXPECTED_GOALS: 'xg',
    EXPECTED_GOALS_ON_TARGET: 'xg_on_target',
};

const STAT_BY_ID: Record<number, StatKey> = {
    45: 'possession',
    42: 'shots_total',
    86: 'shots_on_target',
    34: 'corners',
    56: 'fouls',
    84: 'yellow_cards',
    83: 'red_cards',
    80: 'passes_total',
    82: 'pass_accuracy',
    5304: 'xg',
    5305: 'xg_on_target',
};

function asNumber(value: number | string | null | undefined): number | null {
    if (value === null || value === undefined) return null;
    const n = typeof value === 'number' ? value : Number(value);
    return Number.isFinite(n) ? n : null;
}

export function emptyTeamStats(): TeamStatRow {
    return {
        possession: null,
        shots_total: null,
        shots_on_target: null,
        corners: null,
        fouls: null,
        yellow_cards: null,
        red_cards: null,
        passes_total: null,
        pass_accuracy: null,
        xg: null,
        xg_on_target: null,
        stats: {},
    };
}

/** Group fixture statistics by participant id. */
export function mapTeamStats(statistics: SmStatistic[] | undefined): Map<number, TeamStatRow> {
    const byTeam = new Map<number, TeamStatRow>();
    for (const stat of statistics ?? []) {
        const row = byTeam.get(stat.participant_id) ?? emptyTeamStats();
        const name = stat.type?.developer_name?.toUpperCase();
        const key = (name && STAT_BY_NAME[name]) || STAT_BY_ID[stat.type_id];
        const value = asNumber(stat.data?.value);
        if (key) {
            row[key] = value;
        }
        const label = name ?? `type_${stat.type_id}`;
        row.stats[label] = stat.data?.value ?? null;
        byTeam.set(stat.participant_id, row);
    }
    return byTeam;
}

// ---------------------------------------------------------------------------
// Lineups and per-player match statistics
// ---------------------------------------------------------------------------

export interface LineupRow {
    sportmonksPlayerId: number;
    sportmonksTeamId: number;
    playerName: string | null;
    isStarter: boolean;
    formationPosition: number | null;
    jerseyNumber: number | null;
}

export interface PlayerStatRow {
    sportmonksPlayerId: number;
    sportmonksTeamId: number;
    minutes_played: number | null;
    rating: number | null;
    goals: number;
    assists: number;
    shots_total: number | null;
    shots_on_target: number | null;
    key_passes: number | null;
    yellow_cards: number;
    red_cards: number;
    xg: number | null;
    xa: number | null;
    stats: Record<string, number | string | null>;
}

type PlayerStatKey = Exclude<keyof PlayerStatRow, 'stats' | 'sportmonksPlayerId' | 'sportmonksTeamId'>;

const PLAYER_STAT_BY_NAME: Record<string, PlayerStatKey> = {
    MINUTES_PLAYED: 'minutes_played',
    RATING: 'rating',
    GOALS: 'goals',
    ASSISTS: 'assists',
    SHOTS_TOTAL: 'shots_total',
    SHOTS_ON_TARGET: 'shots_on_target',
    KEY_PASSES: 'key_passes',
    YELLOWCARDS: 'yellow_cards',
    REDCARDS: 'red_cards',
    EXPECTED_GOALS: 'xg',
    EXPECTED_ASSISTS: 'xa',
};

const PLAYER_STAT_BY_ID: Record<number, PlayerStatKey> = {
    119: 'minutes_played',
    118: 'rating',
    52: 'goals',
    79: 'assists',
    42: 'shots_total',
    86: 'shots_on_target',
    117: 'key_passes',
    84: 'yellow_cards',
    83: 'red_cards',
    5304: 'xg',
};

const LINEUP_TYPE_STARTER = 11;
const LINEUP_TYPE_BENCH = 12;

export function mapLineups(lineups: SmLineup[] | undefined): {lineups: LineupRow[]; playerStats: PlayerStatRow[]} {
    const rows: LineupRow[] = [];
    const stats: PlayerStatRow[] = [];
    for (const entry of lineups ?? []) {
        if (entry.type_id !== LINEUP_TYPE_STARTER && entry.type_id !== LINEUP_TYPE_BENCH) continue;
        rows.push({
            sportmonksPlayerId: entry.player_id,
            sportmonksTeamId: entry.team_id,
            playerName: entry.player_name ?? entry.player?.display_name ?? entry.player?.name ?? null,
            isStarter: entry.type_id === LINEUP_TYPE_STARTER,
            formationPosition: entry.formation_position ?? null,
            jerseyNumber: entry.jersey_number ?? null,
        });
        if (!entry.details || entry.details.length === 0) continue;
        const row: PlayerStatRow = {
            sportmonksPlayerId: entry.player_id,
            sportmonksTeamId: entry.team_id,
            minutes_played: null,
            rating: null,
            goals: 0,
            assists: 0,
            shots_total: null,
            shots_on_target: null,
            key_passes: null,
            yellow_cards: 0,
            red_cards: 0,
            xg: null,
            xa: null,
            stats: {},
        };
        for (const detail of entry.details) {
            const name = detail.type?.developer_name?.toUpperCase();
            const key = (name && PLAYER_STAT_BY_NAME[name]) || PLAYER_STAT_BY_ID[detail.type_id];
            const value = asNumber(detail.data?.value);
            if (key) {
                if (key === 'goals' || key === 'assists' || key === 'yellow_cards' || key === 'red_cards') {
                    row[key] = value ?? 0;
                } else {
                    row[key] = value;
                }
            }
            row.stats[name ?? `type_${detail.type_id}`] = detail.data?.value ?? null;
        }
        stats.push(row);
    }
    return {lineups: rows, playerStats: stats};
}

// ---------------------------------------------------------------------------
// Standings
// ---------------------------------------------------------------------------

export interface StandingRowData {
    sportmonksTeamId: number;
    position: number;
    points: number;
    played: number;
    won: number;
    drawn: number;
    lost: number;
    goalsFor: number;
    goalsAgainst: number;
    form: string | null;
    stage: string;
    group: string;
}

/**
 * Standing details carry one row per statistic; the type names are of the
 * form OVERALL_MATCHES / "Overall Matches Played". We match loosely on the
 * developer_name first and on the readable name second.
 */
function detailValue(standing: SmStanding, patterns: RegExp[]): number | null {
    for (const detail of standing.details ?? []) {
        const name = detail.type?.developer_name ?? '';
        const label = detail.type?.name ?? '';
        if (patterns.some((p) => p.test(name) || p.test(label))) {
            return asNumber(detail.value);
        }
    }
    return null;
}

function formString(form: SmStanding['form']): string | null {
    if (!form) return null;
    if (typeof form === 'string') return form;
    return form
        .slice()
        .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
        .map((f) => f.form)
        .join('');
}

export function mapStanding(standing: SmStanding): StandingRowData {
    const played = detailValue(standing, [/^OVERALL_MATCHES/i, /overall matches/i, /matches played/i]) ?? 0;
    const won = detailValue(standing, [/^OVERALL_WON$/i, /^OVERALL_WINS?$/i, /overall (won|wins)/i]) ?? 0;
    const drawn = detailValue(standing, [/^OVERALL_DRAWS?$/i, /overall draw/i]) ?? 0;
    const lost = detailValue(standing, [/^OVERALL_LOST$/i, /^OVERALL_LOSS(ES)?$/i, /overall (lost|loss)/i]) ?? 0;
    const goalsFor = detailValue(standing, [/^OVERALL_GOALS_FOR$/i, /^OVERALL_SCORED$/i, /overall goals (for|scored)/i]) ?? 0;
    const goalsAgainst = detailValue(standing, [/^OVERALL_GOALS_AGAINST$/i, /^OVERALL_CONCEDED$/i, /overall goals (against|conceded)/i]) ?? 0;
    const points = detailValue(standing, [/^OVERALL_POINTS$/i, /overall points/i]) ?? standing.points ?? 0;

    return {
        sportmonksTeamId: standing.participant_id,
        position: standing.position,
        points,
        played,
        won,
        drawn,
        lost,
        goalsFor,
        goalsAgainst,
        form: formString(standing.form),
        stage: standing.stage?.name ?? (standing.stage_id ? String(standing.stage_id) : 'regular'),
        group: standing.group?.name ?? (standing.group_id ? String(standing.group_id) : ''),
    };
}

// ---------------------------------------------------------------------------
// Misc helpers
// ---------------------------------------------------------------------------

export function slugify(name: string, id: number): string {
    const base = name
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
    return `${base || 'x'}-${id}`;
}

export function positionName(positionId: number | null | undefined): string | null {
    switch (positionId) {
        case 24:
        case 1:
            return 'goalkeeper';
        case 25:
        case 2:
            return 'defender';
        case 26:
        case 3:
            return 'midfielder';
        case 27:
        case 4:
            return 'attacker';
        default:
            return null;
    }
}
