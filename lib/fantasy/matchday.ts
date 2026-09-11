import {DEFAULT_DEFENCE_BONUS, DEFENCE_THRESHOLDS, type DefenceBonus} from './config';
import type {FantaEvents, FantaRole, FantaRules} from './scores';
import {FORMATIONS, type FormationKey} from './strategies';

/**
 * The lineup for a matchday: who of a roster to field, in which
 * formation, and how to order the bench, from what the coming round
 * actually looks like. Each player gets a chance of starting and one of
 * a vote off the bench (the club's official lineup when it is out,
 * otherwise how the coach has used him this season and the auction's
 * starter mark) and the fantasy points he is expected to score in either
 * case (his rating and bonus rates, moved
 * by the match: home or away, how strong the opponent is, the form of
 * both sides, how many goals his side and the other are expected to
 * score). Pure: the data comes from the matchday loader.
 */

export type UsageStatus = 'started' | 'sub' | 'bench' | 'out';

export interface RecentMatch {
    fixtureId: number;
    /** How he was used: started, came on, sat the whole match, not in the squad. */
    status: UsageStatus;
    minutes: number;
    rating: number | null;
    goals: number;
    assists: number;
}

export interface MatchdayFixture {
    id: number;
    round: string;
    startingAt: string;
    state: string;
    home: {id: number; name: string};
    away: {id: number; name: string};
    /** Expected goals of each side and the outcome percentages, when the season has enough matches. */
    prediction: {lambdaHome: number; lambdaAway: number; home: number; draw: number; away: number} | null;
    /** Goals each side scores in an ordinary match (its attack strength, shrunk on a small sample): the yardstick for this match's expected goals. */
    avgFor: {home: number | null; away: number | null};
    /** Last results of each side, oldest first ("WWDLW"), null when unknown. */
    form: {home: string | null; away: string | null};
}

export interface PlayerContext {
    teamId: number;
    /** This season's league matches of his club, most recent first. */
    recent: RecentMatch[];
    /** The club's official lineup for the round's fixture, once published. */
    official: 'starter' | 'bench' | 'out' | null;
    sidelined: {category: string; description: string | null; longTerm: boolean} | null;
}

export interface MatchdayPlayer {
    id: number;
    name: string;
    slug: string;
    role: FantaRole;
    team: {id: number; name: string};
    penaltyTaker: boolean;
    scores: {starter: number; fantaAvg: number | null; events: FantaEvents | null};
}

export type ForecastReason =
    | {kind: 'official'; status: 'starter' | 'bench' | 'out'}
    | {kind: 'sidelined'; category: string; longTerm: boolean; description: string | null}
    | {kind: 'doubtful'; description: string | null}
    | {kind: 'noMatch'}
    | {kind: 'usage'; started: number; came: number; total: number}
    | {kind: 'noUsage'}
    | {kind: 'match'; home: boolean; opponent: string; win: number; lambdaFor: number; lambdaAgainst: number}
    | {kind: 'form'; own: number; opp: number; of: number}
    | {kind: 'manual'}
    | {kind: 'attack'; factor: number}
    | {kind: 'cleanSheet'; pct: number}
    | {kind: 'penalty'};

export interface PlayerForecast {
    player: MatchdayPlayer;
    fixture: MatchdayFixture | null;
    home: boolean | null;
    opponent: {id: number; name: string} | null;
    /** Chance he gets a vote: a start, or enough minutes off the bench. */
    plays: number;
    /** Chance he starts (part of `plays`). */
    starts: number;
    /** Expected rating (the vote alone) when he starts. */
    rating: number;
    /** Expected fantasy points when he starts. */
    points: number;
    /** Expected fantasy points when he comes off the bench: the sub's vote and a share of his bonus. */
    subPoints: number;
    /** What fielding him is worth: starts × points + (plays − starts) × subPoints. */
    value: number;
    reasons: ForecastReason[];
}

export interface FormationTotal {
    key: FormationKey;
    total: number;
    /** False when the pinned starters of a role do not fit in it. */
    feasible: boolean;
}

export interface LineupAdvice {
    formation: FormationKey;
    /** The eleven, keeper first then by role, best first within the role. */
    starters: PlayerForecast[];
    /** The rest of the roster as a bench: by role, the most useful first. */
    bench: PlayerForecast[];
    /**
     * Per player id, what his slot is worth: his points when he plays, the
     * first substitute's when he does not. What the starters are ranked by.
     */
    slots: Map<number, number>;
    total: number;
    /** Every formation, best first. */
    formations: FormationTotal[];
}

export interface MatchdayOptions {
    rules: FantaRules;
    defenceModifier?: boolean | DefenceBonus;
    /** The formation the roster was built for: chosen when within a hair of the best. */
    prefer?: FormationKey | null;
    /** A formation chosen by hand: fielded whatever it is worth (when the pinned starters fit). */
    force?: FormationKey | null;
    /** Players (ids) that must start, whatever the numbers say: the lineup is built around them. */
    pinned?: ReadonlySet<number>;
}

const ROLES: FantaRole[] = ['P', 'D', 'C', 'A'];
/** Rating a player without history is expected to get. */
const ROLE_RATING: Record<FantaRole, number> = {P: 6.0, D: 6.0, C: 6.05, A: 6.1};
/** Recent matches weigh 1, 0.8, 0.64... going back. */
const RECENCY = 0.8;
/** The auction's starter mark counts as this many matches beside the recent ones. */
const PRIOR_MATCHES = 1.5;
/** A substitute gets a vote (enough minutes) this often. */
const SUB_VOTE = 0.7;
/** A substitute's vote when nothing happens, and the share of his per-match bonus rates he keeps in his minutes. */
const SUB_RATING = 6.0;
const SUB_SHARE = 0.4;
/** Official lineup: chance of a vote for a starter, and of a start and a vote off the bench for a substitute. */
const OFFICIAL_STARTER = 0.95;
const OFFICIAL_BENCH = {start: 0.03, sub: 0.22};
const OFFICIAL_OUT = 0.02;
/** Goals a side scores per match when the season cannot say yet. */
const LEAGUE_GOALS = 1.35;
/** Rating between a sure win and a sure loss. */
const WIN_SWING = 0.35;
/** Rating between a side in full form and one in none, against the opponent's. */
const FORM_SWING = 0.2;
/** Rating of a keeper or defender between a sure clean sheet and none, around the usual chance. */
const CLEAN_SHEET_SWING = 0.3;
const USUAL_CLEAN_SHEET = Math.exp(-1.3);
/** How hard the match's expected goals move the bonus rates: above 1 stretches the gap between a big and a small opponent. */
const ATTACK_POWER = 1.15;

/** Points won in the last results as a fraction of the maximum, null when nothing is known. */
export function formScore(form: string | null): number | null {
    if (!form) return null;
    const results = form.split('').filter((c) => c === 'W' || c === 'D' || c === 'L');
    if (results.length === 0) return null;
    return results.reduce((s, r) => s + (r === 'W' ? 3 : r === 'D' ? 1 : 0), 0) / (results.length * 3);
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

export interface PlayChance {
    /** Starts. */
    start: number;
    /** Comes off the bench and plays enough for a vote. */
    sub: number;
}

/** The chance of a start, and of a vote off the bench: the official lineup, else absences, else how the coach has used him and the auction's mark. */
function playChance(p: MatchdayPlayer, ctx: PlayerContext | null, fixture: MatchdayFixture | null, reasons: ForecastReason[]): PlayChance {
    if (!fixture) {
        reasons.push({kind: 'noMatch'});
        return {start: 0, sub: 0};
    }
    if (ctx?.official) {
        reasons.push({kind: 'official', status: ctx.official});
        return ctx.official === 'starter' ? {start: OFFICIAL_STARTER, sub: 0} : ctx.official === 'bench' ? OFFICIAL_BENCH : {start: OFFICIAL_OUT, sub: 0};
    }
    if (ctx?.sidelined?.category === 'manual') {
        reasons.push({kind: 'manual'});
        return {start: 0, sub: 0};
    }
    if (ctx?.sidelined && ctx.sidelined.category !== 'doubtful') {
        reasons.push({kind: 'sidelined', category: ctx.sidelined.category, longTerm: ctx.sidelined.longTerm, description: ctx.sidelined.description});
        return {start: 0, sub: 0};
    }
    const recent = ctx?.recent ?? [];
    let weight = 0;
    let startedW = 0;
    let subW = 0;
    let started = 0;
    let came = 0;
    recent.slice(0, 8).forEach((m, i) => {
        const w = RECENCY ** i;
        weight += w;
        if (m.status === 'started') {
            startedW += w;
            started += 1;
        } else if (m.status === 'sub') {
            subW += w;
            came += 1;
        }
    });
    const prior = clamp(p.scores.starter / 100, 0, 1);
    let start = weight > 0 ? (startedW + PRIOR_MATCHES * prior) / (weight + PRIOR_MATCHES) : prior;
    // Off the bench he still gets a vote when he plays enough: what he did lately, at the sub's rate of votes.
    let sub = weight > 0 ? (subW / (weight + PRIOR_MATCHES)) * SUB_VOTE : 0;
    if (recent.length > 0) reasons.push({kind: 'usage', started, came, total: Math.min(8, recent.length)});
    else reasons.push({kind: 'noUsage'});
    if (ctx?.sidelined?.category === 'doubtful') {
        reasons.push({kind: 'doubtful', description: ctx.sidelined.description});
        start *= 0.45;
        sub *= 0.45;
    }
    start = clamp(start, 0.02, 0.97);
    sub = clamp(sub, 0, 0.97 - start);
    return {start, sub};
}

/** Expected rating and fantasy points when he plays, moved by the match ahead. */
function expectedPoints(p: MatchdayPlayer, fixture: MatchdayFixture | null, home: boolean | null, rules: FantaRules, reasons: ForecastReason[]): {rating: number; points: number; subPoints: number} {
    const ev = p.scores.events;
    const baseRating = ev?.rating ?? p.scores.fantaAvg ?? ROLE_RATING[p.role];
    let rating = baseRating;
    let attack = 1;
    let lambdaAgainst: number | null = null;
    const pr = fixture?.prediction ?? null;
    if (fixture && pr && home !== null) {
        const win = home ? pr.home : pr.away;
        const lose = home ? pr.away : pr.home;
        const lambdaFor = home ? pr.lambdaHome : pr.lambdaAway;
        lambdaAgainst = home ? pr.lambdaAway : pr.lambdaHome;
        // A side that wins rates better: a third of a point between a sure win and a sure loss (the gap between a
        // big club and a small one, as the prediction sees it); home a little more.
        rating += WIN_SWING * ((win - lose) / 100) + (home ? 0.05 : -0.05);
        // Form on top: a side on a run against one in a slump, from the last results of both.
        const own = formScore(home ? fixture.form.home : fixture.form.away);
        const opp = formScore(home ? fixture.form.away : fixture.form.home);
        if (own !== null && opp !== null) {
            rating += FORM_SWING * (own - opp);
            const of = Math.max((home ? fixture.form.home : fixture.form.away)!.length, 1) * 3;
            if (Math.abs(own - opp) >= 0.2) reasons.push({kind: 'form', own: Math.round(own * of), opp: Math.round(opp * of), of});
        }
        // Keepers and defenders rate with the sheet: facing a weak attack lifts them, a strong one weighs.
        if (p.role === 'P' || p.role === 'D') rating += CLEAN_SHEET_SWING * (Math.exp(-lambdaAgainst) - USUAL_CLEAN_SHEET);
        const avg = (home ? fixture.avgFor.home : fixture.avgFor.away) ?? LEAGUE_GOALS;
        attack = clamp((lambdaFor / Math.max(0.3, avg)) ** ATTACK_POWER, 0.5, 1.8);
        reasons.push({kind: 'match', home, opponent: home ? fixture.away.name : fixture.home.name, win, lambdaFor, lambdaAgainst});
        if (Math.abs(attack - 1) >= 0.15 && p.role !== 'P') reasons.push({kind: 'attack', factor: attack});
    }
    if (!ev) return {rating, points: rating, subPoints: SUB_RATING};
    const bonus = ev.goals * attack * rules.goal + ev.assists * attack * rules.assist + ev.yellow * rules.yellow + ev.red * rules.red + ev.penaltyMissed * rules.penaltyMissed;
    let points = rating + bonus;
    // Off the bench: the sub's plain vote, a share of his bonus and malus for the minutes he gets.
    let subPoints = SUB_RATING + bonus * SUB_SHARE;
    if (p.role === 'P') {
        const conceded = lambdaAgainst ?? ev.conceded;
        const cleanSheet = lambdaAgainst !== null ? Math.exp(-lambdaAgainst) : ev.cleanSheet;
        const keeping = conceded * rules.goalConceded + cleanSheet * rules.cleanSheet + ev.penaltySaved * rules.penaltySaved;
        points += keeping;
        subPoints += keeping * SUB_SHARE;
        if (lambdaAgainst !== null) reasons.push({kind: 'cleanSheet', pct: Math.round(cleanSheet * 100)});
    }
    if (p.penaltyTaker && p.role !== 'P') reasons.push({kind: 'penalty'});
    return {rating, points: Math.round(points * 100) / 100, subPoints: Math.round(subPoints * 100) / 100};
}

/** One player's outlook for the round. */
export function forecastPlayer(p: MatchdayPlayer, ctx: PlayerContext | null, fixtures: MatchdayFixture[], rules: FantaRules): PlayerForecast {
    const fixture = fixtures.find((f) => f.home.id === p.team.id || f.away.id === p.team.id) ?? null;
    const home = fixture ? fixture.home.id === p.team.id : null;
    const opponent = fixture ? (home ? fixture.away : fixture.home) : null;
    const reasons: ForecastReason[] = [];
    const chance = playChance(p, ctx, fixture, reasons);
    const {rating, points, subPoints} = expectedPoints(p, fixture, home, rules, reasons);
    const plays = Math.round((chance.start + chance.sub) * 1000) / 1000;
    const starts = Math.round(chance.start * 1000) / 1000;
    return {player: p, fixture, home, opponent, plays, starts, rating: Math.round(rating * 100) / 100, points, subPoints, value: Math.round((chance.start * points + chance.sub * subPoints) * 100) / 100, reasons};
}

/** The defence modifier expected from a keeper and defenders' votes, paid in proportion to how surely they play. */
function defenceBonusOf(keeper: PlayerForecast | undefined, defenders: PlayerForecast[], bonus: DefenceBonus): number {
    if (!keeper || defenders.length < bonus.minDefenders) return 0;
    const line = [keeper, ...defenders.slice(0, 3)];
    const avg = line.reduce((s, f) => s + f.rating, 0) / line.length;
    let points = 0;
    DEFENCE_THRESHOLDS.forEach((from, i) => {
        if (avg >= from) points = bonus.points[i] ?? points;
    });
    const onPitch = [keeper, ...defenders.slice(0, bonus.minDefenders)].reduce((s, f) => s + f.plays, 0) / (1 + bonus.minDefenders);
    return points * onPitch;
}

/**
 * The lineup advice for a roster: every formation valued with its
 * automatic substitutions (when a starter misses, the first of the bench
 * in his role plays), the best chosen, the whole bench ordered. Pinned
 * players start first in their role; a formation with no room for them
 * is out of the running (all of them out: the pins are more than any
 * formation holds, and the best formation is chosen as if they were
 * ordinary).
 */
export function recommendLineup(forecasts: PlayerForecast[], options: MatchdayOptions): LineupAdvice {
    const bonus = options.defenceModifier === true ? DEFAULT_DEFENCE_BONUS : options.defenceModifier || null;
    const pinned = options.pinned ?? new Set<number>();
    const isPinned = (f: PlayerForecast) => (pinned.has(f.player.id) ? 1 : 0);
    const byRole = {} as Record<FantaRole, PlayerForecast[]>;
    for (const role of ROLES) byRole[role] = forecasts.filter((f) => f.player.role === role).sort((a, b) => isPinned(b) - isPinned(a) || b.value - a.value || b.plays - a.plays);
    const pins = {} as Record<FantaRole, number>;
    for (const role of ROLES) pins[role] = byRole[role].filter(isPinned).length;
    /**
     * The n of a role to field, against the cover of the first substitute:
     * a starter who misses is replaced, so what he is worth is his points
     * when he plays and the substitute's when he does not. Two passes,
     * since the substitute depends on who is fielded.
     */
    const pick = (role: FantaRole, n: number): {fielded: PlayerForecast[]; rest: PlayerForecast[]; cover: number; slot: (f: PlayerForecast) => number} => {
        let order = byRole[role];
        let cover = order[n]?.value ?? 0;
        const slotWith = (c: number) => (f: PlayerForecast) => f.value + (1 - f.plays) * c;
        for (let pass = 0; pass < 2; pass += 1) {
            const slot = slotWith(cover);
            order = [...order].sort((a, b) => isPinned(b) - isPinned(a) || slot(b) - slot(a) || b.value - a.value);
            cover = order.slice(n).reduce((best, f) => Math.max(best, f.value), 0);
        }
        return {fielded: order.slice(0, n), rest: order.slice(n).sort((a, b) => b.value - a.value || b.plays - a.plays), cover, slot: slotWith(cover)};
    };
    const valued = FORMATIONS.map((f) => {
        const feasible = ROLES.every((role) => f.need[role] >= pins[role]);
        let total = 0;
        for (const role of ROLES) {
            const {fielded, cover} = pick(role, f.need[role]);
            const allPlay = fielded.reduce((prod, x) => prod * x.plays, 1);
            total += fielded.reduce((s, x) => s + x.value, 0) + (fielded.length > 0 ? (1 - allPlay) * cover : 0);
        }
        if (bonus && f.need.D >= bonus.minDefenders) total += defenceBonusOf(pick('P', 1).fielded[0], pick('D', f.need.D).fielded, bonus);
        return {key: f.key, total: Math.round(total * 10) / 10, feasible};
    }).sort((a, b) => Number(b.feasible) - Number(a.feasible) || b.total - a.total);
    const best = valued[0];
    const fits = (v: FormationTotal | undefined) => (v && (v.feasible || !best.feasible) ? v : undefined);
    const forced = fits(options.force ? valued.find((v) => v.key === options.force) : undefined);
    const preferred = fits(options.prefer ? valued.find((v) => v.key === options.prefer && v.total >= best.total * 0.98) : undefined);
    const chosen = forced ?? preferred ?? best;
    const shape = FORMATIONS.find((f) => f.key === chosen.key)!;
    const starters: PlayerForecast[] = [];
    const bench: PlayerForecast[] = [];
    const slots = new Map<number, number>();
    for (const role of ROLES) {
        const {fielded, rest, slot} = pick(role, shape.need[role]);
        starters.push(...fielded);
        bench.push(...rest);
        for (const f of fielded) slots.set(f.player.id, Math.round(slot(f) * 100) / 100);
        // On the bench, the slot is what he brings when called: the next of the role covers him.
        rest.forEach((f, i) => slots.set(f.player.id, Math.round((f.value + (1 - f.plays) * (rest[i + 1]?.value ?? 0)) * 100) / 100));
    }
    return {formation: chosen.key, starters, bench, slots, total: chosen.total, formations: [chosen, ...valued.filter((v) => v !== chosen)]};
}
