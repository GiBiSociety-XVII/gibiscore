import {DEFENCE_THRESHOLDS, type DefenceBonus} from './config';
import type {FormationKey} from './strategies';
import {FORMATIONS} from './strategies';
import type {FantaRole, FantaRules} from './scores';
import {toVoto, type VotoCalibration} from './voto';

/**
 * The recap of a round: what every player of a roster really did, the
 * points of the lineup that was fielded (with the automatic
 * substitutions), the best eleven with hindsight, and the surprises
 * against the forecast. The votes are the official ones when the
 * round's workbook is in; otherwise the provider's rating on the vote
 * scale, flagged as an estimate. Pure.
 */

/** Fantacalcio.it: an own goal costs two points. */
export const OWN_GOAL = -2;
/** Substitutions a lineup gets, in bench order, same role. */
export const MAX_SUBS = 3;
/** Minutes under which the provider's rating is not taken as a vote (the newspaper gives none). */
export const VOTE_MINUTES = 10;

export interface RoundStat {
    minutes: number;
    /** The provider's rating, its own scale; null when he had none. */
    rating: number | null;
    /** The official vote when the round's votes are in (null = no vote); absent otherwise. */
    voto?: number | null;
    goals: number;
    assists: number;
    yellow: number;
    red: number;
    /** Goals his club conceded while he was on the pitch (the official votes) or in the match (the estimate). */
    conceded: number;
    penaltiesSaved: number;
    penaltiesMissed: number;
    ownGoals: number;
}

export interface RoundResults {
    round: string;
    /** True when the official votes of the round are in. */
    official: boolean;
    stats: Record<number, RoundStat>;
}

export interface LineupPlayer {
    id: number;
    role: FantaRole;
}

/** The newspaper vote: official when in, else the rating on the vote scale; null when he had no vote. */
export function votoOf(stat: RoundStat | undefined, role: FantaRole, official: boolean, calibration: VotoCalibration): number | null {
    if (!stat) return null;
    if (official && stat.voto !== undefined) return stat.voto;
    if (stat.rating === null || stat.minutes < VOTE_MINUTES) return null;
    return toVoto(stat.rating, role, calibration);
}

/** The fantasy points of the vote and the events under the league's rules; null without a vote. */
export function roundPoints(stat: RoundStat | undefined, role: FantaRole, rules: FantaRules, official: boolean, calibration: VotoCalibration): number | null {
    const voto = votoOf(stat, role, official, calibration);
    if (voto === null || !stat) return null;
    const keeper = role === 'P' ? stat.conceded * rules.goalConceded + stat.penaltiesSaved * rules.penaltySaved + (stat.conceded === 0 ? rules.cleanSheet : 0) : 0;
    const value = voto + stat.goals * rules.goal + stat.assists * rules.assist + stat.yellow * rules.yellow + stat.red * rules.red + stat.penaltiesMissed * rules.penaltyMissed + stat.ownGoals * OWN_GOAL + keeper;
    return Math.round(value * 100) / 100;
}

export interface PlayedSlot {
    id: number;
    role: FantaRole;
    voto: number | null;
    points: number | null;
    /** A starter: the bench player who came in for him, when he had no vote and one could. */
    replacedBy?: number;
    /** A substitute who came in: the starter he replaced. */
    replaces?: number;
}

export interface PlayedLineup {
    /** The eleven as fielded: starters (replaced or not), then the substitutes who came in. */
    slots: PlayedSlot[];
    /** The bench players who did not come in, in order. */
    bench: PlayedSlot[];
    points: number;
    defence: number;
    total: number;
    subs: number;
    /** Starters left without a vote and nobody to replace them: zero points each. */
    holes: number;
}

/** The defence modifier on the real votes: keeper and the three best-voted defenders on the pitch. */
export function defenceModifierOf(keeperVoto: number | null, defenderVotos: number[], bonus: DefenceBonus | false): number {
    if (!bonus || keeperVoto === null || defenderVotos.length < bonus.minDefenders) return 0;
    const line = [keeperVoto, ...[...defenderVotos].sort((a, b) => b - a).slice(0, 3)];
    const avg = line.reduce((s, v) => s + v, 0) / line.length;
    let points = 0;
    DEFENCE_THRESHOLDS.forEach((from, i) => {
        if (avg >= from) points = bonus.points[i] ?? points;
    });
    return points;
}

/**
 * The lineup as the league scores it: every starter with a vote counts;
 * a starter without one is replaced by the first bench player of his
 * role with a vote, in bench order, up to the substitutions allowed.
 */
export function playLineup(starters: LineupPlayer[], bench: LineupPlayer[], results: RoundResults, rules: FantaRules, calibration: VotoCalibration, defence: DefenceBonus | false, maxSubs = MAX_SUBS): PlayedLineup {
    const slot = (p: LineupPlayer): PlayedSlot => ({id: p.id, role: p.role, voto: votoOf(results.stats[p.id], p.role, results.official, calibration), points: roundPoints(results.stats[p.id], p.role, rules, results.official, calibration)});
    const eleven = starters.map(slot);
    const reserves = bench.map(slot);
    const cameIn: PlayedSlot[] = [];
    const left: PlayedSlot[] = [];
    let subs = 0;
    for (const r of reserves) {
        const hole = r.points !== null && subs < maxSubs ? eleven.find((s) => s.role === r.role && s.points === null && s.replacedBy === undefined) : undefined;
        if (hole) {
            hole.replacedBy = r.id;
            cameIn.push({...r, replaces: hole.id});
            subs++;
        } else left.push(r);
    }
    const onPitch = [...eleven.filter((s) => s.points !== null), ...cameIn];
    const points = Math.round(onPitch.reduce((s, x) => s + (x.points ?? 0), 0) * 100) / 100;
    const keeper = onPitch.find((s) => s.role === 'P');
    const defenceBonus = defenceModifierOf(keeper?.voto ?? null, onPitch.filter((s) => s.role === 'D' && s.voto !== null).map((s) => s.voto!), defence);
    const holes = eleven.filter((s) => s.points === null && s.replacedBy === undefined).length;
    return {slots: [...eleven, ...cameIn], bench: left, points, defence: defenceBonus, total: Math.round((points + defenceBonus) * 100) / 100, subs, holes};
}

export interface Hindsight {
    formation: FormationKey;
    ids: number[];
    total: number;
}

/** The best eleven the roster could have fielded, knowing the votes: the top of each role for every formation. */
export function bestHindsight(roster: LineupPlayer[], results: RoundResults, rules: FantaRules, calibration: VotoCalibration, defence: DefenceBonus | false): Hindsight | null {
    const scored = roster.map((p) => ({...p, voto: votoOf(results.stats[p.id], p.role, results.official, calibration), points: roundPoints(results.stats[p.id], p.role, rules, results.official, calibration)})).filter((p) => p.points !== null);
    let best: Hindsight | null = null;
    for (const f of FORMATIONS) {
        const chosen: typeof scored = [];
        let feasible = true;
        for (const role of ['P', 'D', 'C', 'A'] as FantaRole[]) {
            const ofRole = scored.filter((p) => p.role === role).sort((a, b) => b.points! - a.points!).slice(0, f.need[role]);
            if (ofRole.length < f.need[role]) feasible = false;
            chosen.push(...ofRole);
        }
        if (!feasible) continue;
        const keeper = chosen.find((p) => p.role === 'P');
        const total = chosen.reduce((s, p) => s + p.points!, 0) + defenceModifierOf(keeper?.voto ?? null, chosen.filter((p) => p.role === 'D').map((p) => p.voto!), defence);
        if (!best || total > best.total + 1e-9) best = {formation: f.key, ids: chosen.map((p) => p.id), total: Math.round(total * 100) / 100};
    }
    return best;
}

export interface Surprise {
    id: number;
    expected: number;
    actual: number;
    delta: number;
}

/** Real points against the points expected when starting, for everyone who had a vote; the biggest gaps first. */
export function surprises(forecasts: Array<{id: number; role: FantaRole; points: number}>, results: RoundResults, rules: FantaRules, calibration: VotoCalibration): Surprise[] {
    const out: Surprise[] = [];
    for (const f of forecasts) {
        const actual = roundPoints(results.stats[f.id], f.role, rules, results.official, calibration);
        if (actual === null) continue;
        out.push({id: f.id, expected: f.points, actual, delta: Math.round((actual - f.points) * 100) / 100});
    }
    return out.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
}
