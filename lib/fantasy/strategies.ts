import type {AuctionConfig} from './config';
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

export type StrategyKey = 'balanced' | 'topPerRole' | 'threeStars' | 'strongMidfield' | 'topAttack' | 'defenceBlock' | 'penaltyTakers' | 'safeStarters' | 'youngUpside';

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
    share: Record<FantaRole, number>;
    /** 0 flat spending inside the role .. 1 one star and fillers. */
    focus: Record<FantaRole, number>;
    /** Only worth it with the defence modifier on. */
    needsDefenceModifier?: boolean;
    /** Bonus added to the overall mark when ordering candidates: what the strategy looks for. */
    prefer?: (p: PoolPlayer, context: {chosen: PoolPlayer[]}) => number;
    /** Explicit slot split of a role's budget (used when the league has that many slots), otherwise the geometric split from focus. */
    fractions?: Partial<Record<FantaRole, number[]>>;
    /** The formations the strategy is built for: they win when the values are within a hair. */
    formations?: FormationKey[];
}

const starterBonus = (p: PoolPlayer) => (p.scores.starter >= 75 ? 8 : p.scores.starter >= 60 ? 3 : p.scores.starter < 40 ? -12 : 0);

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
        // Keeper and defenders of clubs that concede little, ideally the same club as the keeper.
        prefer: (p, {chosen}) => {
            if (p.role !== 'P' && p.role !== 'D') return 0;
            const club = ((p.scores.team ?? 50) - 50) / 4;
            const keeper = chosen.find((c) => c.role === 'P');
            const sameClub = p.role === 'D' && keeper && keeper.team.id !== undefined && keeper.team.id === p.team.id ? 6 : 0;
            return club + sameClub;
        },
    },
    {
        key: 'penaltyTakers',
        share: {P: 0.06, D: 0.16, C: 0.3, A: 0.48},
        focus: {P: 0.6, D: 0.4, C: 0.5, A: 0.5},
        prefer: (p) => (p.role === 'P' ? 0 : (p.penaltyTaker ? 10 : 0) + ((p.scores.bonus ?? 50) - 50) / 8),
    },
    {
        key: 'safeStarters',
        share: {P: 0.06, D: 0.17, C: 0.3, A: 0.47},
        focus: {P: 0.4, D: 0.2, C: 0.2, A: 0.25},
        prefer: (p) => starterBonus(p) + ((p.scores.fitness ?? 60) - 60) / 6,
    },
    {
        key: 'youngUpside',
        share: {P: 0.06, D: 0.16, C: 0.3, A: 0.48},
        focus: {P: 0.6, D: 0.35, C: 0.35, A: 0.45},
        prefer: (p) => (p.age !== null && p.age !== undefined ? (p.age <= 22 ? 9 : p.age <= 25 ? 5 : p.age >= 32 ? -8 : 0) : 0) + (p.scores.starter >= 60 ? 2 : 0),
    },
];

export interface StrategyPick {
    id: number;
    name: string;
    team: string;
    role: FantaRole;
    price: number;
    overall: number;
    /** The most the strategy would pay for this slot. */
    maxBid: number;
}

/** What the user has already bought: reduces the role budgets and uses up the biggest slots first. */
export interface OwnPurchase {
    playerId: number;
    role: FantaRole;
    price: number;
}

export interface StrategyPlan {
    key: StrategyKey;
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
    /** The league plays the defence modifier: formations with four or more defenders earn it. */
    defenceModifier?: boolean;
    /** Formations to prefer when the values are within a hair of the best (a strategy's natural shape). */
    prefer?: FormationKey[];
}

/** What a player is expected to bring per match: his fantamedia, discounted when he is not a sure starter. */
/** Chance he is on the pitch on a given matchday, from the starter mark. */
export const playChance = (p: LineupPlayer) => Math.max(0.05, Math.min(1, p.scores.starter / 100));
/** What a player is expected to bring per match when fielded: his fantamedia, weighted by the chance he actually plays. */
export const playerValue = (p: LineupPlayer) => (p.scores.fantaAvg ?? 5.5) * playChance(p);

/**
 * Classic defence modifier, estimated: the average rating of the keeper and
 * the three best defenders fielded gives +1 from 6, +2 from 6.25, +3 from 6.5,
 * +4 from 6.75, +6 from 7. Fantamedie stand in for ratings: a keeper's
 * fantamedia sits about a goal below his rating, a defender's about level.
 */
function defenceModifier(keeper: LineupPlayer | undefined, defenders: LineupPlayer[]): number {
    if (!keeper || defenders.length < 4) return 0;
    const ratings = [(keeper.scores.fantaAvg ?? 5) + 1, ...defenders.slice(0, 3).map((d) => d.scores.fantaAvg ?? 5.8)];
    const avg = ratings.reduce((s, v) => s + v, 0) / ratings.length;
    return avg >= 7 ? 6 : avg >= 6.75 ? 4 : avg >= 6.5 ? 3 : avg >= 6.25 ? 2 : avg >= 6 ? 1 : 0;
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
    const sorted = {} as Record<FantaRole, LineupPlayer[]>;
    for (const role of ROLES) sorted[role] = players.filter((p) => p.role === role).sort((a, b) => playerValue(b) - playerValue(a));
    const formations = FORMATIONS.map((f) => {
        let value = 0;
        for (const role of ROLES) {
            const need = f.need[role];
            const fielded = sorted[role].slice(0, need);
            const bench = sorted[role][need];
            const cover = bench ? playerValue(bench) : 0;
            for (const p of fielded) value += playerValue(p) + (1 - playChance(p)) * cover;
        }
        if (options.defenceModifier && f.need.D >= 4) value += defenceModifier(sorted.P[0], sorted.D.slice(0, f.need.D));
        return {key: f.key, value: Math.round(value * 10) / 10};
    }).sort((a, b) => b.value - a.value || FORMATIONS.findIndex((f) => f.key === a.key) - FORMATIONS.findIndex((f) => f.key === b.key));
    const best = formations[0];
    const preferred = options.prefer?.map((key) => formations.find((f) => f.key === key)).find((f) => f && f.value >= best.value * 0.98);
    const chosen = preferred ?? best;
    return {formation: chosen.key, value: chosen.value, formations: [chosen, ...formations.filter((f) => f !== chosen)]};
}

/** Simulates one strategy on the pool: fills every slot with the best player (by mark plus what the strategy prefers) affordable for that slot's budget. */
export function planStrategy(strategy: Strategy, players: PoolPlayer[], prices: Map<number, number>, config: Pick<AuctionConfig, 'credits' | 'slots'> & Partial<Pick<AuctionConfig, 'modifiers'>>, taken: Set<number> = new Set(), mine: OwnPurchase[] = []): StrategyPlan {
    const budget = {P: 0, D: 0, C: 0, A: 0} as Record<FantaRole, number>;
    const picks = {P: [], D: [], C: [], A: []} as Record<FantaRole, StrategyPick[]>;
    const byId = new Map(players.map((p) => [p.id, p]));
    const chosen: PoolPlayer[] = mine.map((m) => byId.get(m.playerId)).filter((p): p is PoolPlayer => !!p);
    let spent = mine.reduce((s, m) => s + m.price, 0);
    let depth = chosen.reduce((s, p) => s + p.scores.overall, 0);
    for (const role of ROLES) budget[role] = Math.round(config.credits * strategy.share[role]);
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
        room[role] = budget[role] - spentOn[role] - open;
        if (room[role] < 0) net -= room[role];
        else if (open === 0) net -= room[role];
        else flexible.push(role);
    }
    const roomTotal = flexible.reduce((s, role) => s + room[role], 0);
    const baseTotal = flexible.reduce((s, role) => s + budget[role], 0);
    if (net > 0 && roomTotal > 0) {
        const cut = Math.min(net, roomTotal);
        for (const role of flexible) budget[role] -= Math.ceil((cut * room[role]) / roomTotal);
    } else if (net < 0 && baseTotal > 0) {
        for (const role of flexible) budget[role] += Math.floor((-net * budget[role]) / baseTotal);
    }
    for (const role of ROLES) {
        const owned = mine.filter((m) => m.role === role);
        // What I already have in the role fills the plan first, then the biggest slots are gone.
        for (const m of owned) {
            const p = byId.get(m.playerId);
            if (p) picks[role].push({id: p.id, name: p.name, team: p.team.name, role, price: m.price, overall: p.scores.overall, maxBid: m.price});
        }
        const candidates = players.filter((p) => p.role === role && !taken.has(p.id) && !owned.some((m) => m.playerId === p.id));
        const used = new Set<number>();
        let left = budget[role] - owned.reduce((s, m) => s + m.price, 0);
        const custom = strategy.fractions?.[role];
        const all = custom && custom.length === config.slots[role] ? custom : slotFractions(config.slots[role], strategy.focus[role]);
        const fractions = [...all].sort((a, b) => b - a).slice(owned.length);
        fractions.forEach((fraction, index) => {
            const slotsLeft = fractions.length - index;
            // The strategy's preferences shift the order (a penalty taker, a starter, a youngster...).
            const rank = (p: PoolPlayer) => p.scores.overall + (strategy.prefer?.(p, {chosen}) ?? 0);
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
            const pick = pool.find((p) => (prices.get(p.id) ?? 1) <= cap);
            if (!pick) return;
            const price = prices.get(pick.id) ?? 1;
            used.add(pick.id);
            chosen.push(pick);
            left -= price;
            spent += price;
            depth += pick.scores.overall;
            picks[role].push({id: pick.id, name: pick.name, team: pick.team.name, role, price, overall: pick.scores.overall, maxBid: Math.max(price, cap)});
        });
    }
    const lineup = bestLineup(ROLES.flatMap((role) => picks[role].map((p) => byId.get(p.id))).filter((p): p is PoolPlayer => !!p), {defenceModifier: config.modifiers?.defence, prefer: strategy.formations});
    return {key: strategy.key, share: strategy.share, budget, picks, spent, lineupValue: lineup.value, formation: lineup.formation, formations: lineup.formations, depth, available: true};
}

/** Every strategy planned on the pool, best lineup first; strategies that need a modifier the league lacks are marked unavailable. */
export function rankStrategies(players: PoolPlayer[], prices: Map<number, number>, config: Pick<AuctionConfig, 'credits' | 'slots' | 'modifiers'>, taken: Set<number> = new Set(), mine: OwnPurchase[] = []): StrategyPlan[] {
    return STRATEGIES.map((s) => ({...planStrategy(s, players, prices, config, taken, mine), available: !s.needsDefenceModifier || config.modifiers.defence})).sort((a, b) => Number(b.available) - Number(a.available) || b.lineupValue - a.lineupValue || b.depth - a.depth);
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
    for (const role of ROLES) {
        const owned = mine.filter((m) => m.role === role);
        const spent = owned.reduce((s, m) => s + m.price, 0);
        const open = Math.max(0, config.slots[role] - owned.length);
        const left = current.budget[role] - spent;
        if (open > 0 && left < open) {
            reasons.push({kind: 'starved', role, left: Math.max(0, left), open});
            broken = true;
        } else if (spent > current.budget[role] * 1.1 && spent > current.budget[role] + 5) {
            reasons.push({kind: 'overspent', role, spent, budget: current.budget[role]});
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
