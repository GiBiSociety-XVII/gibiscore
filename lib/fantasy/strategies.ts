import type {AuctionConfig} from './config';
import type {FantaRole, FantaScores} from './scores';

/**
 * Auction strategies: how to split the credits between roles and how
 * concentrated the spending is inside a role (one star and fillers, or
 * many mid-priced players). Each strategy is simulated on the actual
 * pool with the suggested prices, so the advice names real targets and
 * the strategies are ranked by the lineup they would produce.
 */

export type StrategyKey = 'balanced' | 'topPerRole' | 'strongMidfield' | 'topAttack' | 'defenceBlock' | 'valueHunting';

export interface Strategy {
    key: StrategyKey;
    share: Record<FantaRole, number>;
    /** 0 flat spending inside the role .. 1 one star and fillers. */
    focus: Record<FantaRole, number>;
    /** Only worth it with the defence modifier on. */
    needsDefenceModifier?: boolean;
}

export const STRATEGIES: Strategy[] = [
    {key: 'balanced', share: {P: 0.08, D: 0.17, C: 0.27, A: 0.48}, focus: {P: 0.6, D: 0.4, C: 0.45, A: 0.45}},
    {key: 'topPerRole', share: {P: 0.09, D: 0.18, C: 0.27, A: 0.46}, focus: {P: 0.8, D: 0.7, C: 0.7, A: 0.75}},
    {key: 'strongMidfield', share: {P: 0.06, D: 0.12, C: 0.42, A: 0.4}, focus: {P: 0.6, D: 0.3, C: 0.4, A: 0.5}},
    {key: 'topAttack', share: {P: 0.05, D: 0.1, C: 0.2, A: 0.65}, focus: {P: 0.6, D: 0.3, C: 0.35, A: 0.75}},
    {key: 'defenceBlock', share: {P: 0.12, D: 0.28, C: 0.22, A: 0.38}, focus: {P: 0.8, D: 0.35, C: 0.4, A: 0.5}, needsDefenceModifier: true},
    {key: 'valueHunting', share: {P: 0.06, D: 0.16, C: 0.3, A: 0.48}, focus: {P: 0.4, D: 0.2, C: 0.2, A: 0.25}},
];

export interface PoolPlayer {
    id: number;
    name: string;
    role: FantaRole;
    team: {name: string};
    scores: Pick<FantaScores, 'overall' | 'starter' | 'fantaAvg'>;
}

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

/** Best eleven of a roster in a 3-4-3 (or what the roster allows), valued by fantamedia and starter chances. */
function lineupValue(picks: Record<FantaRole, StrategyPick[]>, byId: Map<number, PoolPlayer>): number {
    const need: Record<FantaRole, number> = {P: 1, D: 3, C: 4, A: 3};
    let value = 0;
    for (const role of ROLES) {
        const chosen = picks[role]
            .map((p) => byId.get(p.id))
            .filter((p): p is PoolPlayer => !!p)
            .map((p) => (p.scores.fantaAvg ?? 5.5) * (0.4 + (0.6 * p.scores.starter) / 100))
            .sort((a, b) => b - a)
            .slice(0, need[role]);
        value += chosen.reduce((s, v) => s + v, 0);
    }
    return Math.round(value * 10) / 10;
}

/** Simulates one strategy on the pool: fills every slot with the best player affordable for that slot's budget. */
export function planStrategy(strategy: Strategy, players: PoolPlayer[], prices: Map<number, number>, config: Pick<AuctionConfig, 'credits' | 'slots'>, taken: Set<number> = new Set()): StrategyPlan {
    const budget = {P: 0, D: 0, C: 0, A: 0} as Record<FantaRole, number>;
    const picks = {P: [], D: [], C: [], A: []} as Record<FantaRole, StrategyPick[]>;
    const byId = new Map(players.map((p) => [p.id, p]));
    let spent = 0;
    let depth = 0;
    for (const role of ROLES) {
        budget[role] = Math.round(config.credits * strategy.share[role]);
        const pool = players.filter((p) => p.role === role && !taken.has(p.id)).sort((a, b) => b.scores.overall - a.scores.overall || (b.scores.fantaAvg ?? 0) - (a.scores.fantaAvg ?? 0));
        const used = new Set<number>();
        let left = budget[role];
        const fractions = slotFractions(config.slots[role], strategy.focus[role]);
        fractions.forEach((fraction, index) => {
            const slotsLeft = fractions.length - index;
            // What this slot may cost: its share of the role budget, never more than what leaves 1 credit per remaining slot.
            const room = left - (slotsLeft - 1);
            let cap = Math.max(1, Math.min(Math.round(budget[role] * fraction * 1.15), room));
            // A slot too small for anyone still on the market takes the cheapest player left, when the budget allows it.
            const cheapest = pool.filter((p) => !used.has(p.id)).reduce((m, p) => Math.min(m, prices.get(p.id) ?? 1), Infinity);
            if (cheapest > cap && cheapest <= room) cap = cheapest;
            const pick = pool.find((p) => !used.has(p.id) && (prices.get(p.id) ?? 1) <= cap);
            if (!pick) return;
            const price = prices.get(pick.id) ?? 1;
            used.add(pick.id);
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
