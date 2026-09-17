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
    /** A system: columns of this many selections out of `size` ("k su N"). */
    system?: number;
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
    /** A system only: the columns and the chance that at least `system` selections win. */
    system?: {of: number; columns: number; atLeastPct: number};
}

/** The tier a risk asks for, and the ones it falls back to when a match has none. */
const TIERS_BY_RISK: Record<SchedinaRisk, Array<BetSuggestion['tier']>> = {low: ['safe'], medium: ['balanced', 'safe'], high: ['bold', 'balanced']};

const round2 = (v: number) => Math.round(v * 100) / 100;

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
        picks.push({fixtureId: c.fixtureId, competition: c.competition, home: c.home, away: c.away, startingAt: c.startingAt, tier, slip});
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
        const of = Math.max(1, Math.min(size - 1, Math.round(options.system ?? Math.max(1, size - 1))));
        out.system = {of, columns: combinations(size, of), atLeastPct: Math.round(atLeast(probabilities, of) * 100)};
    }
    return out;
}

/** Whether a slip won, from which selections did: every one for a single or an accumulator, at least `of` for a system. */
export function schedinaWon(kind: SchedinaKind, hits: boolean[], of: number | null | undefined): boolean {
    const won = hits.filter(Boolean).length;
    return kind === 'system' ? won >= Math.max(1, of ?? hits.length) : won === hits.length && hits.length > 0;
}
