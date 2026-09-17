import type {BetSuggestion} from './markets';

/**
 * A betting slip built from the model's slips of the upcoming matches:
 * the risk picks the tier, the filters the matches, the kind (single,
 * accumulator, system) how they combine. The selections are the most
 * likely of the tier, so the slip is the one the model believes in
 * most for that risk; the chance of the whole slip is the product of
 * the selections' (independent matches), the odds the product too.
 * Pure and testable.
 */

export type SchedinaRisk = 'low' | 'medium' | 'high';
export type SchedinaKind = 'single' | 'multiple' | 'system';

export interface SchedinaCandidate {
    fixtureId: number;
    competitionId: number;
    competition: string;
    home: string;
    away: string;
    /** ISO kick-off. */
    startingAt: string;
    /** Rome day, YYYY-MM-DD. */
    day: string;
    slips: BetSuggestion[];
}

export interface SchedinaOptions {
    risk: SchedinaRisk;
    kind: SchedinaKind;
    /** Selections wanted: 1 for a single, 2..10 for an accumulator or a system. */
    size: number;
    /** A system: columns of this many of the free selections ("k su N", N the selections that are not bankers); 'auto' picks the k with the best expected return at the bookmakers' prices. */
    system?: number | 'auto';
    /** A system: how many selections are bankers (in every column); 'auto' makes bankers of the safest ones (BANKER_MIN_PCT), at most size - 2. */
    bankers?: number | 'auto';
    /** Rome days allowed; empty = any. */
    days: string[];
    /** Competitions allowed; empty = any. */
    competitions: number[];
    /** Matches kicking off before this instant are out (the slip must still be playable). */
    now: string;
}

export interface SchedinaSelection {
    fixtureId: number;
    competition: string;
    home: string;
    away: string;
    startingAt: string;
    tier: BetSuggestion['tier'];
    slip: BetSuggestion;
    /** A system: in every column. */
    banker: boolean;
}

export interface Schedina {
    kind: SchedinaKind;
    risk: SchedinaRisk;
    selections: SchedinaSelection[];
    /** Chance every selection wins, percent. */
    pct: number;
    /** Product of the fair odds. */
    fair: number;
    /** Product of the bookmakers' averages, when every selection has one. */
    book: number | null;
    /** First and last kick-off: when the slip starts and when it is settled (about two hours after the last). */
    firstKickoff: string;
    lastKickoff: string;
    /** A system only: the bankers, the columns (combinations of the free selections, each with every banker) and the chance the slip pays: every banker and at least `of` of the free selections. */
    system?: {of: number; free: number; bankers: number; columns: number; atLeastPct: number};
}

/** A selection at least this likely is a banker when the bankers are chosen automatically. */
export const BANKER_MIN_PCT = 75;

/** The tier a risk asks for, and the ones it falls back to when a match has none. */
const TIERS_BY_RISK: Record<SchedinaRisk, Array<BetSuggestion['tier']>> = {low: ['safe'], medium: ['balanced', 'safe'], high: ['bold', 'balanced']};

const round2 = (v: number) => Math.round(v * 100) / 100;
/** Bookmakers take stakes in steps of five cents: down to the step below. */
export const STAKE_STEP = 0.05;
export const toStakeStep = (v: number) => Math.max(0, Math.floor(Math.round(v * 100) / 5) * 5) / 100;

/** C(n, k). */
export function combinations(n: number, k: number): number {
    if (k < 0 || k > n) return 0;
    let out = 1;
    for (let i = 1; i <= k; i += 1) out = (out * (n - k + i)) / i;
    return Math.round(out);
}

/** The chance that at least k of independent events with these chances (0..1) happen. */
export function atLeast(probabilities: number[], k: number): number {
    // dist[j] = chance exactly j happened so far.
    let dist = [1];
    for (const p of probabilities) {
        const next = new Array(dist.length + 1).fill(0);
        for (let j = 0; j < dist.length; j += 1) {
            next[j] += dist[j] * (1 - p);
            next[j + 1] += dist[j] * p;
        }
        dist = next;
    }
    return dist.slice(k).reduce((s, v) => s + v, 0);
}

/** The slip for the options, or null when the matches left are fewer than the selections wanted. */
export function buildSchedina(candidates: SchedinaCandidate[], options: SchedinaOptions): Schedina | null {
    const size = Math.max(1, Math.min(10, options.kind === 'single' ? 1 : Math.round(options.size)));
    const tiers = TIERS_BY_RISK[options.risk];
    const picks: SchedinaSelection[] = [];
    for (const c of candidates) {
        if (c.startingAt <= options.now) continue;
        if (options.days.length > 0 && !options.days.includes(c.day)) continue;
        if (options.competitions.length > 0 && !options.competitions.includes(c.competitionId)) continue;
        const tier = tiers.find((t) => c.slips.some((s) => s.tier === t));
        const slip = tier ? c.slips.find((s) => s.tier === tier) : undefined;
        if (!tier || !slip) continue;
        picks.push({fixtureId: c.fixtureId, competition: c.competition, home: c.home, away: c.away, startingAt: c.startingAt, tier, slip, banker: false});
    }
    if (picks.length < size) return null;
    // The most likely first; the tier asked for before a fallback; then what pays more.
    const rank = (s: SchedinaSelection) => s.slip.pct + (s.tier === tiers[0] ? 100 : 0);
    const selections = picks
        .sort((a, b) => rank(b) - rank(a) || b.slip.fair - a.slip.fair || a.startingAt.localeCompare(b.startingAt))
        .slice(0, size)
        .sort((a, b) => a.startingAt.localeCompare(b.startingAt));
    const probabilities = selections.map((s) => s.slip.pct / 100);
    const pct = Math.round(probabilities.reduce((p, v) => p * v, 1) * 100);
    const fair = round2(selections.reduce((p, s) => p * s.slip.fair, 1));
    const book = selections.every((s) => s.slip.odds !== null) ? round2(selections.reduce((p, s) => p * (s.slip.odds ?? 1), 1)) : null;
    const out: Schedina = {kind: options.kind, risk: options.risk, selections, pct, fair, book, firstKickoff: selections[0].startingAt, lastKickoff: selections[selections.length - 1].startingAt};
    if (options.kind === 'system' && size >= 2) {
        // Bankers: the safest selections, at most size - 2 so the system keeps two free ones; the free ones combine k at a time.
        const bySafety = [...selections].sort((a, b) => b.slip.pct - a.slip.pct || a.slip.fair - b.slip.fair);
        const maxBankers = Math.max(0, size - 2);
        const wanted = options.bankers === 'auto' || options.bankers === undefined ? bySafety.filter((s) => s.slip.pct >= BANKER_MIN_PCT).length : Math.round(options.bankers);
        const bankers = Math.max(0, Math.min(maxBankers, wanted));
        for (const s of bySafety.slice(0, bankers)) s.banker = true;
        const free = size - bankers;
        const of = options.system === 'auto' || options.system === undefined ? autoSystemOf(selections) : Math.max(1, Math.min(free, Math.round(options.system)));
        const freeProbabilities = selections.filter((s) => !s.banker).map((s) => s.slip.pct / 100);
        const bankersChance = selections.filter((s) => s.banker).reduce((p, s) => p * (s.slip.pct / 100), 1);
        out.system = {of, free, bankers, columns: combinations(free, of), atLeastPct: Math.round(bankersChance * atLeast(freeProbabilities, of) * 100)};
    }
    return out;
}

/**
 * Whether a slip won, from which selections did: every one for a single
 * or an accumulator; for a system every banker and at least `of` of the
 * free selections (`bankers` marks which are which, none when absent).
 */
export function schedinaWon(kind: SchedinaKind, hits: boolean[], of: number | null | undefined, bankers?: boolean[]): boolean {
    if (hits.length === 0) return false;
    if (kind !== 'system') return hits.every(Boolean);
    const isBanker = (i: number) => bankers?.[i] === true;
    if (hits.some((h, i) => isBanker(i) && !h)) return false;
    const free = hits.filter((_, i) => !isBanker(i));
    return free.filter(Boolean).length >= Math.max(1, Math.min(free.length, of ?? free.length));
}

/** One column of a system: which selections (indices), its chance and its price (the bookmakers' when every selection has one, else the fair). */
export interface SchedinaColumn {
    indices: number[];
    /** 0..1 */
    probability: number;
    odds: number;
    /** The price is the bookmakers' (false: the fair one stood in). */
    priced: boolean;
}

/** Every column of a system: each banker plus every combination of `of` free selections. A single or an accumulator is one column. */
export function schedinaColumns(selections: SchedinaSelection[], of: number | null | undefined): SchedinaColumn[] {
    const bankers = selections.map((s, i) => (s.banker ? i : -1)).filter((i) => i >= 0);
    const free = selections.map((s, i) => (s.banker ? -1 : i)).filter((i) => i >= 0);
    const k = of === null || of === undefined ? free.length : Math.max(1, Math.min(free.length, of));
    const combos: number[][] = [];
    const walk = (start: number, chosen: number[]) => {
        if (chosen.length === k) {
            combos.push(chosen);
            return;
        }
        for (let i = start; i < free.length; i += 1) walk(i + 1, [...chosen, free[i]]);
    };
    if (free.length === 0) combos.push([]);
    else walk(0, []);
    return combos.map((c) => {
        const indices = [...bankers, ...c].sort((a, b) => a - b);
        const priced = indices.every((i) => selections[i].slip.odds !== null);
        return {
            indices,
            probability: indices.reduce((p, i) => p * (selections[i].slip.pct / 100), 1),
            odds: round2(indices.reduce((p, i) => p * (priced ? (selections[i].slip.odds ?? 1) : selections[i].slip.fair), 1)),
            priced,
        };
    });
}

/**
 * The k of a system chosen by the numbers: for every k the expected
 * return of a unit stake spread evenly over the columns, at the
 * bookmakers' prices; the best wins, a likelier system on a tie. Never
 * every free selection at once (that is an accumulator, not a system).
 * With no bookmaker price the returns are all fair (zero): the classic N-1.
 */
export function autoSystemOf(selections: SchedinaSelection[]): number {
    const free = selections.filter((s) => !s.banker).length;
    if (free <= 1) return 1;
    let best = Math.max(1, free - 1);
    let bestReturn = -Infinity;
    let bestChance = -Infinity;
    for (let k = 1; k <= free - 1; k += 1) {
        const columns = schedinaColumns(selections, k);
        if (!columns.every((c) => c.priced)) continue;
        const expected = columns.reduce((s, c) => s + c.probability * c.odds, 0) / columns.length - 1;
        const chance = atLeast(selections.filter((s) => !s.banker).map((s) => s.slip.pct / 100), k);
        if (expected > bestReturn + 1e-9 || (Math.abs(expected - bestReturn) <= 1e-9 && chance > bestChance)) {
            best = k;
            bestReturn = expected;
            bestChance = chance;
        }
    }
    return best;
}

/** One line of a system ticket: every column of `k` free selections (with every banker), as the bookmakers list them. */
export interface SystemGroup {
    k: number;
    /** Free selections in the slip. */
    n: number;
    columns: SchedinaColumn[];
    /** Chance that every banker and at least k free selections win, percent. */
    atLeastPct: number;
    /** Expected return of a unit stake spread over the columns, at their prices, minus one (the edge of the line). */
    edge: number;
    priced: boolean;
}

/** The lines of a slip played as a system: k from every free selection down to one. A single is one line of one column. */
export function systemGroups(selections: SchedinaSelection[]): SystemGroup[] {
    const bankers = selections.filter((s) => s.banker);
    const free = selections.filter((s) => !s.banker);
    const n = free.length;
    const bankersChance = bankers.reduce((p, s) => p * (s.slip.pct / 100), 1);
    const out: SystemGroup[] = [];
    for (let k = Math.max(1, n); k >= 1; k -= 1) {
        const columns = schedinaColumns(selections, n === 0 ? null : k);
        out.push({k, n, columns, atLeastPct: Math.round(bankersChance * (n === 0 ? 1 : atLeast(free.map((s) => s.slip.pct / 100), k)) * 100), edge: columns.reduce((sum, c) => sum + c.probability * c.odds, 0) / columns.length - 1, priced: columns.every((c) => c.priced)});
        if (n === 0) break;
    }
    return out;
}

export type StakeMode = 'recommended' | 'full';

/**
 * How a total stake goes over the lines, per column. Recommended: in
 * proportion to each line's edge, so the lines the model rates above
 * the market get the money and the others none; when no line has an
 * edge, everything on the best one. Full: the same stake on every
 * column of every line (a full-cover system). Steps of five cents.
 */
export function suggestedStakes(groups: SystemGroup[], total: number, mode: StakeMode): number[] {
    if (groups.length === 0 || !(total > 0)) return groups.map(() => 0);
    if (mode === 'full') {
        const columns = groups.reduce((sum, g) => sum + g.columns.length, 0);
        return groups.map(() => toStakeStep(total / columns));
    }
    const edges = groups.map((g) => Math.max(0, g.edge));
    const edgeSum = edges.reduce((sum, v) => sum + v, 0);
    if (edgeSum <= 0) {
        const best = groups.reduce((m, g, i) => (g.edge > groups[m].edge + 1e-9 || (Math.abs(g.edge - groups[m].edge) <= 1e-9 && g.atLeastPct > groups[m].atLeastPct) ? i : m), 0);
        return groups.map((g, i) => (i === best ? toStakeStep(total / g.columns.length) : 0));
    }
    return groups.map((g, i) => toStakeStep((total * edges[i]) / edgeSum / g.columns.length));
}

export interface StakePlan {
    /** Per line: the stake on each column and on the line, what comes back when every column of the line wins. */
    lines: Array<SystemGroup & {stake: number; lineStake: number; linePayout: number}>;
    total: number;
    expectedReturn: number;
    expectedProfit: number;
    /** Every column of every line wins. */
    maxPayout: number;
    /** Chance the payouts exceed the total staked, over every outcome of the selections. */
    profitChance: number;
    priced: boolean;
}

export interface TicketPlan {
    stake: number;
    /** What comes back when every selection wins, at the bookmakers' odds (the fair odds where a bookmaker's is missing). */
    payout: number;
    expectedReturn: number;
    expectedProfit: number;
    /** Every selection wins: the only way a single or an accumulator pays. */
    winChance: number;
    priced: boolean;
}

/**
 * A single or an accumulator valued: one stake, one payout, no lines. The
 * odds are the slip's book odds when every selection has one, the fair
 * odds otherwise (then the expected return is that of a fair bet).
 */
export function ticketPlan(schedina: Pick<Schedina, 'pct' | 'fair' | 'book'>, stake: number): TicketPlan {
    const amount = Math.max(0, stake);
    const priced = schedina.book !== null;
    const odds = schedina.book ?? schedina.fair;
    const payout = round2(amount * odds);
    const expectedReturn = round2((payout * schedina.pct) / 100);
    return {stake: round2(amount), payout, expectedReturn, expectedProfit: round2(expectedReturn - amount), winChance: schedina.pct, priced};
}

/** The ticket valued: `stakes` is the stake per column of each line, in the order of `groups`. */
export function stakePlan(selections: SchedinaSelection[], groups: SystemGroup[], stakes: number[]): StakePlan {
    const lines = groups.map((g, i) => {
        const stake = Math.max(0, stakes[i] ?? 0);
        return {...g, stake, lineStake: round2(stake * g.columns.length), linePayout: round2(g.columns.reduce((sum, c) => sum + c.odds * stake, 0))};
    });
    const total = round2(lines.reduce((sum, l) => sum + l.lineStake, 0));
    const expectedReturn = round2(lines.reduce((sum, l) => sum + l.columns.reduce((s2, c) => s2 + c.probability * c.odds * l.stake, 0), 0));
    const n = selections.length;
    let profitChance = 0;
    if (total > 0) {
        for (let mask = 0; mask < 1 << n; mask += 1) {
            let p = 1;
            for (let i = 0; i < n; i += 1) {
                const q = selections[i].slip.pct / 100;
                p *= mask & (1 << i) ? q : 1 - q;
            }
            if (p === 0) continue;
            const back = lines.reduce((sum, l) => (l.stake > 0 ? sum + l.columns.reduce((s2, c) => (c.indices.every((i) => mask & (1 << i)) ? s2 + c.odds * l.stake : s2), 0) : sum), 0);
            if (back > total + 1e-9) profitChance += p;
        }
    }
    return {lines, total, expectedReturn, expectedProfit: round2(expectedReturn - total), maxPayout: round2(lines.reduce((sum, l) => sum + l.linePayout, 0)), profitChance: Math.round(profitChance * 100), priced: lines.every((l) => l.priced)};
}
