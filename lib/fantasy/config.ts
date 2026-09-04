import type {FantaRole} from './scores';

/**
 * Auction settings, chosen by the user on the client and kept in
 * localStorage. Shared by the setup form, the board and the price
 * suggestions.
 */

export type AuctionMode = 'classic' | 'mantra';

/** Player pool: one featured league, or the five big European leagues together. */
export type AuctionLeague = 'serie-a' | 'serie-b' | 'premier-league' | 'la-liga' | 'bundesliga' | 'ligue-1' | 'eredivisie' | 'primeira-liga' | 'europe';

export const AUCTION_LEAGUES: ReadonlyArray<{key: AuctionLeague; slugs: string[]}> = [
    {key: 'serie-a', slugs: ['serie-a']},
    {key: 'europe', slugs: ['serie-a', 'premier-league', 'la-liga', 'bundesliga', 'ligue-1']},
    {key: 'premier-league', slugs: ['premier-league']},
    {key: 'la-liga', slugs: ['la-liga']},
    {key: 'bundesliga', slugs: ['bundesliga']},
    {key: 'ligue-1', slugs: ['ligue-1']},
    {key: 'serie-b', slugs: ['serie-b']},
    {key: 'eredivisie', slugs: ['eredivisie']},
    {key: 'primeira-liga', slugs: ['primeira-liga']},
];

export function isAuctionLeague(value: string | null | undefined): value is AuctionLeague {
    return AUCTION_LEAGUES.some((l) => l.key === value);
}

export interface ScoringRules {
    goal: number;
    assist: number;
    goalConceded: number;
    yellow: number;
    red: number;
    penaltyMissed: number;
    penaltySaved: number;
    cleanSheet: number;
}

export interface Modifiers {
    defence: boolean;
    captain: boolean;
    fairPlay: boolean;
    midfield: boolean;
}

export interface AuctionConfig {
    name: string;
    league: AuctionLeague;
    mode: AuctionMode;
    participants: number;
    credits: number;
    slots: Record<FantaRole, number>;
    rules: ScoringRules;
    modifiers: Modifiers;
    /** Who is at the auction (names), first one is the user. */
    managers: string[];
}

export const DEFAULT_SLOTS: Record<AuctionMode, Record<FantaRole, number>> = {
    classic: {P: 3, D: 8, C: 8, A: 6},
    mantra: {P: 3, D: 8, C: 8, A: 7},
};

export const DEFAULT_RULES: ScoringRules = {goal: 3, assist: 1, goalConceded: -1, yellow: -0.5, red: -1, penaltyMissed: -3, penaltySaved: 3, cleanSheet: 1};

export const DEFAULT_CONFIG: AuctionConfig = {
    name: '',
    league: 'serie-a',
    mode: 'classic',
    participants: 8,
    credits: 500,
    slots: DEFAULT_SLOTS.classic,
    rules: DEFAULT_RULES,
    modifiers: {defence: true, captain: false, fairPlay: false, midfield: false},
    managers: [],
};

/** Share of the market that usually goes to each role (Serie A leagues, classic). */
export const ROLE_SHARE: Record<FantaRole, number> = {P: 0.08, D: 0.16, C: 0.28, A: 0.48};

export const STORAGE_KEY = 'gibiscore:fanta:auction';
export const ROSTER_KEY = 'gibiscore:fanta:roster';

/** Bought player as stored on the client. */
export interface Purchase {
    playerId: number;
    price: number;
    /** Index in config.managers; 0 is the user. */
    manager: number;
}

export function totalSlots(slots: Record<FantaRole, number>): number {
    return slots.P + slots.D + slots.C + slots.A;
}

/** Fills missing fields of a stored config with the defaults (older saves). */
export function normalizeConfig(raw: unknown): AuctionConfig | null {
    if (!raw || typeof raw !== 'object') return null;
    const r = raw as Partial<AuctionConfig>;
    if (!isAuctionLeague(r.league)) return null;
    const mode: AuctionMode = r.mode === 'mantra' ? 'mantra' : 'classic';
    const num = (v: unknown, fallback: number, min: number, max: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, Math.round(v))) : fallback);
    const slots = {...DEFAULT_SLOTS[mode], ...(r.slots ?? {})};
    return {
        name: typeof r.name === 'string' ? r.name : '',
        league: r.league,
        mode,
        participants: num(r.participants, DEFAULT_CONFIG.participants, 2, 20),
        credits: num(r.credits, DEFAULT_CONFIG.credits, 50, 5000),
        slots: {P: num(slots.P, 3, 1, 5), D: num(slots.D, 8, 3, 12), C: num(slots.C, 8, 3, 12), A: num(slots.A, 6, 2, 10)},
        rules: {...DEFAULT_RULES, ...(r.rules ?? {})},
        modifiers: {...DEFAULT_CONFIG.modifiers, ...(r.modifiers ?? {})},
        managers: Array.isArray(r.managers) ? r.managers.filter((m): m is string => typeof m === 'string').slice(0, 20) : [],
    };
}
