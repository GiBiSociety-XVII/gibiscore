import type {FantaRole, FantaScores} from './scores';

/**
 * Tiers ("fasce") inside each role. Seven tiers by ranking on the overall
 * mark, sized on how many players of the role the league will buy
 * (participants x slots): top and semi-top are the handful everybody
 * wants, the fifth tier the last players a league actually buys. Whoever
 * ranks below is sorted by profile: a "jolly" is a bet with upside (young,
 * hot start, thin evidence but good marks), "avoid" is a player the
 * numbers say not to buy (long-term injury, never plays), the rest are
 * fillers.
 */

export type Tier = 'top' | 'semiTop' | 'first' | 'second' | 'third' | 'fourth' | 'fifth' | 'jolly' | 'filler' | 'avoid';

export const TIERS: Tier[] = ['top', 'semiTop', 'first', 'second', 'third', 'fourth', 'fifth', 'jolly', 'filler', 'avoid'];

/** Share of the bought players of a role in each ranked tier (together: everyone the league buys). */
const TIER_SHARE: Array<[Tier, number]> = [
    ['top', 0.08],
    ['semiTop', 0.12],
    ['first', 0.16],
    ['second', 0.18],
    ['third', 0.18],
    ['fourth', 0.15],
    ['fifth', 0.13],
];

const NEXT: Record<Tier, Tier> = {top: 'semiTop', semiTop: 'first', first: 'second', second: 'third', third: 'fourth', fourth: 'fifth', fifth: 'jolly', jolly: 'jolly', filler: 'filler', avoid: 'avoid'};

export interface TierPlayer {
    id: number;
    role: FantaRole;
    age?: number | null;
    injury?: {longTerm: boolean} | null;
    scores: Pick<FantaScores, 'overall'> & Partial<Pick<FantaScores, 'confidence' | 'starter' | 'fitness' | 'bonus' | 'form'>>;
}

/** The numbers say not to buy him: out for a long time, or never on the pitch with enough evidence to trust it. */
export function isAvoid(p: TierPlayer): boolean {
    if (p.injury?.longTerm) return true;
    if ((p.scores.fitness ?? 60) <= 30) return true;
    return (p.scores.starter ?? 50) <= 20 && p.scores.confidence !== 'low';
}

/** A bet with upside: young with bonus in him, a hot start, or good marks on thin evidence. */
export function isJolly(p: TierPlayer, floor: number): boolean {
    const overall = p.scores.overall;
    // Whatever the profile, too far below the last player a league buys is not a bet, it is a filler.
    if (overall < floor - 15) return false;
    const young = p.age !== null && p.age !== undefined && p.age <= 23;
    if (young && ((p.scores.bonus ?? 0) >= 50 || overall >= floor - 10)) return true;
    if (p.scores.confidence === 'low' && overall >= floor - 5) return true;
    return (p.scores.form ?? 50) >= 65 && (p.scores.starter ?? 0) >= 45;
}

/**
 * Tiers by ranking on the overall mark inside the role. A player whose
 * marks rest on thin evidence (few matches) cannot sit in the top two
 * tiers: he drops one tier and the next player moves up, so the tops
 * are names the numbers back. A long-term injury below the first tier
 * is "avoid" whatever the ranking says.
 */
export function assignTiers<T extends TierPlayer>(players: T[], config: {participants: number; slots: Record<FantaRole, number>}): Map<number, Tier> {
    const tiers = new Map<number, Tier>();
    for (const role of ['P', 'D', 'C', 'A'] as const) {
        const pool = players.filter((p) => p.role === role).sort((a, b) => b.scores.overall - a.scores.overall);
        const bought = Math.max(1, config.participants * config.slots[role]);
        // Thin evidence is not enough for top or semi-top: those players are ranked after the first tier's worth of solid ones.
        const solid = pool.filter((p) => p.scores.confidence !== 'low');
        const thin = pool.filter((p) => p.scores.confidence === 'low');
        const firstTwo = Math.max(1, Math.round(bought * TIER_SHARE[0][1])) + Math.max(1, Math.round(bought * TIER_SHARE[1][1]));
        const ordered = [...solid.slice(0, firstTwo), ...[...solid.slice(firstTwo), ...thin].sort((a, b) => b.scores.overall - a.scores.overall)];
        let index = 0;
        for (const [tier, share] of TIER_SHARE) {
            const size = Math.max(1, Math.round(bought * share));
            for (const p of ordered.slice(index, index + size)) {
                if (p.injury?.longTerm && tier !== 'top' && tier !== 'semiTop') tiers.set(p.id, 'avoid');
                else tiers.set(p.id, p.scores.confidence === 'low' && (tier === 'top' || tier === 'semiTop') ? NEXT[tier] : tier);
            }
            index += size;
        }
        // Below the bought: the mark of the last player a league buys is the bar for a bet.
        const floor = ordered[Math.min(index, ordered.length) - 1]?.scores.overall ?? 0;
        for (const p of ordered.slice(index)) tiers.set(p.id, isAvoid(p) ? 'avoid' : isJolly(p, floor) ? 'jolly' : 'filler');
    }
    return tiers;
}

/** Roster grouped by role and tier, best first inside each group. */
export function groupByTier<T extends {id: number; role: FantaRole; scores: Pick<FantaScores, 'overall'>}>(players: T[], tiers: Map<number, Tier>): Record<FantaRole, Record<Tier, T[]>> {
    const empty = (): Record<Tier, T[]> => ({top: [], semiTop: [], first: [], second: [], third: [], fourth: [], fifth: [], jolly: [], filler: [], avoid: []});
    const out: Record<FantaRole, Record<Tier, T[]>> = {P: empty(), D: empty(), C: empty(), A: empty()};
    for (const p of [...players].sort((a, b) => b.scores.overall - a.scores.overall)) out[p.role][tiers.get(p.id) ?? 'filler'].push(p);
    return out;
}
