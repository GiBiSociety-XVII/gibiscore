import {describe, expect, it} from 'vitest';
import type {SeasonStudy, SplitRow, TeamStudy} from './data/study';
import {predictMatch} from './prediction';

const team = (id: number, name: string): TeamStudy['team'] => ({id, name, slug: name.toLowerCase(), shortCode: null, logoUrl: null});

function profile(id: number, name: string, played: number, gf: number, ga: number, form: TeamStudy['form'] = []): TeamStudy {
    const won = Math.round(played * 0.4);
    return {team: team(id, name), played, won, drawn: Math.round(played * 0.3), lost: played - won - Math.round(played * 0.3), points: 0, goalsFor: gf, goalsAgainst: ga, xgFor: null, xgAgainst: null, possession: null, shots: null, shotsOnTarget: null, corners: null, withStats: 0, over25Pct: 50, bttsPct: 50, cleanSheets: 0, failedToScore: 0, form};
}

const split = (id: number, name: string, played: number, gf: number, ga: number): SplitRow => ({team: team(id, name), played, won: 0, drawn: 0, lost: 0, goalsFor: gf, goalsAgainst: ga, points: 0});

const study: SeasonStudy = {
    seasonId: 1,
    played: 100,
    goalsPerMatch: 2.8,
    homeWinPct: 45,
    drawPct: 25,
    awayWinPct: 30,
    over25Pct: 55,
    bttsPct: 50,
    avgXg: null,
    teams: [profile(1, 'Strong', 10, 25, 6, ['W', 'W', 'W', 'D', 'W']), profile(2, 'Weak', 10, 7, 22, ['L', 'L', 'D', 'L', 'L']), profile(3, 'Mid', 10, 14, 14)],
    home: [split(1, 'Strong', 5, 14, 2), split(2, 'Weak', 5, 4, 10), split(3, 'Mid', 5, 8, 6)],
    away: [split(1, 'Strong', 5, 11, 4), split(2, 'Weak', 5, 3, 12), split(3, 'Mid', 5, 6, 8)],
};

describe('predictMatch', () => {
    it('returns null without a study or with unknown teams', () => {
        expect(predictMatch(null, 1, 2)).toBeNull();
        expect(predictMatch(study, 1, 99)).toBeNull();
        expect(predictMatch({...study, played: 4}, 1, 2)).toBeNull();
    });

    it('favours the stronger side and sums to 100', () => {
        const p = predictMatch(study, 1, 2)!;
        expect(p.home + p.draw + p.away).toBe(100);
        expect(p.home).toBeGreaterThan(60);
        expect(p.pick).toBe('1');
        expect(p.lambda.home).toBeGreaterThan(p.lambda.away);
        expect(p.over25).toBeGreaterThan(p.over35);
        expect(p.over15).toBeGreaterThan(p.over25);
        expect(p.scores[0].pct).toBeGreaterThan(0);
        expect(p.scores).toHaveLength(5);
        expect(p.confidence).toBe('medium');
        expect(p.factors.map((f) => f.key)).toEqual(expect.arrayContaining(['attack', 'defence', 'form', 'homeAdvantage']));
    });

    it('is roughly even between two average sides, with home advantage', () => {
        const p = predictMatch(study, 3, 3)!;
        expect(p.home).toBeGreaterThan(p.away);
        expect(Math.abs(p.lambda.home + p.lambda.away - study.goalsPerMatch)).toBeLessThan(0.5);
    });

    it('flags small samples', () => {
        const small: SeasonStudy = {...study, teams: [profile(1, 'A', 2, 5, 0), profile(2, 'B', 2, 0, 5)], home: [], away: []};
        const p = predictMatch(small, 1, 2)!;
        expect(p.confidence).toBe('low');
        expect(p.factors.some((f) => f.key === 'sample')).toBe(true);
        // Shrinkage: two matches cannot make a side overwhelming.
        expect(p.home).toBeLessThan(75);
    });
});
