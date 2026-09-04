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

const NEXT: Record<Tier, Tier> = {top: 'semiTop', semiTop: 'first', first: 'second', second: 'third', third: 'filler', filler: 'filler'};

/**
 * Tiers by ranking on the overall mark inside the role. A player whose
 * marks rest on thin evidence (few matches) cannot sit in the top two
 * tiers: he drops one tier and the next player moves up, so the tops
 * are names the numbers back.
 */
export function assignTiers<T extends {id: number; role: FantaRole; scores: Pick<FantaScores, 'overall'> & Partial<Pick<FantaScores, 'confidence'>>}>(players: T[], config: {participants: number; slots: Record<FantaRole, number>}): Map<number, Tier> {
    const tiers = new Map<number, Tier>();
    for (const role of ['P', 'D', 'C', 'A'] as const) {
        const pool = players.filter((p) => p.role === role).sort((a, b) => b.scores.overall - a.scores.overall);
        const bought = Math.max(1, config.participants * config.slots[role]);
        // Thin evidence is not enough for top or semi-top: those players are ranked after the first tier's worth of solid ones.
        const solid = pool.filter((p) => p.scores.confidence !== 'low');
        const thin = pool.filter((p) => p.scores.confidence === 'low');
        const firstTwo = Math.max(1, Math.round(bought * 0.08)) + Math.max(1, Math.round(bought * 0.12));
        const ordered = [...solid.slice(0, firstTwo), ...[...solid.slice(firstTwo), ...thin].sort((a, b) => b.scores.overall - a.scores.overall)];
        let index = 0;
        for (const [tier, share] of TIER_SHARE) {
            const size = Math.max(1, Math.round(bought * share));
            for (const p of ordered.slice(index, index + size)) tiers.set(p.id, p.scores.confidence === 'low' && (tier === 'top' || tier === 'semiTop') ? NEXT[tier] : tier);
            index += size;
        }
        for (const p of ordered.slice(index)) tiers.set(p.id, 'filler');
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
