import {DEFENCE_THRESHOLDS, type DefenceBonus} from './config';
import type {FormationKey} from './strategies';
import {FORMATIONS} from './strategies';
import {recommendLineup, type LineupAdvice, type PlayerForecast} from './matchday';
import type {FantaRole, FantaRules} from './scores';
import {halfVoto, toVoto, type VotoCalibration} from './voto';

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
    /** The vote when known, official or typed in (null = no vote); absent when only the estimate is there. */
    voto?: number | null;
    source?: 'official' | 'manual';
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
    /** Played: over. Live: only the matches already finished are in. */
    state: 'played' | 'live';
    /** True when the official votes of the round are in. */
    official: boolean;
    /** Clubs whose match of the round is over: their players can be voted. */
    finishedTeams: number[];
    /** The matches of the round, the ones over with their score: what every line of the recap is about. */
    matches: RoundMatch[];
    stats: Record<number, RoundStat>;
}

export interface RoundMatch {
    home: {id: number; name: string};
    away: {id: number; name: string};
    finished: boolean;
    score: [number, number] | null;
}

/** The match a club played in the round, as "Inter 2-1 Roma"; null when it is not over. */
export function matchLabel(results: RoundResults, teamId: number): string | null {
    const m = results.matches.find((x) => x.home.id === teamId || x.away.id === teamId);
    if (!m || !m.finished) return null;
    return `${m.home.name} ${m.score ? `${m.score[0]}-${m.score[1]}` : '–'} ${m.away.name}`;
}

/** A vote typed in by hand for a player of a round, with the events; kept on the device and in the account. */
export interface ManualVote {
    teamId: number;
    /** The vote; 0 is a typed "no vote"; null means it was not typed (only the events were), so the site's own vote stays. */
    voto: number | null;
    goals: number;
    assists: number;
    yellow: number;
    red: number;
    conceded: number;
    penaltiesSaved: number;
    penaltiesMissed: number;
    ownGoals: number;
    at: string;
}

const count = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.round(v)) : 0);
/** A typed vote as stored or posted: the vote in quarters between 1 and 10 (else "no vote"), the events as counts. */
export function parseManualVote(raw: unknown): ManualVote | null {
    const m = raw as Partial<ManualVote> | null;
    if (!m || typeof m !== 'object' || typeof m.teamId !== 'number') return null;
    const voto = typeof m.voto === 'number' && Number.isFinite(m.voto) ? (m.voto === 0 ? 0 : m.voto >= 1 && m.voto <= 10 ? halfVoto(m.voto) : null) : null;
    return {teamId: m.teamId, voto, goals: count(m.goals), assists: count(m.assists), yellow: count(m.yellow), red: count(m.red), conceded: count(m.conceded), penaltiesSaved: count(m.penaltiesSaved), penaltiesMissed: count(m.penaltiesMissed), ownGoals: count(m.ownGoals), at: typeof m.at === 'string' ? m.at : ''};
}

export const EMPTY_STAT: RoundStat = {minutes: 0, rating: null, goals: 0, assists: 0, yellow: 0, red: 0, conceded: 0, penaltiesSaved: 0, penaltiesMissed: 0, ownGoals: 0};

/** The results with the votes typed on this device laid over: an official vote stays, a typed one fills the rest. */
export function withManualVotes(results: RoundResults, manual: Record<number, ManualVote> | undefined): RoundResults {
    if (!manual || Object.keys(manual).length === 0) return results;
    const stats = {...results.stats};
    for (const [key, m] of Object.entries(manual)) {
        const id = Number(key);
        const base = stats[id] ?? EMPTY_STAT;
        if (base.source === 'official') continue;
        const typedVoto = m.voto === null ? {} : {voto: m.voto === 0 ? null : m.voto, source: 'manual' as const};
        stats[id] = {...base, minutes: base.minutes > 0 ? base.minutes : m.voto !== null && m.voto !== 0 ? 90 : 0, ...typedVoto, goals: m.goals, assists: m.assists, yellow: m.yellow, red: m.red, conceded: m.conceded, penaltiesSaved: m.penaltiesSaved, penaltiesMissed: m.penaltiesMissed, ownGoals: m.ownGoals};
    }
    return {...results, stats};
}

export interface LineupPlayer {
    id: number;
    role: FantaRole;
}

/** The provider's rating on the vote scale, whatever vote is known: the placeholder of an empty field. */
export function toVotoEstimate(stat: RoundStat, role: FantaRole, calibration: VotoCalibration): number | null {
    if (stat.rating === null || stat.minutes < VOTE_MINUTES) return null;
    return halfVoto(toVoto(stat.rating, role, calibration));
}

/** The newspaper vote: the known one when in, else the rating on the vote scale; null when he had no vote. */
export function votoOf(stat: RoundStat | undefined, role: FantaRole, calibration: VotoCalibration): number | null {
    if (!stat) return null;
    if (stat.voto !== undefined) return stat.voto;
    if (stat.rating === null || stat.minutes < VOTE_MINUTES) return null;
    return halfVoto(toVoto(stat.rating, role, calibration));
}

/** The fantasy points of the vote and the events under the league's rules; null without a vote. */
export function roundPoints(stat: RoundStat | undefined, role: FantaRole, rules: FantaRules, calibration: VotoCalibration): number | null {
    const voto = votoOf(stat, role, calibration);
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
    /** Starters whose match is still to play (a live round): not counted, not replaced. */
    pending: number;
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
export function playLineup(starters: LineupPlayer[], bench: LineupPlayer[], results: RoundResults, rules: FantaRules, calibration: VotoCalibration, defence: DefenceBonus | false, maxSubs = MAX_SUBS, pending: ReadonlySet<number> = new Set()): PlayedLineup {
    const slot = (p: LineupPlayer): PlayedSlot => ({id: p.id, role: p.role, voto: votoOf(results.stats[p.id], p.role, calibration), points: roundPoints(results.stats[p.id], p.role, rules, calibration)});
    const eleven = starters.map(slot);
    const reserves = bench.map(slot);
    const cameIn: PlayedSlot[] = [];
    const left: PlayedSlot[] = [];
    let subs = 0;
    for (const r of reserves) {
        const hole = r.points !== null && !pending.has(r.id) && subs < maxSubs ? eleven.find((s) => s.role === r.role && s.points === null && !pending.has(s.id) && s.replacedBy === undefined) : undefined;
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
    const holes = eleven.filter((s) => s.points === null && s.replacedBy === undefined && !pending.has(s.id)).length;
    const stillToPlay = eleven.filter((s) => pending.has(s.id)).length;
    return {slots: [...eleven, ...cameIn], bench: left, points, defence: defenceBonus, total: Math.round((points + defenceBonus) * 100) / 100, subs, holes, pending: stillToPlay};
}

export interface Hindsight {
    formation: FormationKey;
    ids: number[];
    total: number;
}

/** The best eleven the roster could have fielded, knowing the votes: the top of each role for every formation. */
export function bestHindsight(roster: LineupPlayer[], results: RoundResults, rules: FantaRules, calibration: VotoCalibration, defence: DefenceBonus | false): Hindsight | null {
    const scored = roster.map((p) => ({...p, voto: votoOf(results.stats[p.id], p.role, calibration), points: roundPoints(results.stats[p.id], p.role, rules, calibration)})).filter((p) => p.points !== null);
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

export interface RoundScore {
    /** The advice as it stood at the lock, replayed; null without a lock. */
    advice: LineupAdvice | null;
    forecasts: PlayerForecast[];
    played: PlayedLineup | null;
    best: Hindsight | null;
}

/**
 * A round scored for a team: the advised lineup of its lock (replayed
 * with its pins and forced formation) played against the results, and
 * the best eleven with hindsight. Players no longer in the roster are
 * left out of the replay.
 */
export function scoreRound(team: {rules: FantaRules; formation: string | null; defence: DefenceBonus | false}, roster: LineupPlayer[], results: RoundResults, lock: {forecasts: unknown[]; forced: string | null; pinned: number[]; benched?: number[]} | null, calibration: VotoCalibration, pending: ReadonlySet<number> = new Set()): RoundScore {
    const ids = new Set(roster.map((p) => p.id));
    const forecasts = lock ? (lock.forecasts as PlayerForecast[]).filter((f) => ids.has(f.player.id)) : [];
    const advice = lock ? recommendLineup(forecasts, {rules: team.rules, defenceModifier: team.defence, prefer: team.formation as FormationKey | null, force: lock.forced as FormationKey | null, pinned: new Set(lock.pinned), benched: new Set(lock.benched ?? [])}) : null;
    const lp = (p: {id: number; role: FantaRole}) => ({id: p.id, role: p.role});
    const played = advice ? playLineup(advice.starters.map((f) => lp(f.player)), advice.bench.map((f) => lp(f.player)), results, team.rules, calibration, team.defence, MAX_SUBS, pending) : null;
    const best = bestHindsight(roster, results, team.rules, calibration, team.defence);
    return {advice, forecasts, played, best};
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
        const actual = roundPoints(results.stats[f.id], f.role, rules, calibration);
        if (actual === null) continue;
        out.push({id: f.id, expected: f.points, actual, delta: Math.round((actual - f.points) * 100) / 100});
    }
    return out.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
}
