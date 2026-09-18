import {MAX_SUBS, playLineup, type LineupPlayer, type PlayedSlot, type RoundMatch, type RoundResults, type RoundStat} from './recap';
import type {FantaRole, FantaRules} from './scores';
import type {DefenceBonus} from './config';
import type {VotoCalibration} from './voto';

/**
 * The score of a lineup while the round is played: the eleven as
 * fielded at the lock, every player with the points of his match so
 * far (the provider's live rating on the vote scale plus bonus and
 * malus), the automatic substitutions only once a match is over, and
 * the total as it stands. Pure: the results come from the matchday.
 */

/** Where his club's match of the round stands. */
export type SlotState = 'done' | 'live' | 'pending' | 'none';

export interface LiveLineupPlayer extends LineupPlayer {
    teamId: number;
}

export interface LiveSlot extends PlayedSlot {
    teamId: number;
    state: SlotState;
    /** The minute of his match when it is on the pitch. */
    minute: number | null;
    /** "Inter 2-1 Roma": the score so far or the final one; null before kick-off. */
    match: string | null;
    stat: RoundStat | undefined;
}

export interface LiveScore {
    round: string;
    /** Nothing kicked off yet, some match on the pitch or still to come, or every match of the eleven over. */
    state: 'pending' | 'live' | 'over';
    /** The eleven as fielded (starters, then the substitutes who came in), keeper first then by role. */
    slots: LiveSlot[];
    /** The bench players who did not come in, in bench order. */
    bench: LiveSlot[];
    /** The players' points, the defence modifier on them, and the sum. */
    points: number;
    defence: number;
    total: number;
    subs: number;
    /** Starters whose match is over without a vote and nobody to replace them. */
    holes: number;
    /** Among the starters: matches over, on the pitch, still to play. */
    counts: {done: number; live: number; pending: number};
    /** Some points are of a match on the pitch, or of an estimated vote: the total can still move. */
    provisional: boolean;
}

/** The match a club plays in the round, with its state. */
export function teamMatch(results: RoundResults, teamId: number): {match: RoundMatch; state: SlotState} | null {
    const m = results.matches.find((x) => x.home.id === teamId || x.away.id === teamId);
    if (!m) return null;
    return {match: m, state: m.finished ? 'done' : m.live ? 'live' : 'pending'};
}

/** "Inter 2-1 Roma", the score so far on a match on the pitch, the final one when over; null before kick-off. */
export function matchLine(m: RoundMatch): string | null {
    if (!m.finished && !m.live) return null;
    return `${m.home.name} ${m.score ? `${m.score[0]}-${m.score[1]}` : '–'} ${m.away.name}`;
}

const ROLE_ORDER: Record<FantaRole, number> = {P: 0, D: 1, C: 2, A: 3};

/**
 * The lineup scored on the round as it stands. A starter whose match is
 * on the pitch counts with his points so far and is never replaced; one
 * whose match is still to come counts nothing yet; one whose match is
 * over without a vote is replaced from the bench as the league does
 * (same role, bench order, up to the substitutions allowed).
 */
export function liveScore(starters: LiveLineupPlayer[], bench: LiveLineupPlayer[], results: RoundResults, rules: FantaRules, calibration: VotoCalibration, defence: DefenceBonus | false, maxSubs = MAX_SUBS): LiveScore {
    const stateOf = (p: LiveLineupPlayer): SlotState => teamMatch(results, p.teamId)?.state ?? 'none';
    // Nobody is replaced, and nobody comes in, before his match is over.
    const pending = new Set([...starters, ...bench].filter((p) => stateOf(p) === 'live' || stateOf(p) === 'pending').map((p) => p.id));
    const played = playLineup(starters, bench, results, rules, calibration, defence, maxSubs, pending);
    const byId = new Map([...starters, ...bench].map((p) => [p.id, p]));
    const enrich = (s: PlayedSlot): LiveSlot => {
        const p = byId.get(s.id)!;
        const tm = teamMatch(results, p.teamId);
        return {...s, teamId: p.teamId, state: tm?.state ?? 'none', minute: tm?.match.live ? tm.match.minute ?? null : null, match: tm ? matchLine(tm.match) : null, stat: results.stats[s.id]};
    };
    const slots = played.slots.map(enrich).sort((a, b) => (a.replaces !== undefined ? 1 : 0) - (b.replaces !== undefined ? 1 : 0) || ROLE_ORDER[a.role] - ROLE_ORDER[b.role]);
    const eleven = slots.filter((s) => s.replaces === undefined);
    const count = (state: SlotState) => eleven.filter((s) => s.state === state).length;
    const counts = {done: count('done') + count('none'), live: count('live'), pending: count('pending')};
    const state: LiveScore['state'] = counts.live > 0 || (counts.pending > 0 && count('done') > 0) ? 'live' : counts.pending > 0 ? 'pending' : 'over';
    const estimated = slots.some((s) => s.points !== null && s.stat?.voto === undefined);
    return {round: results.round, state, slots, bench: played.bench.map(enrich), points: played.points, defence: played.defence, total: played.total, subs: played.subs, holes: played.holes, counts, provisional: state !== 'over' || estimated};
}
