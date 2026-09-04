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
    injury?: {longTerm: boolean; daysOut?: number} | null;
    scores: Pick<FantaScores, 'overall'> & Partial<Pick<FantaScores, 'confidence' | 'starter' | 'fitness' | 'bonus' | 'form' | 'sample'>>;
}

/** Why a player sits in his tier, as facts the interface puts into words. */
export type TierWhy =
    /** Ranked inside the players the league buys: positions from..to of the role belong to this tier. */
    | {kind: 'ranked'; tier: Tier; from: number; to: number}
    /** Ranked beyond the players the league buys. */
    | {kind: 'belowBought'}
    /** Thin evidence: dropped one tier from where the mark would put him. */
    | {kind: 'thinDropped'; from: Tier; sample: number}
    | {kind: 'longInjury'; daysOut: number | null}
    | {kind: 'neverPlays'; starter: number}
    | {kind: 'lowFitness'; fitness: number}
    | {kind: 'young'; age: number; bonus: number}
    | {kind: 'hotStart'; form: number}
    | {kind: 'thinPromising'; sample: number}
    | {kind: 'filler'};

export interface TierInfo {
    tier: Tier;
    /** Position in the role by overall mark (1 = best), after the thin-evidence reordering. */
    rank: number;
    /** Players of the role on the list. */
    ofRole: number;
    /** Players of the role the league buys. */
    bought: number;
    why: TierWhy[];
}

/** The numbers say not to buy him: out for a long time, or never on the pitch with enough evidence to trust it. */
export function avoidReason(p: TierPlayer): TierWhy | null {
    if (p.injury?.longTerm) return {kind: 'longInjury', daysOut: p.injury.daysOut ?? null};
    if ((p.scores.fitness ?? 60) <= 30) return {kind: 'lowFitness', fitness: p.scores.fitness ?? 0};
    if ((p.scores.starter ?? 50) <= 20 && p.scores.confidence !== 'low') return {kind: 'neverPlays', starter: p.scores.starter ?? 0};
    return null;
}

/** A bet with upside: young with bonus in him, a hot start, or good marks on thin evidence. */
export function jollyReason(p: TierPlayer, floor: number): TierWhy | null {
    const overall = p.scores.overall;
    // Whatever the profile, too far below the last player a league buys is not a bet, it is a filler.
    if (overall < floor - 15) return null;
    const young = p.age !== null && p.age !== undefined && p.age <= 23;
    if (young && ((p.scores.bonus ?? 0) >= 50 || overall >= floor - 10)) return {kind: 'young', age: p.age!, bonus: p.scores.bonus ?? 0};
    if (p.scores.confidence === 'low' && overall >= floor - 5) return {kind: 'thinPromising', sample: p.scores.sample ?? 0};
    if ((p.scores.form ?? 50) >= 65 && (p.scores.starter ?? 0) >= 45) return {kind: 'hotStart', form: p.scores.form ?? 50};
    return null;
}

export const isAvoid = (p: TierPlayer) => avoidReason(p) !== null;
export const isJolly = (p: TierPlayer, floor: number) => jollyReason(p, floor) !== null;

/**
 * Tiers by ranking on the overall mark inside the role, with the reasons.
 * A player whose marks rest on thin evidence (few matches) cannot sit in
 * the top two tiers: he drops one tier and the next player moves up, so
 * the tops are names the numbers back. A long-term injury below the
 * first tier is "avoid" whatever the ranking says.
 */
export function explainTiers<T extends TierPlayer>(players: T[], config: {participants: number; slots: Record<FantaRole, number>}): Map<number, TierInfo> {
    const out = new Map<number, TierInfo>();
    for (const role of ['P', 'D', 'C', 'A'] as const) {
        const pool = players.filter((p) => p.role === role).sort((a, b) => b.scores.overall - a.scores.overall);
        const bought = Math.max(1, config.participants * config.slots[role]);
        // Thin evidence is not enough for top or semi-top: those players are ranked after the first tier's worth of solid ones.
        const solid = pool.filter((p) => p.scores.confidence !== 'low');
        const thin = pool.filter((p) => p.scores.confidence === 'low');
        const firstTwo = Math.max(1, Math.round(bought * TIER_SHARE[0][1])) + Math.max(1, Math.round(bought * TIER_SHARE[1][1]));
        const ordered = [...solid.slice(0, firstTwo), ...[...solid.slice(firstTwo), ...thin].sort((a, b) => b.scores.overall - a.scores.overall)];
        const info = (p: T, index: number, tier: Tier, why: TierWhy[]) => out.set(p.id, {tier, rank: index + 1, ofRole: pool.length, bought, why});
        // The tier a position would get by mark alone: where a thin-evidence player would have been.
        const tierAt = (position: number): Tier | null => {
            let from = 0;
            for (const [tier, share] of TIER_SHARE) {
                const size = Math.max(1, Math.round(bought * share));
                if (position < from + size) return tier;
                from += size;
            }
            return null;
        };
        let index = 0;
        for (const [tier, share] of TIER_SHARE) {
            const size = Math.max(1, Math.round(bought * share));
            ordered.slice(index, index + size).forEach((p, i) => {
                const ranked: TierWhy = {kind: 'ranked', tier, from: index + 1, to: index + size};
                const byMark = p.scores.confidence === 'low' ? tierAt(pool.indexOf(p)) : null;
                const thin: TierWhy[] = byMark && byMark !== tier ? [{kind: 'thinDropped', from: byMark, sample: p.scores.sample ?? 0}] : [];
                if (p.injury?.longTerm && tier !== 'top' && tier !== 'semiTop') info(p, index + i, 'avoid', [ranked, {kind: 'longInjury', daysOut: p.injury.daysOut ?? null}]);
                else if (p.scores.confidence === 'low' && (tier === 'top' || tier === 'semiTop')) info(p, index + i, NEXT[tier], [ranked, {kind: 'thinDropped', from: tier, sample: p.scores.sample ?? 0}]);
                else info(p, index + i, tier, [ranked, ...thin]);
            });
            index += size;
        }
        // Below the bought: the mark of the last player a league buys is the bar for a bet.
        const floor = ordered[Math.min(index, ordered.length) - 1]?.scores.overall ?? 0;
        ordered.slice(index).forEach((p, i) => {
            const avoid = avoidReason(p);
            const jolly = avoid ? null : jollyReason(p, floor);
            info(p, index + i, avoid ? 'avoid' : jolly ? 'jolly' : 'filler', [{kind: 'belowBought'}, avoid ?? jolly ?? {kind: 'filler'}]);
        });
    }
    return out;
}

/** Tier of every player (see explainTiers). */
export function assignTiers<T extends TierPlayer>(players: T[], config: {participants: number; slots: Record<FantaRole, number>}): Map<number, Tier> {
    return new Map([...explainTiers(players, config)].map(([id, info]) => [id, info.tier]));
}

/** Roster grouped by role and tier, best first inside each group. */
export function groupByTier<T extends {id: number; role: FantaRole; scores: Pick<FantaScores, 'overall'>}>(players: T[], tiers: Map<number, Tier>): Record<FantaRole, Record<Tier, T[]>> {
    const empty = (): Record<Tier, T[]> => ({top: [], semiTop: [], first: [], second: [], third: [], fourth: [], fifth: [], jolly: [], filler: [], avoid: []});
    const out: Record<FantaRole, Record<Tier, T[]>> = {P: empty(), D: empty(), C: empty(), A: empty()};
    for (const p of [...players].sort((a, b) => b.scores.overall - a.scores.overall)) out[p.role][tiers.get(p.id) ?? 'filler'].push(p);
    return out;
}
