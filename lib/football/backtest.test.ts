import {describe, expect, it} from 'vitest';
import {backtestTiers, fitTuning, logLoss, replaySeason, type ReplaySample} from './backtest';
import {DEFAULT_TUNING, fromLambdas, scoreGrid, tuneLambdas, type PredictionTuning} from './prediction';
import {buildStudy, type StudyRow} from './study';

/** A deterministic generator. */
function rng(seed: number) {
    let s = seed;
    return () => {
        s = (s * 1103515245 + 12345) % 2147483648;
        return s / 2147483648;
    };
}

/** Samples whose scores come from the model itself under a hidden tuning. */
function synthetic(n: number, hidden: PredictionTuning, seed = 3): ReplaySample[] {
    const next = rng(seed);
    const out: ReplaySample[] = [];
    for (let i = 0; i < n; i += 1) {
        const base = {home: 0.8 + next() * 1.6, away: 0.6 + next() * 1.2};
        const lambda = tuneLambdas(base, hidden);
        const grid = scoreGrid(lambda.home, lambda.away, hidden.rho);
        let u = next();
        let hs = 0;
        let as = 0;
        outer: for (let h = 0; h < grid.length; h += 1) for (let a = 0; a < grid[h].length; a += 1) { u -= grid[h][a]; if (u <= 0) { hs = h; as = a; break outer; } }
        out.push({fixtureId: i, seasonId: 1, date: `2026-01-${String((i % 28) + 1).padStart(2, '0')}`, homeScore: hs, awayScore: as, prediction: fromLambdas(base, DEFAULT_TUNING, 10, [])});
    }
    return out;
}

describe('fitTuning', () => {
    it('recovers a hidden tuning from enough scores', () => {
        const hidden: PredictionTuning = {goalScale: 1.12, homeEdge: 1.06, rho: -0.14};
        const samples = synthetic(3000, hidden);
        const fit = fitTuning(samples);
        expect(fit.samples).toBe(3000);
        expect(fit.after).toBeLessThan(fit.before);
        expect(Math.abs(fit.tuning.goalScale - hidden.goalScale)).toBeLessThanOrEqual(0.04);
        expect(Math.abs(fit.tuning.homeEdge - hidden.homeEdge)).toBeLessThanOrEqual(0.04);
        expect(Math.abs(fit.tuning.rho - hidden.rho)).toBeLessThanOrEqual(0.06);
    }, 20000);
    it('keeps the untuned model on a thin archive', () => {
        const fit = fitTuning(synthetic(50, {goalScale: 1.2, homeEdge: 1.1, rho: 0}));
        expect(fit.tuning).toEqual(DEFAULT_TUNING);
        expect(fit.after).toBe(fit.before);
    });
    it('scores the truth better than a wrong tuning', () => {
        const hidden: PredictionTuning = {goalScale: 1, homeEdge: 1, rho: -0.08};
        const samples = synthetic(2000, hidden, 9);
        expect(logLoss(samples, hidden)).toBeLessThan(logLoss(samples, {goalScale: 1.3, homeEdge: 0.9, rho: 0.05}));
    });
});

describe('backtestTiers', () => {
    it('settles the slips of every tier and keeps the promised chance honest on scores drawn from the model', () => {
        const samples = synthetic(3000, DEFAULT_TUNING, 5);
        const record = backtestTiers(samples, DEFAULT_TUNING);
        for (const tier of ['safe', 'balanced', 'bold'] as const) {
            expect(record[tier].slips).toBeGreaterThan(100);
            expect(record[tier].hits).toBeLessThanOrEqual(record[tier].slips);
            // Scores drawn from the model itself: the hit rate lands near the chance promised.
            expect(Math.abs(record[tier].hitRate - record[tier].promised)).toBeLessThanOrEqual(6);
        }
        expect(record.safe.hitRate).toBeGreaterThan(record.bold.hitRate);
    });
});

describe('replaySeason', () => {
    const team = (id: number) => ({id, name: `T${id}`, short_code: null, logo_url: null, slug: `t${id}`});
    const rows: StudyRow[] = [];
    let id = 0;
    // Six teams, three rounds a week for twelve weeks: the study grows a day at a time.
    for (let week = 0; week < 12; week += 1) {
        for (const [h, a] of [[1, 2], [3, 4], [5, 6]]) {
            id += 1;
            const home = (h + week) % 6 + 1;
            const away = (a + week) % 6 + 1;
            rows.push({id, starting_at: `2026-0${1 + Math.floor(week / 4)}-${String((week % 4) * 7 + 1).padStart(2, '0')}T20:00:00Z`, home_team_id: home, away_team_id: away, home_score: (id * 7) % 4, away_score: (id * 5) % 3, home: team(home), away: team(away), stats: null});
        }
    }
    it('predicts each match from the matches before its day only, once the study has ten of them', () => {
        const samples = replaySeason(1, rows, null);
        expect(samples.length).toBe(rows.length - 12);
        expect(samples[0].fixtureId).toBe(13);
        expect(samples.every((s) => s.prediction.base.home > 0)).toBe(true);
    });
    it('starts from the first match with a prior season', () => {
        const priorRows = rows.map((r) => ({...r, id: r.id + 1000, starting_at: r.starting_at.replace('2026', '2025')}));
        const prior = buildStudy(0, priorRows);
        const samples = replaySeason(1, rows, prior);
        expect(samples.length).toBe(rows.length);
    });
});
