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
}

/**
 * What the defence modifier pays: the average vote of the keeper and the
 * three best-voted defenders, with at least `minDefenders` fielded, earns
 * `points[i]` from the i-th threshold (6, 6.25, 6.5, 6.75, 7).
 */
export interface DefenceBonus {
    minDefenders: number;
    points: number[];
}
export const DEFENCE_THRESHOLDS = [6, 6.25, 6.5, 6.75, 7] as const;
/** Fantacalcio.it classic table. */
export const DEFAULT_DEFENCE_BONUS: DefenceBonus = {minDefenders: 4, points: [1, 2, 3, 4, 6]};

export interface AuctionConfig {
    name: string;
    league: AuctionLeague;
    mode: AuctionMode;
    participants: number;
    credits: number;
    slots: Record<FantaRole, number>;
    rules: ScoringRules;
    modifiers: Modifiers;
    /** The league's defence modifier table, when the modifier is on. */
    defenceBonus: DefenceBonus;
    /** Who is at the auction (names), first one is the user. */
    managers: string[];
    /** Chosen auction strategy (lib/fantasy/strategies.ts), drives my role budgets. */
    strategy: string | null;
    /** Formation the plans must be built for (e.g. "3-4-3"); null = the one that gets the most out of the roster. */
    formation: string | null;
    /** Whether cups (domestic and European) count in the marks; off = only the main league of each country. */
    cupsCount: boolean;
    /** Roles corrected by hand, by player id. */
    roleOverrides: Record<string, FantaRole>;
    /** Players the strategies must plan for (ids), whatever the marks say. */
    want: number[];
    /** Players the strategies must never suggest (ids). */
    avoid: number[];
    /**
     * Level of the prices, percent. 100 = the list prices add up exactly to the credits at the
     * table; higher = the list of a contested auction, where the money piles up on the players
     * worth having and the fillers go for one credit anyway.
     */
    priceLevel: number;
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
    modifiers: {defence: true},
    defenceBonus: DEFAULT_DEFENCE_BONUS,
    managers: [],
    strategy: null,
    formation: null,
    cupsCount: false,
    roleOverrides: {},
    want: [],
    avoid: [],
    priceLevel: 100,
};

/** Share of the market that usually goes to each role (Serie A leagues, classic). */
export const ROLE_SHARE: Record<FantaRole, number> = {P: 0.11, D: 0.11, C: 0.24, A: 0.54};

export const STORAGE_KEY = 'gibiscore:fanta:auction';
export const ROSTER_KEY = 'gibiscore:fanta:roster';
export const CLOUD_KEY = 'gibiscore:fanta:cloud';

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
    const ids = (v: unknown) => (Array.isArray(v) ? [...new Set(v.filter((id): id is number => typeof id === 'number' && Number.isInteger(id)))].slice(0, 60) : []);
    return {
        name: typeof r.name === 'string' ? r.name : '',
        league: r.league,
        mode,
        participants: num(r.participants, DEFAULT_CONFIG.participants, 2, 20),
        credits: num(r.credits, DEFAULT_CONFIG.credits, 50, 5000),
        slots: {P: num(slots.P, 3, 1, 5), D: num(slots.D, 8, 3, 12), C: num(slots.C, 8, 3, 12), A: num(slots.A, 6, 2, 10)},
        rules: {...DEFAULT_RULES, ...(r.rules ?? {})},
        modifiers: {defence: typeof r.modifiers?.defence === 'boolean' ? r.modifiers.defence : DEFAULT_CONFIG.modifiers.defence},
        defenceBonus: {
            minDefenders: num(r.defenceBonus?.minDefenders, DEFAULT_DEFENCE_BONUS.minDefenders, 3, 5),
            points: DEFENCE_THRESHOLDS.map((_, i) => {
                const v = r.defenceBonus?.points?.[i];
                return typeof v === 'number' && Number.isFinite(v) ? Math.min(20, Math.max(0, Math.round(v * 2) / 2)) : DEFAULT_DEFENCE_BONUS.points[i];
            }),
        },
        managers: Array.isArray(r.managers) ? r.managers.filter((m): m is string => typeof m === 'string').slice(0, 20) : [],
        strategy: typeof r.strategy === 'string' ? r.strategy : null,
        formation: typeof r.formation === 'string' && /^\d-\d-\d(-\d)?$/.test(r.formation) ? r.formation : null,
        cupsCount: typeof r.cupsCount === 'boolean' ? r.cupsCount : false,
        roleOverrides: Object.fromEntries(Object.entries(r.roleOverrides ?? {}).filter(([, v]) => v === 'P' || v === 'D' || v === 'C' || v === 'A')) as Record<string, FantaRole>,
        want: ids(r.want),
        avoid: ids(r.avoid),
        // 135 was the default before the value model was retuned: it reads as the new default.
        priceLevel: r.priceLevel === 135 ? DEFAULT_CONFIG.priceLevel : num(r.priceLevel, DEFAULT_CONFIG.priceLevel, 50, 300),
    };
}
