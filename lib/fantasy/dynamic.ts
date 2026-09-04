import {ROLE_SHARE, type AuctionConfig, type Purchase} from './config';
import type {FantaRole, FantaScores} from './scores';

/**
 * Live prices during the auction. The list prices assume a full market;
 * once players leave the table the money still on it and the players
 * still available decide what the rest is worth: fewer top players left
 * with plenty of credits around makes the remaining tops dearer, a
 * crowded top with little money left makes them cheaper. What the table
 * has actually paid against the list also shifts the level (a table
 * that overpays keeps overpaying). Pure and testable.
 */

export interface PricedPlayer {
    id: number;
    role: FantaRole;
    scores: Pick<FantaScores, 'overall'>;
}

export interface RoleMarket {
    /** Players of the role the league still has to buy. */
    slotsLeft: number;
    bought: number;
    /** Credits the table is expected to spend on the role from here. */
    money: number;
    /** Paid over list for the role's purchases (1 = as listed), when there are enough of them. */
    inflation: number;
    /** Best players of the role still available, by rank in the original list. */
    topLeft: number;
    topTotal: number;
    /** Managers still without one of the role's top players. */
    hungry: number;
    /** Demand for the remaining tops against the start of the auction: 1 = unchanged, 2 = twice as contested. */
    scarcity: number;
}

export interface Market {
    credits: number;
    /** Credits still on the table, all managers together. */
    remaining: number;
    spent: number;
    /** Purchases recorded. */
    purchases: number;
    inflation: number;
    byRole: Record<FantaRole, RoleMarket>;
}

const ROLES: FantaRole[] = ['P', 'D', 'C', 'A'];
const RANK_HALF: Record<FantaRole, number> = {P: 3.5, D: 9, C: 8, A: 8};

const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));

/** Where the auction stands: money left, slots left, how the table pays. */
export function marketState(players: PricedPlayer[], listPrices: Map<number, number>, config: Pick<AuctionConfig, 'credits' | 'participants' | 'slots'>, purchases: Purchase[]): Market {
    const byId = new Map(players.map((p) => [p.id, p]));
    const market = config.credits * config.participants;
    const spent = purchases.reduce((s, p) => s + p.price, 0);
    const remaining = Math.max(0, market - spent);
    const paid = purchases.reduce((s, p) => s + p.price, 0);
    const listed = purchases.reduce((s, p) => s + (listPrices.get(p.playerId) ?? 1), 0);
    const inflation = purchases.length >= 5 && listed > 0 ? clamp(paid / listed, 0.6, 1.8) : 1;

    // The money left goes to the roles two ways, averaged: what each role should still receive
    // (its usual share of the market minus what has already been spent on it) and the slots still
    // open weighted by what a slot of the role usually costs. Overspending on a role starves it.
    const slotsLeft = {} as Record<FantaRole, number>;
    const boughtBy = {} as Record<FantaRole, number>;
    const owed = {} as Record<FantaRole, number>;
    let demand = 0;
    let owedTotal = 0;
    for (const role of ROLES) {
        const rolePurchases = purchases.filter((p) => byId.get(p.playerId)?.role === role);
        boughtBy[role] = rolePurchases.length;
        slotsLeft[role] = Math.max(0, config.participants * config.slots[role] - boughtBy[role]);
        demand += (slotsLeft[role] * ROLE_SHARE[role]) / Math.max(1, config.slots[role]);
        const spentOn = rolePurchases.reduce((s, p) => s + p.price, 0);
        owed[role] = slotsLeft[role] > 0 ? Math.max(slotsLeft[role], market * ROLE_SHARE[role] - spentOn) : 0;
        owedTotal += owed[role];
    }
    const byRole = {} as Record<FantaRole, RoleMarket>;
    for (const role of ROLES) {
        const bySlots = demand > 0 ? (slotsLeft[role] * ROLE_SHARE[role]) / Math.max(1, config.slots[role]) / demand : 0;
        const byOwed = owedTotal > 0 ? owed[role] / owedTotal : 0;
        const share = (bySlots + byOwed) / 2;
        const rolePurchases = purchases.filter((p) => byId.get(p.playerId)?.role === role);
        const rolePaid = rolePurchases.reduce((s, p) => s + p.price, 0);
        const roleListed = rolePurchases.reduce((s, p) => s + (listPrices.get(p.playerId) ?? 1), 0);
        const ranked = players.filter((p) => p.role === role).sort((a, b) => b.scores.overall - a.scores.overall);
        const topTotal = Math.max(1, Math.round(config.participants * config.slots[role] * 0.08));
        const bought = new Set(purchases.map((p) => p.playerId));
        const tops = ranked.slice(0, topTotal);
        const topLeft = tops.filter((p) => !bought.has(p.id)).length;
        const holders = new Set(purchases.filter((p) => tops.some((t) => t.id === p.playerId)).map((p) => p.manager));
        // Managers still without a top of the role who can still pay for one (unnamed managers are assumed untouched).
        const cheapestTop = Math.min(...tops.filter((p) => !bought.has(p.id)).map((p) => listPrices.get(p.id) ?? 1), Infinity);
        let hungry = 0;
        for (let m = 0; m < config.participants; m += 1) {
            if (holders.has(m)) continue;
            const left = config.credits - purchases.filter((p) => p.manager === m).reduce((s, p) => s + p.price, 0);
            if (!Number.isFinite(cheapestTop) || left >= cheapestTop * 0.8) hungry += 1;
        }
        byRole[role] = {
            slotsLeft: slotsLeft[role],
            bought: boughtBy[role],
            money: remaining * share,
            inflation: rolePurchases.length >= 3 && roleListed > 0 ? clamp(rolePaid / roleListed, 0.6, 1.8) : inflation,
            topLeft,
            topTotal,
            hungry,
            // Against the starting point (every manager hungry, every top available): 1 = as at the start.
            scarcity: topLeft > 0 ? hungry / config.participants / (topLeft / topTotal) : 0,
        };
    }
    return {credits: config.credits, remaining, spent, purchases: purchases.length, inflation, byRole};
}

/**
 * Prices of the players still available, from the money still on the
 * table for each role split down the ranking of what is left (same
 * curve as the list), nudged by how the table has been paying. Bought
 * players keep the price they went for. With no purchases this is the
 * list price.
 */
export function dynamicPrices(players: PricedPlayer[], listPrices: Map<number, number>, config: Pick<AuctionConfig, 'credits' | 'participants' | 'slots'>, purchases: Purchase[]): Map<number, number> {
    if (purchases.length === 0) return new Map(listPrices);
    const prices = new Map<number, number>();
    const market = marketState(players, listPrices, config, purchases);
    const paidFor = new Map(purchases.map((p) => [p.playerId, p.price]));
    // No fixed ceiling: the only bound is what the richest manager at the table can still pay
    // while keeping a credit for each of his other open slots (unnamed managers: untouched budget).
    const rosterSlots = config.slots.P + config.slots.D + config.slots.C + config.slots.A;
    let cap = 1;
    for (let m = 0; m < config.participants; m += 1) {
        const mine = purchases.filter((p) => p.manager === m);
        const left = config.credits - mine.reduce((s, p) => s + p.price, 0);
        const open = Math.max(1, rosterSlots - mine.length);
        cap = Math.max(cap, left - (open - 1));
    }
    for (const role of ROLES) {
        const state = market.byRole[role];
        const available = players.filter((p) => p.role === role && !paidFor.has(p.id)).sort((a, b) => b.scores.overall - a.scores.overall);
        const toBuy = available.slice(0, Math.max(1, state.slotsLeft));
        const top = toBuy[0]?.scores.overall ?? 1;
        const weight = (p: PricedPlayer, rank: number) => (1 / (1 + (rank / RANK_HALF[role]) ** 2)) * (0.6 + 0.4 * (p.scores.overall / top) ** 2);
        const total = toBuy.reduce((s, p, i) => s + weight(p, i), 0);
        // A table that pays over list keeps doing it, softly: at most a tenth either way.
        const mood = Math.sqrt(clamp(state.inflation, 0.8, 1.2));
        const rest = Math.max(0, state.money - toBuy.length);
        // Scarcity against the start: tops gone while managers still want one make the tops left
        // dearer (up to +30%); tops still around with few buyers left make them cheaper (down to -20%).
        // Semi-tops feel half of it.
        const scarcity = state.topLeft > 0 ? 1 + 0.3 * clamp(state.scarcity - 1, -0.67, 1) : 1;
        const ranked = players.filter((p) => p.role === role).sort((a, b) => b.scores.overall - a.scores.overall);
        const topIds = new Set(ranked.slice(0, state.topTotal).map((p) => p.id));
        const semiIds = new Set(ranked.slice(state.topTotal, state.topTotal + Math.round(state.topTotal * 1.5)).map((p) => p.id));
        for (const p of available) prices.set(p.id, 1);
        // The market takes over from the list as purchases come in: a third after the first
        // few, most of it once a good part of the role is gone.
        const progress = Math.min(1, state.bought / Math.max(1, config.participants * config.slots[role]));
        const marketWeight = Math.min(0.9, 0.35 + 0.55 * Math.sqrt(progress) + Math.min(0.15, purchases.length / 100));
        toBuy.forEach((p, i) => {
            const raw = total > 0 ? 1 + (rest * weight(p, i)) / total : 1;
            const list = listPrices.get(p.id) ?? 1;
            const premium = topIds.has(p.id) ? scarcity : semiIds.has(p.id) ? Math.sqrt(scarcity) : 1;
            const price = Math.round((raw * mood * marketWeight + list * (1 - marketWeight)) * premium);
            prices.set(p.id, clamp(Math.max(1, price), 1, cap));
        });
    }
    for (const [id, price] of paidFor) prices.set(id, price);
    return prices;
}
