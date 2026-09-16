import {customStrategyKey, DEFAULT_DEFENCE_BONUS, DEFENCE_THRESHOLDS, type AuctionConfig, type CustomStrategy, type DefenceBonus, type PreferKey} from './config';
import type {FantaRole, FantaScores} from './scores';

/**
 * Auction strategies: how to split the credits between roles, how
 * concentrated the spending is inside a role (one star and fillers, or
 * many mid-priced players) and which profiles to prefer (penalty
 * takers, starters, young upside, one club's block). Each strategy is
 * simulated on the actual pool with the suggested prices, so the advice
 * names real targets and the strategies are ranked by the lineup they
 * would produce.
 */

export type BuiltinKey = 'optimized' | 'balanced' | 'topPerRole' | 'threeStars' | 'strongMidfield' | 'topAttack' | 'defenceBlock' | 'penaltyTakers' | 'safeStarters' | 'youngUpside';
/** A built-in key, or `custom:<id>` for a strategy of the user's own. */
export type StrategyKey = string;

export type FormationKey = '3-4-3' | '3-5-2' | '4-3-3' | '4-4-2' | '4-5-1' | '5-3-2' | '5-4-1';

export interface Formation {
    key: FormationKey;
    /** Players fielded per role. */
    need: Record<FantaRole, number>;
}

/** The classic formations, in the order used to break ties. */
export const FORMATIONS: Formation[] = [
    {key: '3-4-3', need: {P: 1, D: 3, C: 4, A: 3}},
    {key: '4-3-3', need: {P: 1, D: 4, C: 3, A: 3}},
    {key: '3-5-2', need: {P: 1, D: 3, C: 5, A: 2}},
    {key: '4-4-2', need: {P: 1, D: 4, C: 4, A: 2}},
    {key: '4-5-1', need: {P: 1, D: 4, C: 5, A: 1}},
    {key: '5-3-2', need: {P: 1, D: 5, C: 3, A: 2}},
    {key: '5-4-1', need: {P: 1, D: 5, C: 4, A: 1}},
];

export interface PoolPlayer {
    id: number;
    name: string;
    role: FantaRole;
    age?: number | null;
    penaltyTaker?: boolean;
    team: {id?: number; name: string};
    scores: Pick<FantaScores, 'overall' | 'starter' | 'fantaAvg'> & Partial<Pick<FantaScores, 'team' | 'fitness' | 'bonus'>>;
}

export interface Strategy {
    key: StrategyKey;
    /** The user's name for a strategy of his own; the built-in ones are named by the translations. */
    name?: string;
    share: Record<FantaRole, number>;
    /** 0 flat spending inside the role .. 1 one star and fillers. */
    focus: Record<FantaRole, number>;
    /** Only worth it with the defence modifier on. */
    needsDefenceModifier?: boolean;
    /** What the strategy looks for beyond the marks: a bonus on the overall mark when ordering candidates. */
    prefer?: PreferKey;
    /** Explicit slot split of a role's budget (used when the league has that many slots), otherwise the geometric split from focus. */
    fractions?: Partial<Record<FantaRole, number[]>>;
    /** The formations the strategy is built for: they win when the values are within a hair. */
    formations?: FormationKey[];
    /** Players the strategy plans in whatever the marks say, on top of the plan's own wanted list. */
    want?: number[];
}

const starterBonus = (p: PoolPlayer) => (p.scores.starter >= 75 ? 8 : p.scores.starter >= 60 ? 3 : p.scores.starter < 40 ? -12 : 0);

/** The preferences a strategy can have, as bonuses on the overall mark. */
export const PREFERS: Record<Exclude<PreferKey, 'none'>, (p: PoolPlayer, context: {chosen: PoolPlayer[]}) => number> = {
    // Penalty takers and stable bonus makers, whatever the name.
    penalty: (p) => (p.role === 'P' ? 0 : (p.penaltyTaker ? 10 : 0) + ((p.scores.bonus ?? 50) - 50) / 8),
    // Sure starters with a good physical record.
    starters: (p) => starterBonus(p) + ((p.scores.fitness ?? 60) - 60) / 6,
    // Young starters with room to grow; veterans cost.
    young: (p) => (p.age !== null && p.age !== undefined ? (p.age <= 22 ? 9 : p.age <= 25 ? 5 : p.age >= 32 ? -8 : 0) : 0) + (p.scores.starter >= 60 ? 2 : 0),
    // Keeper and defenders of clubs that concede little, ideally the same club as the keeper.
    defence: (p, {chosen}) => {
        if (p.role !== 'P' && p.role !== 'D') return 0;
        const club = ((p.scores.team ?? 50) - 50) / 4;
        const keeper = chosen.find((c) => c.role === 'P');
        const sameClub = p.role === 'D' && keeper && keeper.team.id !== undefined && keeper.team.id === p.team.id ? 6 : 0;
        return club + sameClub;
    },
};

/** The bonus a strategy gives a candidate, if it looks for anything. */
const preferenceOf = (strategy: Strategy, p: PoolPlayer, context: {chosen: PoolPlayer[]}) => (strategy.prefer && strategy.prefer !== 'none' ? PREFERS[strategy.prefer](p, context) : 0);

/** The built-in strategies with a fixed split. "optimized" is drawn on the pool by `optimizedStrategy`. */
export const STRATEGIES: Strategy[] = [
    {key: 'balanced', share: {P: 0.07, D: 0.17, C: 0.28, A: 0.48}, focus: {P: 0.6, D: 0.4, C: 0.45, A: 0.45}, formations: ['4-3-3', '3-4-3', '4-4-2']},
    {key: 'topPerRole', share: {P: 0.08, D: 0.18, C: 0.28, A: 0.46}, focus: {P: 0.8, D: 0.7, C: 0.7, A: 0.75}, formations: ['3-4-3', '4-3-3']},
    {
        key: 'threeStars',
        share: {P: 0.04, D: 0.09, C: 0.27, A: 0.6},
        focus: {P: 0.6, D: 0.3, C: 0.75, A: 0.6},
        formations: ['3-5-2', '4-4-2', '3-4-3'],
        // Two attackers of the same weight, one star midfielder, fillers everywhere else.
        fractions: {A: [0.46, 0.4, 0.05, 0.04, 0.03, 0.02], C: [0.72, 0.08, 0.05, 0.04, 0.03, 0.03, 0.03, 0.02]},
    },
    {key: 'strongMidfield', share: {P: 0.06, D: 0.12, C: 0.42, A: 0.4}, focus: {P: 0.6, D: 0.3, C: 0.4, A: 0.5}, formations: ['3-5-2', '4-5-1', '4-4-2']},
    {key: 'topAttack', share: {P: 0.05, D: 0.1, C: 0.2, A: 0.65}, focus: {P: 0.6, D: 0.3, C: 0.35, A: 0.75}, formations: ['3-4-3', '4-3-3']},
    {
        key: 'defenceBlock',
        share: {P: 0.12, D: 0.28, C: 0.22, A: 0.38},
        focus: {P: 0.8, D: 0.35, C: 0.4, A: 0.5},
        formations: ['5-3-2', '4-4-2', '5-4-1'],
        needsDefenceModifier: true,
        prefer: 'defence',
    },
    {
        key: 'penaltyTakers',
        share: {P: 0.06, D: 0.16, C: 0.3, A: 0.48},
        focus: {P: 0.6, D: 0.4, C: 0.5, A: 0.5},
        prefer: 'penalty',
    },
    {
        key: 'safeStarters',
        share: {P: 0.06, D: 0.17, C: 0.3, A: 0.47},
        focus: {P: 0.4, D: 0.2, C: 0.2, A: 0.25},
        prefer: 'starters',
    },
    {
        key: 'youngUpside',
        share: {P: 0.06, D: 0.16, C: 0.3, A: 0.48},
        focus: {P: 0.6, D: 0.35, C: 0.35, A: 0.45},
        prefer: 'young',
    },
];

/** A strategy of the user's own, as the planner runs it. */
export function toStrategy(custom: CustomStrategy): Strategy {
    const formations = custom.formations.filter((f): f is FormationKey => FORMATIONS.some((k) => k.key === f));
    return {key: customStrategyKey(custom.id), name: custom.name, share: custom.share, focus: custom.focus, prefer: custom.prefer, formations: formations.length > 0 ? formations : undefined, want: custom.want.length > 0 ? custom.want : undefined};
}

/** The editable copy of a strategy (a built-in one or a plan's), to start a strategy of the user's own from. */
export function customFrom(strategy: Strategy, id: string, name: string): CustomStrategy {
    return {id, name, base: strategy.key.startsWith('custom:') ? null : strategy.key, share: {...strategy.share}, focus: {...strategy.focus}, formations: [...(strategy.formations ?? [])], prefer: strategy.prefer ?? 'none', want: [...(strategy.want ?? [])]};
}

/** A fresh id for a custom strategy, unlike the ones taken. */
export function newCustomId(taken: CustomStrategy[]): string {
    let n = taken.length + 1;
    while (taken.some((c) => c.id === `s${n}`)) n += 1;
    return `s${n}`;
}

export interface StrategyPick {
    id: number;
    name: string;
    team: string;
    role: FantaRole;
    price: number;
    overall: number;
    /** The most the strategy would pay for this slot. */
    maxBid: number;
    /** Planned because the user asked for him, not because the marks chose him. */
    pinned?: boolean;
}

/** What the user has already bought: reduces the role budgets and uses up the biggest slots first. */
export interface OwnPurchase {
    playerId: number;
    role: FantaRole;
    price: number;
}

/** What the user told the planner: players to build around, players to leave alone. */
export interface PlanPrefs {
    want?: Set<number>;
    avoid?: Set<number>;
}

export interface StrategyPlan {
    key: StrategyKey;
    /** The user's name, for a strategy of his own. */
    name?: string;
    /** The definition the plan was drawn with, to plan it again (a preview, a copy to edit). */
    strategy: Strategy;
    share: Record<FantaRole, number>;
    /** Credits per role. */
    budget: Record<FantaRole, number>;
    /** Suggested roster, by role, best first. */
    picks: Record<FantaRole, StrategyPick[]>;
    spent: number;
    /** Expected fantasy points of the best eleven, per match, in the best formation for the roster. */
    lineupValue: number;
    /** The formation that gets the most out of the roster. */
    formation: FormationKey;
    /** Every formation valued on the roster, best first. */
    formations: FormationValue[];
    /** Sum of the overall marks of the roster. */
    depth: number;
    available: boolean;
}

const ROLES: FantaRole[] = ['P', 'D', 'C', 'A'];

/** Slot budgets inside a role: geometric split, steeper with more focus. */
export function slotFractions(slots: number, focus: number): number[] {
    if (slots <= 0) return [];
    const r = 1 - 0.85 * Math.max(0, Math.min(1, focus));
    const raw = Array.from({length: slots}, (_, i) => r ** i);
    const total = raw.reduce((s, v) => s + v, 0);
    return raw.map((v) => v / total);
}

/**
 * Slot budgets when the formation is fixed: the money goes to the
 * starters of the role in that formation plus one cover, split with
 * the strategy's focus; the other slots are fillers at a credit or two.
 */
export function slotFractionsFor(slots: number, focus: number, starters: number): number[] {
    if (slots <= 0) return [];
    const paid = Math.min(slots, Math.max(1, starters) + 1);
    const r = 1 - 0.85 * Math.max(0, Math.min(1, focus));
    const raw = Array.from({length: slots}, (_, i) => (i < paid ? r ** i : 0.01));
    const total = raw.reduce((s, v) => s + v, 0);
    return raw.map((v) => v / total);
}

/** Starters per role the strategy shares were drawn for: between a 3-4-3 and a 4-3-3. */
const BASE_NEED: Record<FantaRole, number> = {P: 1, D: 3.5, C: 3.5, A: 3};

/** The strategy's split of the credits bent towards the roles a formation fields more of, renormalized. */
export function shareFor(share: Record<FantaRole, number>, formation: Formation | null): Record<FantaRole, number> {
    if (!formation) return share;
    const raw = {} as Record<FantaRole, number>;
    for (const role of ROLES) raw[role] = share[role] * (formation.need[role] / BASE_NEED[role]) ** 0.6;
    const total = ROLES.reduce((s, role) => s + raw[role], 0);
    for (const role of ROLES) raw[role] = raw[role] / total;
    return raw;
}

export interface LineupPlayer {
    role: FantaRole;
    scores: Pick<FantaScores, 'starter' | 'fantaAvg'>;
}

export interface FormationValue {
    key: FormationKey;
    /** Expected fantasy points per match of the best eleven in this formation. */
    value: number;
}

export interface Lineup {
    formation: FormationKey;
    value: number;
    /** Every formation, best first. */
    formations: FormationValue[];
}

export interface LineupOptions {
    /** The league plays the defence modifier: formations with enough defenders earn it (`true` = the classic table). */
    defenceModifier?: boolean | DefenceBonus;
    /** Formations to prefer when the values are within a hair of the best (a strategy's natural shape). */
    prefer?: FormationKey[];
}

/** What a player is expected to bring per match: his fantamedia, discounted when he is not a sure starter. */
/** Chance he is on the pitch on a given matchday, from the starter mark. */
export const playChance = (p: LineupPlayer) => Math.max(0.05, Math.min(1, p.scores.starter / 100));
/** What a player is expected to bring per match when fielded: his fantamedia, weighted by the chance he actually plays. */
export const playerValue = (p: LineupPlayer) => (p.scores.fantaAvg ?? 5.5) * playChance(p);

/**
 * Defence modifier, estimated with the league's table: the average vote
 * of the keeper and the three best defenders fielded, with at least the
 * table's defenders on the pitch. Fantamedie stand in for votes: a
 * keeper's fantamedia sits about a goal below his vote, a defender's
 * about level.
 */
function defenceModifier(keeper: LineupPlayer | undefined, defenders: LineupPlayer[], bonus: DefenceBonus): number {
    if (!keeper || defenders.length < bonus.minDefenders) return 0;
    const ratings = [(keeper.scores.fantaAvg ?? 5) + 1, ...defenders.slice(0, 3).map((d) => d.scores.fantaAvg ?? 5.8)];
    const avg = ratings.reduce((s, v) => s + v, 0) / ratings.length;
    let points = 0;
    DEFENCE_THRESHOLDS.forEach((from, i) => {
        if (avg >= from) points = bonus.points[i] ?? points;
    });
    return points;
}

/** What to hand `bestLineup` for a league: its table when the modifier is on and pays something, else nothing. */
export function defenceOption(config: Partial<Pick<AuctionConfig, 'modifiers' | 'defenceBonus'>>): DefenceBonus | false {
    if (!config.modifiers?.defence) return false;
    const bonus = config.defenceBonus ?? DEFAULT_DEFENCE_BONUS;
    return bonus.points.some((p) => p > 0) ? bonus : false;
}

/**
 * Best eleven of a roster in every classic formation. A fielded player
 * brings his fantamedia when he plays; when he does not, the best man
 * left on the bench in his role plays instead (the automatic
 * substitution), so a rotation-prone striker is not worth nothing and
 * a roster with no cover pays for it. Slots the roster cannot fill are
 * worth nothing. When formations are within a hair of each other, the
 * preferred ones win.
 */
export function bestLineup(players: LineupPlayer[], options: LineupOptions = {}): Lineup {
    const bonus = options.defenceModifier === true ? DEFAULT_DEFENCE_BONUS : options.defenceModifier || null;
    const sorted = {} as Record<FantaRole, LineupPlayer[]>;
    for (const role of ROLES) sorted[role] = players.filter((p) => p.role === role).sort((a, b) => playerValue(b) - playerValue(a));
    const formations = FORMATIONS.map((f) => {
        let value = 0;
        for (const role of ROLES) {
            const need = f.need[role];
            const fielded = sorted[role].slice(0, need);
            const bench = sorted[role][need];
            const cover = bench ? playerValue(bench) : 0;
            // One substitute: he plays when at least one of the fielded is out.
            const allPlay = fielded.reduce((prod, p) => prod * playChance(p), 1);
            value += fielded.reduce((s, p) => s + playerValue(p), 0) + (fielded.length > 0 ? (1 - allPlay) * cover : 0);
        }
        if (bonus && f.need.D >= bonus.minDefenders) {
            // The modifier needs the keeper and the defenders on the pitch: paid in proportion to how surely they are.
            const line = [sorted.P[0], ...sorted.D.slice(0, bonus.minDefenders)].filter((p): p is LineupPlayer => !!p);
            const onPitch = line.length > 0 ? line.reduce((s, p) => s + playChance(p), 0) / line.length : 0;
            value += defenceModifier(sorted.P[0], sorted.D.slice(0, f.need.D), bonus) * onPitch;
        }
        return {key: f.key, value: Math.round(value * 10) / 10};
    }).sort((a, b) => b.value - a.value || FORMATIONS.findIndex((f) => f.key === a.key) - FORMATIONS.findIndex((f) => f.key === b.key));
    const best = formations[0];
    const preferred = options.prefer?.map((key) => formations.find((f) => f.key === key)).find((f) => f && f.value >= best.value * 0.98);
    const chosen = preferred ?? best;
    return {formation: chosen.key, value: chosen.value, formations: [chosen, ...formations.filter((f) => f !== chosen)]};
}

/** Simulates one strategy on the pool: fills every slot with the best player (by mark plus what the strategy prefers) affordable for that slot's budget. */
export function planStrategy(strategy: Strategy, players: PoolPlayer[], prices: Map<number, number>, config: Pick<AuctionConfig, 'credits' | 'slots'> & Partial<Pick<AuctionConfig, 'modifiers' | 'formation' | 'defenceBonus'>>, taken: Set<number> = new Set(), mine: OwnPurchase[] = [], prefs: PlanPrefs = {}): StrategyPlan {
    // Wanted by the user for every plan, or by this strategy alone; a wanted player is never ignored.
    const want = new Set<number>([...(prefs.want ?? []), ...(strategy.want ?? [])]);
    const avoid = new Set<number>([...(prefs.avoid ?? [])].filter((id) => !want.has(id)));
    // A fixed formation bends the split towards the roles it fields more of and pays its starters first.
    const forced = FORMATIONS.find((f) => f.key === config.formation) ?? null;
    const share = shareFor(strategy.share, forced);
    const budget = {P: 0, D: 0, C: 0, A: 0} as Record<FantaRole, number>;
    const picks = {P: [], D: [], C: [], A: []} as Record<FantaRole, StrategyPick[]>;
    const byId = new Map(players.map((p) => [p.id, p]));
    const chosen: PoolPlayer[] = mine.map((m) => byId.get(m.playerId)).filter((p): p is PoolPlayer => !!p);
    let spent = mine.reduce((s, m) => s + m.price, 0);
    let depth = chosen.reduce((s, p) => s + p.scores.overall, 0);
    // The split, rounded so it adds up to the credits exactly (largest remainders get the odd credit).
    const exact = ROLES.map((role) => config.credits * share[role]);
    ROLES.forEach((role, i) => (budget[role] = Math.floor(exact[i])));
    let odd = config.credits - ROLES.reduce((s, role) => s + budget[role], 0);
    for (const i of ROLES.map((_, i) => i).sort((a, b) => exact[b] - Math.floor(exact[b]) - (exact[a] - Math.floor(exact[a])))) {
        if (odd <= 0) break;
        budget[ROLES[i]] += 1;
        odd -= 1;
    }
    // What I overpaid in a role comes off the roles still to fill (leaving a credit per open
    // slot); what I saved in a role already complete goes to them. The split follows the auction.
    const spentOn = {} as Record<FantaRole, number>;
    const room = {} as Record<FantaRole, number>;
    let net = 0;
    const flexible: FantaRole[] = [];
    for (const role of ROLES) {
        const owned = mine.filter((m) => m.role === role);
        spentOn[role] = owned.reduce((s, m) => s + m.price, 0);
        const open = Math.max(0, config.slots[role] - owned.length);
        // The players the user wants are as good as bought: their price is charged to the role now,
        // so a wanted star does not vanish from the plan for being above the role's usual share.
        const wanted = players.filter((p) => p.role === role && want.has(p.id) && !taken.has(p.id) && !owned.some((m) => m.playerId === p.id)).slice(0, open);
        const wantedCost = wanted.reduce((s, p) => s + (prices.get(p.id) ?? 1), 0);
        // The other open slots need at least the cheapest players still on the market.
        const cheapest = players
            .filter((p) => p.role === role && !taken.has(p.id) && !want.has(p.id) && !owned.some((m) => m.playerId === p.id))
            .map((p) => prices.get(p.id) ?? 1)
            .sort((a, b) => a - b)
            .slice(0, open - wanted.length);
        const floorCost = cheapest.reduce((s, v) => s + v, 0) + Math.max(0, open - wanted.length - cheapest.length);
        room[role] = budget[role] - spentOn[role] - wantedCost - floorCost;
        if (room[role] < 0) net -= room[role];
        else if (open === 0) net -= room[role];
        else flexible.push(role);
        // A role I have filled is worth what I paid for it: its surplus or deficit moves to the others.
        if (open === 0) budget[role] = spentOn[role];
    }
    const roomTotal = flexible.reduce((s, role) => s + room[role], 0);
    const baseTotal = flexible.reduce((s, role) => s + budget[role], 0);
    if (net > 0 && roomTotal > 0) {
        const cut = Math.min(net, roomTotal);
        for (const role of flexible) budget[role] -= Math.ceil((cut * room[role]) / roomTotal);
        // A role that needs more than its share with slots still open (overpaid, or a wanted star)
        // gets what the others gave up, so the plan can still fill it, a credit per slot at least.
        for (const role of ROLES) {
            const open = config.slots[role] - mine.filter((m) => m.role === role).length;
            if (room[role] < 0 && open > 0) budget[role] += Math.floor((-room[role] * cut) / net);
        }
    } else if (net < 0 && baseTotal > 0) {
        for (const role of flexible) budget[role] += Math.floor((-net * budget[role]) / baseTotal);
    }
    /** Fills the role's open slots from its budget (again, from scratch, when its budget changed). */
    const fill = (role: FantaRole) => {
        const owned = mine.filter((m) => m.role === role);
        for (const pick of picks[role]) {
            const at = chosen.findIndex((p) => p.id === pick.id && !owned.some((m) => m.playerId === p.id));
            if (at >= 0) chosen.splice(at, 1);
        }
        picks[role] = [];
        // What I already have in the role fills the plan first, then the biggest slots are gone.
        for (const m of owned) {
            const p = byId.get(m.playerId);
            if (p) picks[role].push({id: p.id, name: p.name, team: p.team.name, role, price: m.price, overall: p.scores.overall, maxBid: m.price});
        }
        const candidates = players.filter((p) => p.role === role && !taken.has(p.id) && !avoid.has(p.id) && !owned.some((m) => m.playerId === p.id));
        const used = new Set<number>();
        let left = budget[role] - owned.reduce((s, m) => s + m.price, 0);
        const custom = strategy.fractions?.[role];
        const all = forced ? slotFractionsFor(config.slots[role], strategy.focus[role], forced.need[role]) : custom && custom.length === config.slots[role] ? custom : slotFractions(config.slots[role], strategy.focus[role]);
        const fractions = [...all].sort((a, b) => b - a).slice(owned.length);
        fractions.forEach((fraction, index) => {
            const slotsLeft = fractions.length - index;
            // Not even a credit per slot left: the plan cannot buy here any more.
            if (left < slotsLeft) return;
            // The strategy's preferences shift the order (a penalty taker, a starter, a youngster...).
            const rank = (p: PoolPlayer) => p.scores.overall + preferenceOf(strategy, p, {chosen});
            const pool = candidates.filter((p) => !used.has(p.id)).sort((a, b) => rank(b) - rank(a) || (b.scores.fantaAvg ?? 0) - (a.scores.fantaAvg ?? 0));
            // What this slot may cost: its share of the role budget, never more than what leaves enough
            // for the remaining slots at the cheapest prices still on the market.
            const cheapestLeft = pool.map((p) => prices.get(p.id) ?? 1).sort((a, b) => a - b);
            const reserve = cheapestLeft.slice(1, slotsLeft).reduce((s, v) => s + v, 0) + Math.max(0, slotsLeft - cheapestLeft.length);
            const room = left - reserve;
            // The slot's share of what is left in the role, so money a slot did not need flows to the next ones.
            const restFractions = fractions.slice(index).reduce((sum, f) => sum + f, 0);
            let cap = Math.max(1, Math.min(Math.round(((left * fraction) / Math.max(fraction, restFractions)) * 1.15), room));
            // A slot too small for anyone still on the market takes the cheapest player left, when the budget allows it.
            const cheapest = pool.reduce((m, p) => Math.min(m, prices.get(p.id) ?? 1), Infinity);
            if (cheapest > cap && cheapest <= room) cap = cheapest;
            // The players the user wants come first, dearest first, in the biggest slots: the slot's
            // cap does not stop them, only what must be left to finish the roster does.
            const pinned = pool.filter((p) => want.has(p.id)).sort((a, b) => (prices.get(b.id) ?? 1) - (prices.get(a.id) ?? 1)).find((p) => (prices.get(p.id) ?? 1) <= room) ?? null;
            const pick = pinned ?? pool.find((p) => (prices.get(p.id) ?? 1) <= cap);
            if (!pick) return;
            const price = prices.get(pick.id) ?? 1;
            used.add(pick.id);
            chosen.push(pick);
            left -= price;
            picks[role].push({id: pick.id, name: pick.name, team: pick.team.name, role, price, overall: pick.scores.overall, maxBid: Math.max(price, cap), pinned: pinned !== null});
        });
    };
    for (const role of ROLES) fill(role);
    // What a role could not spend (its targets gone, nobody dear enough left) goes to the roles
    // that used their share, which are planned again with it: the money is not lost to the plan.
    const unspent = {} as Record<FantaRole, number>;
    for (const role of ROLES) unspent[role] = Math.max(0, budget[role] - picks[role].reduce((s, p) => s + p.price, 0));
    const takers = ROLES.filter((role) => mine.filter((m) => m.role === role).length < config.slots[role] && unspent[role] <= Math.max(2, budget[role] * 0.05));
    const spare = ROLES.filter((role) => !takers.includes(role)).reduce((s, role) => s + unspent[role], 0);
    if (spare >= 5 && takers.length > 0) {
        const base = takers.reduce((s, role) => s + budget[role], 0);
        let given = 0;
        for (const role of ROLES) if (!takers.includes(role)) budget[role] -= unspent[role];
        for (const role of takers) {
            const part = base > 0 ? Math.floor((spare * budget[role]) / base) : Math.floor(spare / takers.length);
            budget[role] += part;
            given += part;
        }
        budget[takers[0]] += spare - given;
        for (const role of takers) fill(role);
    }
    for (const role of ROLES) {
        for (const pick of picks[role]) {
            if (mine.some((m) => m.playerId === pick.id)) continue;
            spent += pick.price;
            depth += pick.overall;
        }
    }
    const roster = ROLES.flatMap((role) => picks[role].map((p) => byId.get(p.id))).filter((p): p is PoolPlayer => !!p);
    let lineup = bestLineup(roster, {defenceModifier: defenceOption(config), prefer: forced ? [forced.key] : strategy.formations});
    if (forced) {
        // Valued in the formation asked for, whatever the roster would prefer.
        const chosen = lineup.formations.find((f) => f.key === forced.key)!;
        lineup = {formation: chosen.key, value: chosen.value, formations: [chosen, ...lineup.formations.filter((f) => f !== chosen)]};
    }
    // Ranked on the best the roster can field; the preferred shape is for the display (a forced one is the value asked for).
    const lineupValue = forced ? lineup.value : Math.max(...lineup.formations.map((f) => f.value));
    return {key: strategy.key, name: strategy.name, strategy, share, budget, picks, spent, lineupValue, formation: lineup.formation, formations: lineup.formations, depth, available: true};
}

/**
 * Plan B of every open target: whom the strategy puts in the roster if
 * the target goes to another table, drawn again without him. The first
 * name is the next target itself (the plan the board will show once he
 * is gone), the next ones follow if he goes too: the plan B is never a
 * player the plan would not pick. Only his role: money the plan moves
 * elsewhere is not a plan B.
 */
export function planBFor(strategy: Strategy, players: PoolPlayer[], prices: Map<number, number>, config: Parameters<typeof planStrategy>[3], taken: Set<number>, mine: OwnPurchase[], prefs: PlanPrefs, targets: StrategyPick[], count = 3): Map<number, StrategyPick[]> {
    const out = new Map<number, StrategyPick[]>();
    const base = planStrategy(strategy, players, prices, config, taken, mine, prefs);
    for (const target of targets) {
        if (mine.some((m) => m.playerId === target.id)) continue;
        const gone = new Set(taken);
        gone.add(target.id);
        const alternatives: StrategyPick[] = [];
        // Who takes the slot without him; then without the two of them, and so on.
        for (let step = 0; step < count; step += 1) {
            const plan = planStrategy(strategy, players, prices, config, gone, mine, prefs);
            const known = new Set([...base.picks[target.role].map((p) => p.id), ...alternatives.map((p) => p.id)]);
            // The dearest newcomer is the one in his slot; a cheaper one the plan shuffled in beside him is not a plan B.
            const newcomer = plan.picks[target.role].filter((p) => !known.has(p.id) && !gone.has(p.id)).sort((a, b) => b.price - a.price || b.overall - a.overall)[0];
            if (!newcomer) break;
            alternatives.push(newcomer);
            gone.add(newcomer.id);
        }
        out.set(target.id, alternatives);
    }
    return out;
}

/** The splits the optimized strategy tries: a coarse grid over the shares, then a step around the best. */
const OPTIMIZED_GRID = {P: [0.06, 0.1], D: [0.14, 0.2, 0.26], C: [0.22, 0.28, 0.34]};
const OPTIMIZED_FOCUS: Record<FantaRole, number> = {P: 0.6, D: 0.4, C: 0.6, A: 0.5};

/**
 * The split that buys the best eleven on this pool at these prices,
 * from what I own: every strategy above has its split fixed in advance,
 * this one searches it. A coarse grid over the shares, then a finer
 * step around the best; the attack takes what the other roles leave.
 */
export function optimizedStrategy(players: PoolPlayer[], prices: Map<number, number>, config: Parameters<typeof planStrategy>[3], taken: Set<number> = new Set(), mine: OwnPurchase[] = [], prefs: PlanPrefs = {}): Strategy {
    const candidate = (P: number, D: number, C: number): Strategy | null => {
        const A = 1 - P - D - C;
        if (A < 0.25 || A > 0.7) return null;
        return {key: 'optimized', share: {P, D, C, A}, focus: OPTIMIZED_FOCUS};
    };
    let best: Strategy = {key: 'optimized', share: STRATEGIES[0].share, focus: OPTIMIZED_FOCUS};
    let bestValue = -Infinity;
    const consider = (s: Strategy | null) => {
        if (!s) return;
        const v = planStrategy(s, players, prices, config, taken, mine, prefs).lineupValue;
        if (v > bestValue + 1e-9) {
            best = s;
            bestValue = v;
        }
    };
    for (const P of OPTIMIZED_GRID.P) for (const D of OPTIMIZED_GRID.D) for (const C of OPTIMIZED_GRID.C) consider(candidate(P, D, C));
    const {P, D, C} = best.share;
    for (const dD of [-0.03, 0, 0.03]) for (const dC of [-0.03, 0, 0.03]) if (dD !== 0 || dC !== 0) consider(candidate(P, Math.max(0.05, D + dD), Math.max(0.1, C + dC)));
    const share = {} as Record<FantaRole, number>;
    for (const role of ROLES) share[role] = Math.round(best.share[role] * 100) / 100;
    return {...best, share};
}

/** Every strategy planned on the pool, best lineup first; strategies that need a modifier the league lacks are marked unavailable. */
export function rankStrategies(players: PoolPlayer[], prices: Map<number, number>, config: Pick<AuctionConfig, 'credits' | 'slots' | 'modifiers'> & Partial<Pick<AuctionConfig, 'formation' | 'defenceBonus'>>, taken: Set<number> = new Set(), mine: OwnPurchase[] = [], prefs: PlanPrefs = {}, customs: CustomStrategy[] = []): StrategyPlan[] {
    const all: Strategy[] = [optimizedStrategy(players, prices, config, taken, mine, prefs), ...STRATEGIES, ...customs.map(toStrategy)];
    return all.map((s) => ({...planStrategy(s, players, prices, config, taken, mine, prefs), available: !s.needsDefenceModifier || defenceOption(config) !== false})).sort((a, b) => Number(b.available) - Number(a.available) || b.lineupValue - a.lineupValue || b.depth - a.depth);
}

export type HealthStatus = 'ok' | 'warn' | 'switch';

export type HealthReason =
    /** Another strategy would buy a better eleven from here. */
    | {kind: 'behind'; best: StrategyKey; gap: number; pct: number}
    /** The strategy is worth less than when the auction started. */
    | {kind: 'drift'; pct: number}
    /** A role has cost more than its share. */
    | {kind: 'overspent'; role: FantaRole; spent: number; budget: number}
    /** A role's share is gone with slots still to fill. */
    | {kind: 'starved'; role: FantaRole; left: number; open: number}
    /** The strategy's key targets have gone to other managers. */
    | {kind: 'targetsLost'; lost: number; total: number};

export interface StrategyHealth {
    status: HealthStatus;
    /** The strategy in use, re-planned from what I own at live prices. */
    current: StrategyPlan;
    /** The best strategy available from here (may be the current one). */
    best: StrategyPlan;
    /** How much better the best one is, against the current value. */
    gapPct: number;
    /** How the strategy compares with itself at the start of the auction. */
    driftPct: number;
    reasons: HealthReason[];
}

/**
 * How the strategy in use is going. Every plan already starts from what
 * I own, so the best plan is the best I can still do: when it beats the
 * current one clearly, switching is the advice. Spending a role's share
 * with slots still open, losing the key targets and a value well below the
 * start are the warnings on the way.
 */
export function strategyHealth(plans: StrategyPlan[], key: StrategyKey, baseline: StrategyPlan[], config: Pick<AuctionConfig, 'slots'>, mine: OwnPurchase[], taken: Set<number>): StrategyHealth | null {
    const current = plans.find((p) => p.key === key);
    if (!current) return null;
    const best = plans.find((p) => p.available) ?? current;
    const reasons: HealthReason[] = [];
    const gapPct = current.lineupValue > 0 && best.key !== current.key ? (best.lineupValue - current.lineupValue) / current.lineupValue : 0;
    if (gapPct >= 0.02) reasons.push({kind: 'behind', best: best.key, gap: Math.round((best.lineupValue - current.lineupValue) * 10) / 10, pct: gapPct});
    const start = baseline.find((p) => p.key === key);
    const driftPct = start && start.lineupValue > 0 ? current.lineupValue / start.lineupValue - 1 : 0;
    if (driftPct <= -0.06) reasons.push({kind: 'drift', pct: driftPct});
    let broken = false;
    // Judged on the strategy's own split from the start: the re-planned one already bends to what I paid.
    const share = start?.budget ?? current.budget;
    for (const role of ROLES) {
        const owned = mine.filter((m) => m.role === role);
        const spent = owned.reduce((s, m) => s + m.price, 0);
        const open = Math.max(0, config.slots[role] - owned.length);
        const left = share[role] - spent;
        if (open > 0 && left < open) {
            reasons.push({kind: 'starved', role, left: Math.max(0, left), open});
            broken = true;
        } else if (spent > share[role] * 1.1 && spent > share[role] + 5) {
            reasons.push({kind: 'overspent', role, spent, budget: share[role]});
            broken = true;
        }
    }
    // The key targets: the two dearest picks of each role (one keeper) in the plan drawn at the start.
    let lost = 0;
    let total = 0;
    if (start) {
        for (const role of ROLES) {
            const keys = [...start.picks[role]].sort((a, b) => b.price - a.price).slice(0, role === 'P' ? 1 : 2);
            total += keys.length;
            lost += keys.filter((p) => taken.has(p.id)).length;
        }
        if (total > 0 && lost / total >= 0.5) reasons.push({kind: 'targetsLost', lost, total});
    }
    const status: HealthStatus = gapPct >= 0.05 || (gapPct >= 0.025 && (broken || driftPct <= -0.08)) ? 'switch' : reasons.length > 0 ? 'warn' : 'ok';
    return {status, current, best, gapPct, driftPct, reasons};
}
