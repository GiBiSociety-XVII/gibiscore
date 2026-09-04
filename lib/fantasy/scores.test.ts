import {describe, expect, it} from 'vitest';
import {scorePlayer, seasonWeights, suggestPrices, type SeasonLine} from './scores';

const line = (year: number, over: Partial<SeasonLine> = {}): SeasonLine => ({
    year, leagueId: 1, leagueName: 'Serie A', teamId: 1, teamName: 'Inter', games: 38, level: 1,
    appearances: 34, lineups: 32, bench: 3, minutes: 2900, rating: 7.0, goals: 20, assists: 6, penaltiesScored: 4, penaltiesMissed: 0, yellow: 3, yellowRed: 0, red: 0, goalsConceded: 0, saves: 0,
    ...over,
});

describe('seasonWeights', () => {
    it('weights the current season by how far it has gone', () => {
        const w = seasonWeights([line(2026, {games: 2}), line(2025), line(2024)], 2026);
        const cur = 0.5 * (2 / 15) ** 1.5;
        expect(w.get(2026)!).toBeCloseTo(cur / (cur + 0.5), 5);
        expect(w.get(2025)!).toBeCloseTo(0.35 / (cur + 0.5), 5);
        expect(seasonWeights([line(2026, {games: 20}), line(2025)], 2026).get(2026)!).toBeCloseTo(0.5 / 0.85, 5);
        expect([...w.values()].reduce((s, v) => s + v, 0)).toBeCloseTo(1, 5);
    });

    it('ignores seasons outside the window', () => {
        const w = seasonWeights([line(2022), line(2025)], 2026);
        expect(w.has(2022)).toBe(false);
        expect(w.get(2025)).toBe(1);
    });
});

describe('scorePlayer', () => {
    it('marks an elite striker high everywhere', () => {
        const s = scorePlayer({role: 'A', age: 27, currentYear: 2026, seasons: [line(2026, {games: 3, appearances: 3, lineups: 3, minutes: 270, goals: 2, assists: 1, bench: 0}), line(2025), line(2024)], injury: null, teamAttack: 0.85, teamDefence: 0.6});
        expect(s.starter).toBeGreaterThan(80);
        expect(s.bonus).toBeGreaterThan(70);
        expect(s.rating).toBeGreaterThan(70);
        expect(s.overall).toBeGreaterThan(75);
        expect(s.fantaAvg).toBeGreaterThan(8);
        expect(s.confidence).toBe('high');
    });

    it('marks a benched defender low on starter and bonus', () => {
        const s = scorePlayer({role: 'D', age: 24, currentYear: 2026, seasons: [line(2025, {appearances: 8, lineups: 3, bench: 25, minutes: 400, goals: 0, assists: 0, rating: 6.1})], injury: null, teamAttack: null, teamDefence: null});
        expect(s.starter).toBeLessThan(25);
        expect(s.bonus).toBeLessThan(10);
        expect(s.fitness).toBeGreaterThan(80);
        expect(s.team).toBe(50);
        expect(s.overall).toBeLessThan(40);
    });

    it('cuts fitness for a long injury and age', () => {
        const fit = scorePlayer({role: 'C', age: 26, currentYear: 2026, seasons: [line(2025)], injury: null, teamAttack: null, teamDefence: null});
        const hurt = scorePlayer({role: 'C', age: 26, currentYear: 2026, seasons: [line(2025)], injury: {active: true, daysOut: 40, longTerm: true}, teamAttack: null, teamDefence: null});
        const old = scorePlayer({role: 'C', age: 36, currentYear: 2026, seasons: [line(2025)], injury: null, teamAttack: null, teamDefence: null});
        expect(hurt.fitness).toBeLessThanOrEqual(20);
        expect(old.fitness).toBeLessThan(fit.fitness);
    });

    it('scores keepers on goals conceded, not bonus', () => {
        const s = scorePlayer({role: 'P', age: 30, currentYear: 2026, seasons: [line(2025, {goals: 0, assists: 0, goalsConceded: 28, saves: 90, rating: 6.6})], injury: null, teamAttack: 0.5, teamDefence: 0.8});
        expect(s.discipline).toBeGreaterThan(70);
        expect(s.bonus).toBeLessThan(5);
        expect(s.fantaAvg).toBeLessThan(6.6);
    });

    it('handles a player without any season', () => {
        const s = scorePlayer({role: 'A', age: 19, currentYear: 2026, seasons: [], injury: null, teamAttack: null, teamDefence: null});
        expect(s.overall).toBe(1);
        expect(s.fantaAvg).toBeNull();
        expect(s.confidence).toBe('low');
    });

    it('is cautious with thin evidence', () => {
        const s = scorePlayer({role: 'A', age: 22, currentYear: 2026, seasons: [line(2026, {games: 2, appearances: 2, lineups: 2, minutes: 180, goals: 3, assists: 0, bench: 0})], injury: null, teamAttack: null, teamDefence: null});
        expect(s.confidence).toBe('low');
        expect(s.overall).toBeLessThan(60);
    });
});

describe('suggestPrices', () => {
    it('spends the role budget on the players that will be bought', () => {
        const players = Array.from({length: 40}, (_, i) => ({id: i + 1, role: 'A' as const, scores: {overall: 95 - i * 2}}));
        const prices = suggestPrices(players, {credits: 500, participants: 8, slots: {P: 3, D: 8, C: 8, A: 6}, roleShare: {P: 0.08, D: 0.16, C: 0.28, A: 0.48}});
        const spent = [...prices.values()].reduce((s, v) => s + v, 0);
        expect(prices.get(1)!).toBeGreaterThan(prices.get(20)!);
        expect(prices.get(1)!).toBeGreaterThanOrEqual(120);
        expect(prices.get(1)!).toBeLessThanOrEqual(300);
        expect(prices.get(8)!).toBeLessThan(prices.get(1)! * 0.6);
        expect(prices.get(40)!).toBeLessThanOrEqual(5);
        expect(Math.abs(spent - 500 * 8 * 0.48)).toBeLessThan(60);
    });

    it('prices attackers above midfielders, defenders and keepers with the same marks', () => {
        const players = (['P', 'D', 'C', 'A'] as const).flatMap((role) => Array.from({length: 60}, (_, i) => ({id: i + 1 + (role === 'P' ? 0 : role === 'D' ? 100 : role === 'C' ? 200 : 300), role, scores: {overall: 90 - i}})));
        const prices = suggestPrices(players, {credits: 500, participants: 8, slots: {P: 3, D: 8, C: 8, A: 6}, roleShare: {P: 0.08, D: 0.16, C: 0.28, A: 0.48}});
        expect(prices.get(301)!).toBeGreaterThan(prices.get(201)!);
        expect(prices.get(201)!).toBeGreaterThan(prices.get(101)!);
        expect(prices.get(101)!).toBeGreaterThan(prices.get(1)! * 0.7);
        // Keepers: a couple matter, the tenth is almost free.
        expect(prices.get(10)!).toBeLessThan(prices.get(1)! * 0.2);
    });
});
