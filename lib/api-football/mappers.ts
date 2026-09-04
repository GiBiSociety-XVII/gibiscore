/**
 * Pure functions that turn API-Football payloads into the rows we store.
 * No I/O here: everything is unit-tested in mappers.test.ts.
 */
import type {FixtureState} from '@/lib/football/types';
import type {
    AfEvent,
    AfFixtureResponse,
    AfLineup,
    AfPlayerMatchStats,
    AfPlayerProfile,
    AfPlayerSeasonStats,
    AfSeason,
    AfStanding,
    AfTeamStatistics,
} from './types';

// ---------------------------------------------------------------------------
// States
// ---------------------------------------------------------------------------

const STATE_BY_CODE: Record<string, FixtureState> = {
    TBD: 'scheduled',
    NS: 'scheduled',
    '1H': 'live',
    '2H': 'live',
    LIVE: 'live',
    HT: 'half_time',
    ET: 'extra_time',
    BT: 'extra_time',
    P: 'penalties',
    FT: 'finished',
    AET: 'finished',
    PEN: 'finished',
    AWD: 'finished',
    WO: 'finished',
    PST: 'postponed',
    SUSP: 'postponed',
    INT: 'postponed',
    CANC: 'cancelled',
    ABD: 'abandoned',
};

export const LIVE_STATES: readonly FixtureState[] = ['live', 'half_time', 'extra_time', 'penalties'];

export function mapFixtureState(short: string | null | undefined): FixtureState {
    if (!short) return 'unknown';
    return STATE_BY_CODE[short.toUpperCase()] ?? 'unknown';
}

export function isLiveState(state: FixtureState): boolean {
    return LIVE_STATES.includes(state);
}

/** Minute shown next to a live score; 45 at half time, null otherwise. */
export function extractMinute(status: {short: string; elapsed: number | null}, state: FixtureState): number | null {
    if (isLiveState(state) && typeof status.elapsed === 'number') return status.elapsed;
    if (state === 'half_time') return 45;
    return null;
}

/** Stoppage time ("90+3" -> 3) while a period runs past its length, null otherwise. */
export function extractExtraMinute(status: {short: string; elapsed: number | null; extra?: number | null}, state: FixtureState): number | null {
    if (isLiveState(state) && typeof status.extra === 'number' && status.extra > 0) return status.extra;
    return null;
}

// ---------------------------------------------------------------------------
// Seasons
// ---------------------------------------------------------------------------

/** Pick the current season; fall back to the latest one when none is flagged. */
export function currentSeason(seasons: AfSeason[] | undefined): AfSeason | null {
    if (!seasons || seasons.length === 0) return null;
    return seasons.find((s) => s.current) ?? [...seasons].sort((a, b) => b.year - a.year)[0];
}

/** "2026/2027" for a season that spans two years, "2026" otherwise. */
export function seasonName(season: Pick<AfSeason, 'year' | 'start' | 'end'>): string {
    const endYear = season.end ? Number(season.end.slice(0, 4)) : season.year;
    return endYear > season.year ? `${season.year}/${endYear}` : String(season.year);
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
    | 'other';

export function mapEventKind(event: Pick<AfEvent, 'type' | 'detail'>): EventKind {
    const type = (event.type ?? '').toLowerCase();
    const detail = (event.detail ?? '').toLowerCase();
    if (type === 'goal') {
        if (detail.includes('own')) return 'own_goal';
        if (detail.includes('missed')) return 'missed_penalty';
        if (detail.includes('penalty')) return 'penalty';
        return 'goal';
    }
    if (type === 'card') {
        if (detail.includes('yellow/red') || detail.includes('second yellow')) return 'yellow_red_card';
        if (detail.includes('red')) return 'red_card';
        if (detail.includes('yellow')) return 'yellow_card';
        return 'other';
    }
    if (type === 'subst') return 'substitution';
    if (type === 'var') return 'var';
    return 'other';
}

export interface EventRow {
    providerTeamId: number | null;
    /** For substitutions: the player coming on. */
    providerPlayerId: number | null;
    /** Assist on goals; the player going off on substitutions. */
    providerRelatedPlayerId: number | null;
    playerName: string | null;
    relatedPlayerName: string | null;
    type: EventKind;
    minute: number | null;
    extraMinute: number | null;
    info: string | null;
    sortOrder: number;
}

export function mapEvents(events: AfEvent[] | undefined): EventRow[] {
    const rows: EventRow[] = [];
    for (const event of events ?? []) {
        const kind = mapEventKind(event);
        if (kind === 'other') continue;
        rows.push({
            providerTeamId: event.team?.id ?? null,
            providerPlayerId: event.player?.id ?? null,
            providerRelatedPlayerId: event.assist?.id ?? null,
            playerName: event.player?.name ?? null,
            relatedPlayerName: event.assist?.name ?? null,
            type: kind,
            minute: event.time?.elapsed ?? null,
            extraMinute: event.time?.extra ?? null,
            info: event.comments ?? (kind === 'var' ? event.detail : null),
            sortOrder: rows.length,
        });
    }
    return rows;
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

const STAT_BY_TYPE: Record<string, StatKey> = {
    'ball possession': 'possession',
    'total shots': 'shots_total',
    'shots on goal': 'shots_on_target',
    'corner kicks': 'corners',
    fouls: 'fouls',
    'yellow cards': 'yellow_cards',
    'red cards': 'red_cards',
    'total passes': 'passes_total',
    'passes %': 'pass_accuracy',
    expected_goals: 'xg',
};

/** "53%" -> 53, "1.23" -> 1.23, 7 -> 7, null -> null. */
export function asNumber(value: number | string | null | undefined): number | null {
    if (value === null || value === undefined) return null;
    if (typeof value === 'number') return Number.isFinite(value) ? value : null;
    const n = Number(String(value).replace('%', '').trim());
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

/** Group fixture statistics by team id. */
export function mapTeamStats(statistics: AfTeamStatistics[] | undefined): Map<number, TeamStatRow> {
    const byTeam = new Map<number, TeamStatRow>();
    for (const entry of statistics ?? []) {
        const row = byTeam.get(entry.team.id) ?? emptyTeamStats();
        for (const stat of entry.statistics ?? []) {
            const key = STAT_BY_TYPE[stat.type.toLowerCase()];
            if (key) row[key] = asNumber(stat.value);
            row.stats[stat.type] = stat.value ?? null;
        }
        byTeam.set(entry.team.id, row);
    }
    return byTeam;
}

// ---------------------------------------------------------------------------
// Lineups and per-player match statistics
// ---------------------------------------------------------------------------

export interface LineupRow {
    providerPlayerId: number;
    providerTeamId: number;
    playerName: string;
    isStarter: boolean;
    formation: string | null;
    /** 1-based slot in the formation, derived from the grid row/column. */
    formationPosition: number | null;
    jerseyNumber: number | null;
}

function gridToPosition(grid: string | null): number | null {
    if (!grid) return null;
    const [row, col] = grid.split(':').map(Number);
    if (!Number.isFinite(row) || !Number.isFinite(col)) return null;
    return row * 10 + col;
}

export function mapLineups(lineups: AfLineup[] | undefined): LineupRow[] {
    const rows: LineupRow[] = [];
    for (const lineup of lineups ?? []) {
        for (const [list, isStarter] of [[lineup.startXI, true], [lineup.substitutes, false]] as const) {
            for (const entry of list ?? []) {
                if (!entry.player?.id) continue;
                rows.push({
                    providerPlayerId: entry.player.id,
                    providerTeamId: lineup.team.id,
                    playerName: entry.player.name,
                    isStarter,
                    formation: lineup.formation ?? null,
                    formationPosition: isStarter ? gridToPosition(entry.player.grid) : null,
                    jerseyNumber: entry.player.number ?? null,
                });
            }
        }
    }
    return rows;
}

export interface PlayerStatRow {
    providerPlayerId: number;
    providerTeamId: number;
    playerName: string;
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

function flatten(stats: AfPlayerMatchStats): Record<string, number | string | null> {
    return {
        position: stats.games?.position ?? null,
        number: stats.games?.number ?? null,
        captain: stats.games?.captain ? 1 : 0,
        substitute: stats.games?.substitute ? 1 : 0,
        offsides: stats.offsides ?? null,
        goals_conceded: stats.goals?.conceded ?? null,
        saves: stats.goals?.saves ?? null,
        passes_total: stats.passes?.total ?? null,
        passes_accuracy: asNumber(stats.passes?.accuracy),
        tackles: stats.tackles?.total ?? null,
        blocks: stats.tackles?.blocks ?? null,
        interceptions: stats.tackles?.interceptions ?? null,
        duels_total: stats.duels?.total ?? null,
        duels_won: stats.duels?.won ?? null,
        dribbles_attempts: stats.dribbles?.attempts ?? null,
        dribbles_success: stats.dribbles?.success ?? null,
        fouls_drawn: stats.fouls?.drawn ?? null,
        fouls_committed: stats.fouls?.committed ?? null,
        penalty_won: stats.penalty?.won ?? null,
        penalty_committed: stats.penalty?.commited ?? null,
        penalty_scored: stats.penalty?.scored ?? null,
        penalty_missed: stats.penalty?.missed ?? null,
        penalty_saved: stats.penalty?.saved ?? null,
    };
}

export function mapPlayerStats(players: AfFixtureResponse['players']): PlayerStatRow[] {
    const rows: PlayerStatRow[] = [];
    for (const teamBlock of players ?? []) {
        for (const entry of teamBlock.players ?? []) {
            const stats = entry.statistics?.[0];
            if (!entry.player?.id || !stats) continue;
            rows.push({
                providerPlayerId: entry.player.id,
                providerTeamId: teamBlock.team.id,
                playerName: entry.player.name,
                minutes_played: stats.games?.minutes ?? null,
                rating: asNumber(stats.games?.rating),
                goals: stats.goals?.total ?? 0,
                assists: stats.goals?.assists ?? 0,
                shots_total: stats.shots?.total ?? null,
                shots_on_target: stats.shots?.on ?? null,
                key_passes: stats.passes?.key ?? null,
                yellow_cards: stats.cards?.yellow ?? 0,
                red_cards: stats.cards?.red ?? 0,
                xg: null,
                xa: null,
                stats: flatten(stats),
            });
        }
    }
    return rows;
}

// ---------------------------------------------------------------------------
// Standings
// ---------------------------------------------------------------------------

export interface StandingRowData {
    providerTeamId: number;
    position: number;
    points: number;
    played: number;
    won: number;
    drawn: number;
    lost: number;
    goalsFor: number;
    goalsAgainst: number;
    form: string | null;
    description: string | null;
    group: string;
}

export function mapStandings(groups: AfStanding[][] | undefined, mainGroupName?: string): StandingRowData[] {
    const rows: StandingRowData[] = [];
    for (const group of groups ?? []) {
        for (const s of group) {
            // The main table of a league carries the league name as group
            // (e.g. "Serie A"); we store it as '' so queries can find it
            // without knowing the name. Cup groups keep their name.
            const isMain = (groups?.length ?? 0) === 1 || (mainGroupName !== undefined && s.group === mainGroupName);
            rows.push({
                providerTeamId: s.team.id,
                position: s.rank,
                points: s.points,
                played: s.all?.played ?? 0,
                won: s.all?.win ?? 0,
                drawn: s.all?.draw ?? 0,
                lost: s.all?.lose ?? 0,
                goalsFor: s.all?.goals?.for ?? 0,
                goalsAgainst: s.all?.goals?.against ?? 0,
                form: s.form ?? null,
                description: s.description ?? null,
                group: isMain ? '' : (s.group ?? ''),
            });
        }
    }
    return rows;
}

// ---------------------------------------------------------------------------
// Misc helpers
// ---------------------------------------------------------------------------

export function slugify(name: string, id: number): string {
    const base = name
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
    return `${base || 'x'}-${id}`;
}

export function positionName(position: string | null | undefined): string | null {
    switch ((position ?? '').toLowerCase()) {
        case 'goalkeeper':
        case 'g':
            return 'goalkeeper';
        case 'defender':
        case 'd':
            return 'defender';
        case 'midfielder':
        case 'm':
            return 'midfielder';
        case 'attacker':
        case 'f':
            return 'attacker';
        default:
            return null;
    }
}

// ---------------------------------------------------------------------------
// Player season aggregates (/players?league=&season=)
// ---------------------------------------------------------------------------

/** "180 cm" -> 180, "75 kg" -> 75, null otherwise. */
export function parseMeasure(value: string | null | undefined): number | null {
    if (!value) return null;
    const n = Number.parseInt(value, 10);
    return Number.isFinite(n) && n > 0 ? n : null;
}

export interface PlayerProfileRow {
    provider_id: number;
    name: string;
    first_name: string | null;
    last_name: string | null;
    age: number | null;
    date_of_birth: string | null;
    birth_place: string | null;
    birth_country: string | null;
    nationality: string | null;
    height_cm: number | null;
    weight_kg: number | null;
    injured: boolean;
    image_url: string | null;
    position: string | null;
    slug: string;
    profile_synced_at: string;
}

export function mapPlayerProfile(p: AfPlayerProfile, position: string | null): PlayerProfileRow {
    const name = p.name && p.name.trim() !== '' ? p.name : `Giocatore ${p.id}`;
    return {
        provider_id: p.id,
        name,
        first_name: p.firstname ?? null,
        last_name: p.lastname ?? null,
        age: p.age ?? null,
        date_of_birth: p.birth?.date ?? null,
        birth_place: p.birth?.place ?? null,
        birth_country: p.birth?.country ?? null,
        nationality: p.nationality ?? null,
        height_cm: parseMeasure(p.height),
        weight_kg: parseMeasure(p.weight),
        injured: p.injured === true,
        image_url: p.photo ?? null,
        position: positionName(position),
        slug: slugify(name, p.id),
        profile_synced_at: new Date().toISOString(),
    };
}

export interface PlayerSeasonRow {
    season_year: number;
    position: string | null;
    jersey_number: number | null;
    captain: boolean;
    appearances: number | null;
    lineups: number | null;
    minutes: number | null;
    rating: number | null;
    sub_in: number | null;
    sub_out: number | null;
    bench: number | null;
    shots_total: number | null;
    shots_on: number | null;
    goals: number | null;
    goals_conceded: number | null;
    assists: number | null;
    saves: number | null;
    passes_total: number | null;
    passes_key: number | null;
    passes_accuracy: number | null;
    tackles_total: number | null;
    blocks: number | null;
    interceptions: number | null;
    duels_total: number | null;
    duels_won: number | null;
    dribbles_attempts: number | null;
    dribbles_success: number | null;
    dribbles_past: number | null;
    fouls_drawn: number | null;
    fouls_committed: number | null;
    yellow_cards: number | null;
    yellow_red_cards: number | null;
    red_cards: number | null;
    penalties_won: number | null;
    penalties_committed: number | null;
    penalties_scored: number | null;
    penalties_missed: number | null;
    penalties_saved: number | null;
    raw: AfPlayerSeasonStats;
    synced_at: string;
}

/** Flatten one `statistics[]` entry of /players into a player_season_stats row (ids added by the caller). */
export function mapPlayerSeason(s: AfPlayerSeasonStats): PlayerSeasonRow {
    const rating = asNumber(s.games?.rating);
    return {
        season_year: s.league.season,
        position: positionName(s.games?.position),
        jersey_number: s.games?.number ?? null,
        captain: s.games?.captain === true,
        appearances: s.games?.appearences ?? null,
        lineups: s.games?.lineups ?? null,
        minutes: s.games?.minutes ?? null,
        rating: rating === null ? null : Math.round(rating * 100) / 100,
        sub_in: s.substitutes?.in ?? null,
        sub_out: s.substitutes?.out ?? null,
        bench: s.substitutes?.bench ?? null,
        shots_total: s.shots?.total ?? null,
        shots_on: s.shots?.on ?? null,
        goals: s.goals?.total ?? null,
        goals_conceded: s.goals?.conceded ?? null,
        assists: s.goals?.assists ?? null,
        saves: s.goals?.saves ?? null,
        passes_total: s.passes?.total ?? null,
        passes_key: s.passes?.key ?? null,
        passes_accuracy: asNumber(s.passes?.accuracy),
        tackles_total: s.tackles?.total ?? null,
        blocks: s.tackles?.blocks ?? null,
        interceptions: s.tackles?.interceptions ?? null,
        duels_total: s.duels?.total ?? null,
        duels_won: s.duels?.won ?? null,
        dribbles_attempts: s.dribbles?.attempts ?? null,
        dribbles_success: s.dribbles?.success ?? null,
        dribbles_past: s.dribbles?.past ?? null,
        fouls_drawn: s.fouls?.drawn ?? null,
        fouls_committed: s.fouls?.committed ?? null,
        yellow_cards: s.cards?.yellow ?? null,
        yellow_red_cards: s.cards?.yellowred ?? null,
        red_cards: s.cards?.red ?? null,
        penalties_won: s.penalty?.won ?? null,
        penalties_committed: s.penalty?.commited ?? null,
        penalties_scored: s.penalty?.scored ?? null,
        penalties_missed: s.penalty?.missed ?? null,
        penalties_saved: s.penalty?.saved ?? null,
        raw: s,
        synced_at: new Date().toISOString(),
    };
}
