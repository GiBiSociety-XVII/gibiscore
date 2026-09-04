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
}

const starterBonus = (p: PoolPlayer) => (p.scores.starter >= 75 ? 8 : p.scores.starter >= 60 ? 3 : p.scores.starter < 40 ? -12 : 0);

export const STRATEGIES: Strategy[] = [
    {key: 'balanced', share: {P: 0.07, D: 0.17, C: 0.28, A: 0.48}, focus: {P: 0.6, D: 0.4, C: 0.45, A: 0.45}},
    {key: 'topPerRole', share: {P: 0.08, D: 0.18, C: 0.28, A: 0.46}, focus: {P: 0.8, D: 0.7, C: 0.7, A: 0.75}},
    {
        key: 'threeStars',
        share: {P: 0.04, D: 0.09, C: 0.27, A: 0.6},
        focus: {P: 0.6, D: 0.3, C: 0.75, A: 0.6},
        // Two attackers of the same weight, one star midfielder, fillers everywhere else.
        fractions: {A: [0.46, 0.4, 0.05, 0.04, 0.03, 0.02], C: [0.72, 0.08, 0.05, 0.04, 0.03, 0.03, 0.03, 0.02]},
    },
    {key: 'strongMidfield', share: {P: 0.06, D: 0.12, C: 0.42, A: 0.4}, focus: {P: 0.6, D: 0.3, C: 0.4, A: 0.5}},
    {key: 'topAttack', share: {P: 0.05, D: 0.1, C: 0.2, A: 0.65}, focus: {P: 0.6, D: 0.3, C: 0.35, A: 0.75}},
    {
        key: 'defenceBlock',
        share: {P: 0.12, D: 0.28, C: 0.22, A: 0.38},
        focus: {P: 0.8, D: 0.35, C: 0.4, A: 0.5},
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
}

export interface StrategyPlan {
    key: StrategyKey;
    share: Record<FantaRole, number>;
    /** Credits per role. */
    budget: Record<FantaRole, number>;
    /** Suggested roster, by role, best first. */
    picks: Record<FantaRole, StrategyPick[]>;
    spent: number;
    /** Expected fantasy points of the best eleven, per match. */
    lineupValue: number;
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

/** Best eleven of a roster in a 3-4-3, valued by fantamedia and starter chances, plus a little for bench depth. */
function lineupValue(picks: Record<FantaRole, StrategyPick[]>, byId: Map<number, PoolPlayer>): number {
    const need: Record<FantaRole, number> = {P: 1, D: 3, C: 4, A: 3};
    let value = 0;
    for (const role of ROLES) {
        const values = picks[role]
            .map((p) => byId.get(p.id))
            .filter((p): p is PoolPlayer => !!p)
            .map((p) => (p.scores.fantaAvg ?? 5.5) * (0.4 + (0.6 * p.scores.starter) / 100))
            .sort((a, b) => b - a);
        value += values.slice(0, need[role]).reduce((s, v) => s + v, 0);
        // Bench: the next two of each role count a tenth (injuries, rotations).
        value += values.slice(need[role], need[role] + 2).reduce((s, v) => s + v * 0.1, 0);
    }
    return Math.round(value * 10) / 10;
}

/** Simulates one strategy on the pool: fills every slot with the best player (by mark plus what the strategy prefers) affordable for that slot's budget. */
export function planStrategy(strategy: Strategy, players: PoolPlayer[], prices: Map<number, number>, config: Pick<AuctionConfig, 'credits' | 'slots'>, taken: Set<number> = new Set()): StrategyPlan {
    const budget = {P: 0, D: 0, C: 0, A: 0} as Record<FantaRole, number>;
    const picks = {P: [], D: [], C: [], A: []} as Record<FantaRole, StrategyPick[]>;
    const byId = new Map(players.map((p) => [p.id, p]));
    const chosen: PoolPlayer[] = [];
    let spent = 0;
    let depth = 0;
    for (const role of ROLES) {
        budget[role] = Math.round(config.credits * strategy.share[role]);
        const candidates = players.filter((p) => p.role === role && !taken.has(p.id));
        const used = new Set<number>();
        let left = budget[role];
        const custom = strategy.fractions?.[role];
        const fractions = custom && custom.length === config.slots[role] ? custom : slotFractions(config.slots[role], strategy.focus[role]);
        fractions.forEach((fraction, index) => {
            const slotsLeft = fractions.length - index;
            // The strategy's preferences shift the order (a penalty taker, a starter, a youngster...).
            const rank = (p: PoolPlayer) => p.scores.overall + (strategy.prefer?.(p, {chosen}) ?? 0);
            const pool = candidates.filter((p) => !used.has(p.id)).sort((a, b) => rank(b) - rank(a) || (b.scores.fantaAvg ?? 0) - (a.scores.fantaAvg ?? 0));
            // What this slot may cost: its share of the role budget, never more than what leaves 1 credit per remaining slot.
            const room = left - (slotsLeft - 1);
            let cap = Math.max(1, Math.min(Math.round(budget[role] * fraction * 1.15), room));
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
            picks[role].push({id: pick.id, name: pick.name, team: pick.team.name, role, price, overall: pick.scores.overall});
        });
    }
    return {key: strategy.key, share: strategy.share, budget, picks, spent, lineupValue: lineupValue(picks, byId), depth, available: true};
}

/** Every strategy planned on the pool, best lineup first; strategies that need a modifier the league lacks are marked unavailable. */
export function rankStrategies(players: PoolPlayer[], prices: Map<number, number>, config: Pick<AuctionConfig, 'credits' | 'slots' | 'modifiers'>, taken: Set<number> = new Set()): StrategyPlan[] {
    return STRATEGIES.map((s) => ({...planStrategy(s, players, prices, config, taken), available: !s.needsDefenceModifier || config.modifiers.defence})).sort((a, b) => Number(b.available) - Number(a.available) || b.lineupValue - a.lineupValue || b.depth - a.depth);
}
