import type {FantaRole} from './scores';

/**
 * Bargains: players who cost little at the table and are worth a lot to
 * the site. The table pays around the Fantacalcio.it quotation, so a
 * player is compared by rank: the site's list price ranks him inside his
 * role, and the quotation of the player the list puts at the same rank
 * is what he "should" cost. A star is never a bargain: paying a top a
 * top's price is his job, not a deal. Pure.
 */

/** His site rank's quotation must be at least this many times his own... */
export const BARGAIN_INDEX = 1.5;
/** ...and at least this much above it: a 1 that "should be" 2 is noise. */
export const BARGAIN_GAP = 3;
/** Cheap: quoted at most this share of the role's top quotation. */
export const CHEAP_SHARE = 1 / 3;

export interface BargainInput {
    id: number;
    role: FantaRole;
    listQuote: number | null;
    /** Breaks ties between equal prices (the site's overall mark). */
    value?: number;
}

export interface Bargain {
    /** Where the site puts him in his role (1 = best). */
    rank: number;
    quote: number;
    /** The quotation of the player the list puts at his site rank. */
    equivQuote: number;
    /** equivQuote ÷ quote. */
    index: number;
    bargain: boolean;
}

export function bargains(players: BargainInput[], prices: Map<number, number>): Map<number, Bargain> {
    const out = new Map<number, Bargain>();
    const roles = new Set(players.map((p) => p.role));
    for (const role of roles) {
        const rated = players.filter((p) => p.role === role && (p.listQuote ?? 0) > 0 && (prices.get(p.id) ?? 0) > 0);
        if (rated.length === 0) continue;
        const bySite = [...rated].sort((a, b) => (prices.get(b.id)! - prices.get(a.id)!) || ((b.value ?? 0) - (a.value ?? 0)));
        const quotes = rated.map((p) => p.listQuote!).sort((a, b) => b - a);
        const cheap = quotes[0] * CHEAP_SHARE;
        bySite.forEach((p, i) => {
            const quote = p.listQuote!;
            const equivQuote = quotes[i];
            const index = equivQuote / quote;
            out.set(p.id, {rank: i + 1, quote, equivQuote, index, bargain: quote <= cheap && index >= BARGAIN_INDEX && equivQuote - quote >= BARGAIN_GAP});
        });
    }
    return out;
}
