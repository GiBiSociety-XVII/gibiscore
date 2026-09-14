import type {FantaRole} from './scores';

/**
 * Bargains: players the site values well above their Fantacalcio.it
 * quotation. Both scales are compared as shares of the role, so the
 * credits of the league and the size of the price list do not matter:
 * a player worth 4% of the site's defenders against 2% of the list's
 * has an index of 2. Pure.
 */

export const BARGAIN_INDEX = 1.4;
/** A tiny quotation doubling (1 → 2) is noise, not a bargain. */
export const BARGAIN_GAP = 3;

export interface BargainInput {
    id: number;
    role: FantaRole;
    listQuote: number | null;
}

export interface Bargain {
    /** Site value ÷ list value, both as a share of the role. */
    index: number;
    /** What the site's price would be on the list's scale. */
    equivQuote: number;
    quote: number;
    bargain: boolean;
}

export function bargains(players: BargainInput[], prices: Map<number, number>): Map<number, Bargain> {
    const priceSum = new Map<FantaRole, number>();
    const quoteSum = new Map<FantaRole, number>();
    const rated = players.filter((p) => (p.listQuote ?? 0) > 0 && (prices.get(p.id) ?? 0) > 0);
    for (const p of rated) {
        priceSum.set(p.role, (priceSum.get(p.role) ?? 0) + prices.get(p.id)!);
        quoteSum.set(p.role, (quoteSum.get(p.role) ?? 0) + p.listQuote!);
    }
    const out = new Map<number, Bargain>();
    for (const p of rated) {
        const quotes = quoteSum.get(p.role)!;
        const ourShare = prices.get(p.id)! / priceSum.get(p.role)!;
        const listShare = p.listQuote! / quotes;
        const index = ourShare / listShare;
        const equivQuote = Math.round(ourShare * quotes);
        out.set(p.id, {index, equivQuote, quote: p.listQuote!, bargain: index >= BARGAIN_INDEX && equivQuote - p.listQuote! >= BARGAIN_GAP});
    }
    return out;
}
