import {settleLegs, suggestBets, SUGGESTION_TIERS, type BetSuggestion} from './markets';
import {DEFAULT_TUNING, predictMatch, retune, scoreGrid, tuneLambdas, type MatchPrediction, type PredictionTuning} from './prediction';
import {buildStudy, type SeasonStudy, type StudyRow} from './study';

/**
 * The archive replayed against the model: every finished match of a
 * season predicted from what the study knew the day before it (the
 * matches played until then, last season as the prior), so the
 * prediction is the one the site would have shown. On those replays
 * the tuning (goals scale, home edge, low-score correlation) is fitted
 * to the scores that actually came, and the slips the model would have
 * proposed are settled: how often each tier really wins. Pure.
 *
 * Only the model is tuned. The study, the statistics and every number
 * the pages show as data stay what the matches were.
 */

export interface ReplaySample {
    fixtureId: number;
    seasonId: number;
    date: string;
    homeScore: number;
    awayScore: number;
    /** The untuned prediction, as of the day before the match. */
    prediction: MatchPrediction;
}

/** A season replayed: each match predicted from the matches before it, with the prior season's study. Chronological. */
export function replaySeason(seasonId: number, rows: StudyRow[], prior: SeasonStudy | null): ReplaySample[] {
    const played = rows.filter((r) => r.home_score !== null && r.away_score !== null && r.home && r.away).sort((a, b) => a.starting_at.localeCompare(b.starting_at) || a.id - b.id);
    const out: ReplaySample[] = [];
    for (let i = 0; i < played.length; i += 1) {
        const r = played[i];
        // Matches of the same day are not known yet: the study stops at the day before.
        const day = r.starting_at.slice(0, 10);
        let before = i;
        while (before > 0 && played[before - 1].starting_at.slice(0, 10) === day) before -= 1;
        const study = before > 0 ? buildStudy(seasonId, played.slice(0, before)) : null;
        const prediction = predictMatch(study, r.home_team_id, r.away_team_id, prior, DEFAULT_TUNING);
        if (!prediction) continue;
        out.push({fixtureId: r.id, seasonId, date: r.starting_at, homeScore: r.home_score!, awayScore: r.away_score!, prediction});
    }
    return out;
}

const MAX_GOALS = 8;

/** Mean negative log-likelihood of the scores that came, under the tuning: lower is better. */
export function logLoss(samples: ReplaySample[], tuning: PredictionTuning): number {
    if (samples.length === 0) return 0;
    let sum = 0;
    for (const s of samples) {
        const lambda = tuneLambdas(s.prediction.base, tuning);
        const grid = scoreGrid(lambda.home, lambda.away, tuning.rho);
        const p = grid[Math.min(MAX_GOALS, s.homeScore)][Math.min(MAX_GOALS, s.awayScore)];
        sum -= Math.log(Math.max(1e-9, p));
    }
    return sum / samples.length;
}

/** The ranges the fit searches, one knob at a time; a twentieth first, then hundredths around the best. */
const RANGES: Record<keyof PredictionTuning, [number, number]> = {goalScale: [0.8, 1.2], homeEdge: [0.85, 1.15], rho: [-0.2, 0.05]};
/** Samples below this: the archive says too little, the untuned model stays. */
export const FIT_MIN_SAMPLES = 300;

export interface TuningFit {
    tuning: PredictionTuning;
    samples: number;
    /** Log-loss of the untuned and of the tuned model. */
    before: number;
    after: number;
}

/**
 * The tuning that best explains the scores of the replays: coordinate
 * descent, each knob scanned over its range with the others fixed,
 * three passes. With too few samples the untuned model is returned.
 */
export function fitTuning(samples: ReplaySample[]): TuningFit {
    const before = logLoss(samples, DEFAULT_TUNING);
    if (samples.length < FIT_MIN_SAMPLES) return {tuning: DEFAULT_TUNING, samples: samples.length, before, after: before};
    let best: PredictionTuning = {...DEFAULT_TUNING};
    let bestLoss = before;
    // Coarse over the whole range first, then fine around the best.
    for (const [pass, step] of [[0, 0.05], [1, 0.01], [2, 0.01]] as const) {
        for (const key of Object.keys(RANGES) as Array<keyof PredictionTuning>) {
            const [lo, hi] = RANGES[key];
            const from = pass === 0 ? lo : Math.max(lo, best[key] - 0.05);
            const to = pass === 0 ? hi : Math.min(hi, best[key] + 0.05);
            for (let v = from; v <= to + 1e-9; v += step) {
                const candidate = {...best, [key]: Math.round(v * 100) / 100};
                const loss = logLoss(samples, candidate);
                if (loss < bestLoss - 1e-9) {
                    bestLoss = loss;
                    best = candidate;
                }
            }
        }
    }
    return {tuning: best, samples: samples.length, before, after: bestLoss};
}

export interface TierRecord {
    slips: number;
    hits: number;
    /** Average chance the slips promised, percent. */
    promised: number;
    /** Share of slips that won, percent. */
    hitRate: number;
}

/** The slips the model would have proposed on every replay, settled: how each tier of risk really did. */
export function backtestTiers(samples: ReplaySample[], tuning: PredictionTuning): Record<BetSuggestion['tier'], TierRecord> {
    const acc: Record<BetSuggestion['tier'], {slips: number; hits: number; pct: number}> = {safe: {slips: 0, hits: 0, pct: 0}, balanced: {slips: 0, hits: 0, pct: 0}, bold: {slips: 0, hits: 0, pct: 0}};
    for (const s of samples) {
        const prediction = retune(s.prediction, tuning);
        for (const slip of suggestBets(prediction, null)) {
            const a = acc[slip.tier];
            a.slips += 1;
            a.pct += slip.pct;
            if (settleLegs(slip.legs.map((l) => l.key), s.homeScore, s.awayScore)) a.hits += 1;
        }
    }
    const out = {} as Record<BetSuggestion['tier'], TierRecord>;
    for (const {tier} of SUGGESTION_TIERS) {
        const a = acc[tier];
        out[tier] = {slips: a.slips, hits: a.hits, promised: a.slips > 0 ? Math.round(a.pct / a.slips) : 0, hitRate: a.slips > 0 ? Math.round((a.hits / a.slips) * 100) : 0};
    }
    return out;
}
