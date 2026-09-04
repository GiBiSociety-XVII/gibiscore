import type {FantaRole, FantaScores} from './scores';

/**
 * Tiers ("fasce") inside each role, by ranking on the overall mark. The
 * sizes follow how many players of the role the league will buy
 * (participants x slots): the top tier is the handful everybody wants,
 * the third tier the last starters, the rest are fillers and bets.
 */

export type Tier = 'top' | 'semiTop' | 'first' | 'second' | 'third' | 'filler';

export const TIERS: Tier[] = ['top', 'semiTop', 'first', 'second', 'third', 'filler'];

/** Share of the bought players of a role in each tier (the rest is filler). */
const TIER_SHARE: Array<[Tier, number]> = [
    ['top', 0.08],
    ['semiTop', 0.12],
    ['first', 0.2],
    ['second', 0.25],
    ['third', 0.35],
];

export function assignTiers<T extends {id: number; role: FantaRole; scores: Pick<FantaScores, 'overall'>}>(players: T[], config: {participants: number; slots: Record<FantaRole, number>}): Map<number, Tier> {
    const tiers = new Map<number, Tier>();
    for (const role of ['P', 'D', 'C', 'A'] as const) {
        const pool = players.filter((p) => p.role === role).sort((a, b) => b.scores.overall - a.scores.overall);
        const bought = Math.max(1, config.participants * config.slots[role]);
        let index = 0;
        for (const [tier, share] of TIER_SHARE) {
            const size = Math.max(1, Math.round(bought * share));
            for (const p of pool.slice(index, index + size)) tiers.set(p.id, tier);
            index += size;
        }
        for (const p of pool.slice(index)) tiers.set(p.id, 'filler');
    }
    return tiers;
}

/** Roster grouped by role and tier, best first inside each group. */
export function groupByTier<T extends {id: number; role: FantaRole; scores: Pick<FantaScores, 'overall'>}>(players: T[], tiers: Map<number, Tier>): Record<FantaRole, Record<Tier, T[]>> {
    const empty = (): Record<Tier, T[]> => ({top: [], semiTop: [], first: [], second: [], third: [], filler: []});
    const out: Record<FantaRole, Record<Tier, T[]>> = {P: empty(), D: empty(), C: empty(), A: empty()};
    for (const p of [...players].sort((a, b) => b.scores.overall - a.scores.overall)) out[p.role][tiers.get(p.id) ?? 'filler'].push(p);
    return out;
}
