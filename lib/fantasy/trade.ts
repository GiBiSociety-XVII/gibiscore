import {creditsLeft, totalSlots, type AuctionConfig, type LedgerEntry, type Purchase} from './config';
import type {FantaRole} from './scores';

/**
 * The market after the auction: trades between two managers (players
 * for players, with a balance in credits) and releases with a refund
 * that need not be the price paid. Rosters are the purchases; credits
 * that move outside them go to the config's ledger. Pure.
 */

export interface TradeSide {
    manager: number;
    /** Ids of the players he gives away. */
    players: number[];
}

export interface Trade {
    a: TradeSide;
    b: TradeSide;
    /** Credits a pays b on top (negative: b pays a). */
    credits: number;
}

export type TradeIssue =
    | {kind: 'empty'}
    | {kind: 'same'}
    | {kind: 'notOwned'; manager: number; playerId: number}
    | {kind: 'roleFull'; manager: number; role: FantaRole; count: number; max: number}
    | {kind: 'credits'; manager: number; left: number};

export interface RosterPlayer {
    id: number;
    role: FantaRole;
}

/** What stops the trade, in order of importance; empty when it can go through. */
export function tradeIssues(config: Pick<AuctionConfig, 'credits' | 'slots' | 'ledger'>, purchases: Purchase[], players: Map<number, RosterPlayer>, trade: Trade): TradeIssue[] {
    const issues: TradeIssue[] = [];
    if (trade.a.manager === trade.b.manager) return [{kind: 'same'}];
    if (trade.a.players.length === 0 && trade.b.players.length === 0) return [{kind: 'empty'}];
    for (const side of [trade.a, trade.b]) {
        for (const id of side.players) {
            if (!purchases.some((p) => p.playerId === id && p.manager === side.manager)) issues.push({kind: 'notOwned', manager: side.manager, playerId: id});
        }
    }
    if (issues.length > 0) return issues;
    const after = applyTrade(config, purchases, trade);
    for (const side of [trade.a, trade.b]) {
        const roster = after.purchases.filter((p) => p.manager === side.manager);
        for (const role of ['P', 'D', 'C', 'A'] as FantaRole[]) {
            const count = roster.filter((p) => players.get(p.playerId)?.role === role).length;
            if (count > config.slots[role]) issues.push({kind: 'roleFull', manager: side.manager, role, count, max: config.slots[role]});
        }
        // Every open slot still needs a credit.
        const left = creditsLeft({credits: config.credits, ledger: after.ledger}, after.purchases, side.manager);
        const open = Math.max(0, totalSlots(config.slots) - roster.length);
        if (left < open) issues.push({kind: 'credits', manager: side.manager, left});
    }
    return issues;
}

/** The purchases and ledger once the trade is done: players change hands at their price, the balance goes to the ledger. */
export function applyTrade(config: Pick<AuctionConfig, 'ledger'>, purchases: Purchase[], trade: Trade, note = '', at = new Date().toISOString()): {purchases: Purchase[]; ledger: LedgerEntry[]} {
    const toB = new Set(trade.a.players);
    const toA = new Set(trade.b.players);
    const next = purchases.map((p) => (toB.has(p.playerId) && p.manager === trade.a.manager ? {...p, manager: trade.b.manager} : toA.has(p.playerId) && p.manager === trade.b.manager ? {...p, manager: trade.a.manager} : p));
    const credits = Math.round(trade.credits);
    const ledger = credits !== 0 ? [...config.ledger, {manager: trade.a.manager, credits: -credits, kind: 'trade' as const, note, at}, {manager: trade.b.manager, credits, kind: 'trade' as const, note, at}] : config.ledger;
    return {purchases: next, ledger};
}

/** A release with a refund: the player leaves the roster, the price not refunded stays spent (or the extra refund is credited). */
export function releasePlayer(config: Pick<AuctionConfig, 'ledger'>, purchases: Purchase[], playerIds: number[], refund: number, note = '', at = new Date().toISOString()): {purchases: Purchase[]; ledger: LedgerEntry[]} {
    const ids = new Set(playerIds);
    const gone = purchases.filter((p) => ids.has(p.playerId));
    if (gone.length === 0) return {purchases, ledger: config.ledger};
    const manager = gone[0].manager;
    const paid = gone.reduce((s, p) => s + p.price, 0);
    const diff = Math.round(refund) - paid;
    const ledger = diff !== 0 ? [...config.ledger, {manager, credits: diff, kind: 'release' as const, note, at}] : config.ledger;
    return {purchases: purchases.filter((p) => !ids.has(p.playerId)), ledger};
}
