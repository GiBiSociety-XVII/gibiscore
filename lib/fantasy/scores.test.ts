import {describe, expect, it} from 'vitest';
import {bonusFactor, clubRatio, fantaAvgFor, scorePlayer, seasonWeights, suggestPrices, type SeasonLine} from './scores';

const line = (year: number, over: Partial<SeasonLine> = {}): SeasonLine => ({
    year, leagueId: 1, leagueName: 'Serie A', teamId: 1, teamName: 'Inter', games: 38, level: 1,
    appearances: 34, lineups: 32, bench: 3, minutes: 2900, rating: 7.0, goals: 20, assists: 6, penaltiesScored: 4, penaltiesMissed: 0, penaltiesSaved: 0, yellow: 3, yellowRed: 0, red: 0, goalsConceded: 0, saves: 0,
    ...over,
});

describe('seasonWeights', () => {
    it('September: last season first, the current one a little, the one before last third', () => {
        const w = seasonWeights([line(2026, {games: 3}), line(2025), line(2024)], 2026);
        expect(w.get(2025)!).toBeGreaterThan(w.get(2026)!);
        expect(w.get(2026)!).toBeGreaterThan(w.get(2024)!);
        expect(w.get(2025)!).toBeCloseTo(0.61, 1);
        expect(w.get(2026)!).toBeCloseTo(0.25, 1);
        expect([...w.values()].reduce((s, v) => s + v, 0)).toBeCloseTo(1, 5);
    });

    it('January: the current season is the biggest weight by a clear margin', () => {
        const jan = seasonWeights([line(2026, {games: 19}), line(2025), line(2024)], 2026);
        expect(jan.get(2026)!).toBeGreaterThan(jan.get(2025)! * 1.5);
        expect(jan.get(2026)!).toBeCloseTo(0.56, 1);
        expect(jan.get(2024)!).toBeLessThan(0.15);
    });

    it('before the first round the current season weighs nothing', () => {
        const w = seasonWeights([line(2026, {games: 0}), line(2025), line(2024)], 2026);
        expect(w.has(2026)).toBe(false);
        expect(w.get(2025)!).toBeCloseTo(0.55 / 0.67, 5);
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
        // In the squad 28 times of 38: three starts and 25 benches.
        expect(s.fitness).toBeGreaterThan(70);
        expect(s.team).toBe(50);
        expect(s.overall).toBeLessThan(45);
    });

    it('cuts fitness for a long injury and age', () => {
        const fit = scorePlayer({role: 'C', age: 26, currentYear: 2026, seasons: [line(2025)], injury: null, teamAttack: null, teamDefence: null});
        const hurt = scorePlayer({role: 'C', age: 26, currentYear: 2026, seasons: [line(2025)], injury: {active: true, daysOut: 40, longTerm: true}, teamAttack: null, teamDefence: null});
        const old = scorePlayer({role: 'C', age: 36, currentYear: 2026, seasons: [line(2025)], injury: null, teamAttack: null, teamDefence: null});
        expect(hurt.fitness).toBeLessThanOrEqual(20);
        expect(old.fitness).toBeLessThan(fit.fitness);
    });

    it('scores keepers on clean sheets, penalties saved and goals conceded, not on goals', () => {
        const s = scorePlayer({role: 'P', age: 30, currentYear: 2026, seasons: [line(2025, {goals: 0, assists: 0, goalsConceded: 28, saves: 90, rating: 6.6})], injury: null, teamAttack: 0.5, teamDefence: 0.8});
        expect(s.discipline).toBeGreaterThan(70);
        // 28 conceded in 2900 minutes: a clean sheet two matches in five.
        expect(s.bonus).toBeGreaterThan(70);
        expect(s.fantaAvg).toBeLessThan(6.6);
        const sieve = scorePlayer({role: 'P', age: 30, currentYear: 2026, seasons: [line(2025, {goals: 0, assists: 0, goalsConceded: 62, saves: 120, rating: 6.6})], injury: null, teamAttack: 0.5, teamDefence: 0.3});
        expect(sieve.bonus).toBeLessThan(30);
        expect(sieve.fantaAvg!).toBeLessThan(s.fantaAvg!);
        const saver = scorePlayer({role: 'P', age: 30, currentYear: 2026, seasons: [line(2025, {goals: 0, assists: 0, goalsConceded: 28, saves: 90, rating: 6.6, penaltiesSaved: 3})], injury: null, teamAttack: 0.5, teamDefence: 0.8});
        expect(saver.bonus).toBeGreaterThan(s.bonus);
        expect(saver.fantaAvg!).toBeGreaterThan(s.fantaAvg!);
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

describe('scorePlayer with a transfer', () => {
    it('judges a January signing on his current club, not on the bench at the old one', () => {
        // Half a season on the bench elsewhere, then a starter at the current club.
        const seasons = [
            line(2025, {teamId: 9, teamName: 'Old', appearances: 20, lineups: 4, bench: 16, minutes: 500, goals: 3, assists: 1, rating: 6.6}),
            line(2025, {teamId: 1, appearances: 18, lineups: 18, bench: 0, minutes: 1500, goals: 14, assists: 2, rating: 7.2}),
        ];
        const here = scorePlayer({role: 'A', age: 26, currentYear: 2026, currentTeamId: 1, seasons, injury: null, teamAttack: null, teamDefence: null});
        const nowhere = scorePlayer({role: 'A', age: 26, currentYear: 2026, currentTeamId: 99, seasons, injury: null, teamAttack: null, teamDefence: null});
        // Away from both clubs he is a new signing of quality, expected to play: the two come out close.
        expect(here.starter).toBeGreaterThanOrEqual(nowhere.starter - 3);
        expect(here.starter).toBeGreaterThanOrEqual(50);
        expect(here.bonus).toBeGreaterThan(80);
        expect(here.fitness).toBeGreaterThan(90);
        expect(here.overall).toBeGreaterThan(68);
    });

    it('discounts ratings and bonus earned in a weaker league', () => {
        const top = scorePlayer({role: 'A', age: 26, currentYear: 2026, seasons: [line(2025)], injury: null, teamAttack: null, teamDefence: null});
        const lower = scorePlayer({role: 'A', age: 26, currentYear: 2026, seasons: [line(2025, {level: 0.7})], injury: null, teamAttack: null, teamDefence: null});
        expect(lower.rating).toBeLessThan(top.rating);
        expect(lower.bonus).toBeLessThan(top.bonus);
        expect(lower.overall).toBeLessThan(top.overall - 5);
    });
});

describe('translation to this league and club', () => {
    it('a Serie B season is worth about half its goals here, and the price follows', () => {
        const serieB = line(2025, {level: 0.7, teamId: 5, teamName: 'Promoted', goals: 15, assists: 3, rating: 7.3});
        const serieA = line(2025, {goals: 15, assists: 3, rating: 7.3});
        const fromB = scorePlayer({role: 'A', age: 24, currentYear: 2026, currentTeamId: 5, seasons: [serieB], injury: null, teamAttack: null, teamDefence: null, clubStrength: 0.3});
        const fromA = scorePlayer({role: 'A', age: 24, currentYear: 2026, currentTeamId: 1, seasons: [serieA], injury: null, teamAttack: null, teamDefence: null, clubStrength: 0.8});
        expect(fromB.fantaAvg!).toBeLessThan(fromA.fantaAvg! - 0.7);
        expect(fromB.bonus).toBeLessThan(fromA.bonus - 15);
        expect(fromB.rating).toBeLessThan(fromA.rating);
    });

    it('a striker moving from the bottom to the top of the table is expected to score more, and the other way round', () => {
        const atBottom = line(2025, {teamId: 5, teamName: 'Small', clubStrength: 0.15, goals: 10, assists: 2, rating: 6.9});
        const up = scorePlayer({role: 'A', age: 26, currentYear: 2026, currentTeamId: 1, seasons: [atBottom], injury: null, teamAttack: null, teamDefence: null, clubStrength: 0.9});
        const same = scorePlayer({role: 'A', age: 26, currentYear: 2026, currentTeamId: 1, seasons: [atBottom], injury: null, teamAttack: null, teamDefence: null, clubStrength: 0.15});
        const stayed = scorePlayer({role: 'A', age: 26, currentYear: 2026, currentTeamId: 5, seasons: [atBottom], injury: null, teamAttack: null, teamDefence: null, clubStrength: 0.15});
        expect(up.fantaAvg!).toBeGreaterThan(same.fantaAvg! + 0.3);
        // At his own club his numbers are his: no translation.
        expect(stayed.bonus).toBe(same.bonus);
        expect(clubRatio(0.9, 0.15, 1)).toBe(1.5);
        expect(clubRatio(0.7, 0.4, 1)).toBeCloseTo(1.12 / 0.94, 2);
        expect(clubRatio(0.9, null, 1)).toBeLessThanOrEqual(1.15);
        expect(clubRatio(null, 0.15, 1)).toBe(1);
        expect(bonusFactor(0.7)).toBeCloseTo(0.565, 2);
    });

    it('an appearance from the bench is not counted twice among the matches in the squad', () => {
        // Starts 26 of 38, on the bench 11 times (nine as a substitute): in the squad 37 times.
        const s = scorePlayer({role: 'C', age: 28, currentYear: 2026, currentTeamId: 1, seasons: [line(2025, {appearances: 35, lineups: 26, bench: 11, minutes: 2131, goals: 10, assists: 1})], injury: null, teamAttack: null, teamDefence: null});
        expect(s.starter).toBeGreaterThan(60);
        expect(s.fitness).toBeGreaterThan(95);
    });
});

describe('this season at the club', () => {
    it('a keeper on the bench since the season started is the backup, whatever he was elsewhere', () => {
        const abroad = line(2025, {level: 1, teamId: 9, teamName: 'Abroad', appearances: 36, lineups: 36, bench: 0, minutes: 3240, goals: 0, assists: 0, rating: 7.2, goalsConceded: 40});
        const base = {role: 'P' as const, age: 26, currentYear: 2026, currentTeamId: 1, seasons: [abroad], injury: null, teamAttack: null, teamDefence: null};
        const unknown = scorePlayer(base);
        const benched = scorePlayer({...base, thisSeason: {starts: 0, benches: 2}});
        const starting = scorePlayer({...base, thisSeason: {starts: 3, benches: 0}});
        expect(unknown.starter).toBeGreaterThan(70);
        expect(benched.starter).toBeLessThan(15);
        expect(starting.starter).toBeGreaterThan(95);
        // Not named yet (injured, just arrived): nothing to learn.
        expect(scorePlayer({...base, thisSeason: {starts: 0, benches: 0}}).starter).toBe(unknown.starter);
    });

    it('an outfield player takes longer to settle: two benches are half a signal', () => {
        const base = {role: 'A' as const, age: 26, currentYear: 2026, currentTeamId: 1, seasons: [line(2025)], injury: null, teamAttack: null, teamDefence: null};
        const before = scorePlayer(base).starter;
        const two = scorePlayer({...base, thisSeason: {starts: 0, benches: 2}}).starter;
        const six = scorePlayer({...base, thisSeason: {starts: 0, benches: 6}}).starter;
        expect(two).toBeLessThan(before);
        expect(two).toBeGreaterThan(before * 0.6);
        expect(six).toBeLessThan(before * 0.15);
    });
});

describe('little playing time', () => {
    it('a goal in the minutes of a substitute is not a goal a match: bonus, malus and rating are diluted', () => {
        const base = {age: 22, currentYear: 2026, injury: null, teamAttack: null, teamDefence: null};
        const sub = scorePlayer({...base, role: 'A', seasons: [line(2025, {appearances: 8, lineups: 0, bench: 20, minutes: 60, goals: 1, assists: 0, rating: 7.2, yellow: 0})]});
        const regular = scorePlayer({...base, role: 'A', seasons: [line(2025, {appearances: 30, lineups: 28, bench: 2, minutes: 2400, goals: 12, assists: 4, rating: 6.9, yellow: 3})]});
        expect(sub.bonus).toBeLessThan(regular.bonus);
        expect(sub.bonus).toBeLessThan(50);
        expect(sub.rating).toBeLessThan(regular.rating);
        expect(sub.fantaAvg!).toBeLessThan(regular.fantaAvg!);
        // Nothing happened in the minutes he did not play: the malus mark stays high, not perfect.
        expect(sub.discipline).toBeGreaterThanOrEqual(regular.discipline);
    });

    it('a keeper with one clean sheet in ninety minutes is not a wall', () => {
        const base = {age: 30, currentYear: 2026, currentTeamId: 1, injury: null, teamAttack: null, teamDefence: null, clubConcededPer90: 1.5};
        const one = scorePlayer({...base, role: 'P', seasons: [line(2025, {appearances: 1, lineups: 1, bench: 30, minutes: 90, goals: 0, assists: 0, rating: 6.5, goalsConceded: 0, saves: 3})]});
        const wall = scorePlayer({...base, role: 'P', seasons: [line(2025, {appearances: 34, lineups: 34, bench: 0, minutes: 3060, goals: 0, assists: 0, rating: 6.5, goalsConceded: 24, saves: 100})]});
        expect(one.bonus).toBeLessThan(wall.bonus);
        expect(one.bonus).toBeLessThan(60);
    });
});

describe('team mark', () => {
    it('reads the club\'s expected place and its shape from the start', () => {
        const base = {role: 'A' as const, age: 27, currentYear: 2026, seasons: [line(2025)], injury: null};
        const top = scorePlayer({...base, teamAttack: null, teamDefence: null, teamRounds: 0, clubStrength: 0.9});
        const bottom = scorePlayer({...base, teamAttack: null, teamDefence: null, teamRounds: 0, clubStrength: 0.1});
        const promoted = scorePlayer({...base, teamAttack: null, teamDefence: null, teamRounds: 0, clubStrength: 0.3});
        const unknown = scorePlayer({...base, teamAttack: null, teamDefence: null, teamRounds: 0});
        expect(top.team).toBe(74);
        expect(bottom.team).toBe(26);
        expect(promoted.team).toBe(38);
        expect(unknown.team).toBe(50);
        // The shape (chances created and allowed) weighs more than the table: a contender creating little reads mid-table.
        const poor = scorePlayer({...base, teamAttack: 0.2, teamDefence: 0.3, teamRounds: 3, clubStrength: 0.9});
        const strong = scorePlayer({...base, teamAttack: 0.8, teamDefence: 0.7, teamRounds: 3, clubStrength: 0.9});
        expect(poor.team).toBeLessThan(50);
        expect(strong.team).toBeGreaterThan(74);
    });
});

describe('form', () => {
    it('is neutral before the season and rewards a strong start', () => {
        const base = [line(2025)];
        const none = scorePlayer({role: 'A', age: 26, currentYear: 2026, seasons: base, injury: null, teamAttack: null, teamDefence: null, teamRounds: 0});
        const hot = scorePlayer({role: 'A', age: 26, currentYear: 2026, seasons: [...base, line(2026, {games: 3, appearances: 3, lineups: 3, bench: 0, minutes: 270, goals: 4, assists: 1, rating: 7.6})], injury: null, teamAttack: 0.8, teamDefence: 0.6, teamRounds: 3});
        const cold = scorePlayer({role: 'A', age: 26, currentYear: 2026, seasons: [...base, line(2026, {games: 3, appearances: 1, lineups: 0, bench: 2, minutes: 15, goals: 0, assists: 0, rating: 6.0})], injury: null, teamAttack: 0.3, teamDefence: 0.4, teamRounds: 3});
        expect(none.form).toBe(50);
        expect(hot.form).toBeGreaterThan(60);
        expect(cold.form).toBeLessThan(40);
        expect(hot.overall).toBeGreaterThan(cold.overall);
        // The club's shape counts from the first round: a side creating a lot reads as a strong club.
        expect(hot.team).toBeGreaterThan(60);
    });
});

describe('suggestPrices', () => {
    it('spends the role budget on the players that will be bought', () => {
        const players = Array.from({length: 40}, (_, i) => ({id: i + 1, role: 'A' as const, scores: {overall: 95 - i * 2}}));
        const prices = suggestPrices(players, {credits: 500, participants: 8, slots: {P: 3, D: 8, C: 8, A: 6}, roleShare: {P: 0.08, D: 0.16, C: 0.28, A: 0.48}});
        const spent = [...prices.values()].reduce((s, v) => s + v, 0);
        expect(prices.get(1)!).toBeGreaterThan(prices.get(20)!);
        expect(prices.get(1)!).toBeGreaterThanOrEqual(100);
        expect(prices.get(1)!).toBeLessThanOrEqual(220);
        expect(prices.get(5)!).toBeGreaterThan(prices.get(1)! * 0.55);
        expect(prices.get(12)!).toBeLessThan(prices.get(1)! * 0.65);
        expect(prices.get(24)!).toBeLessThan(prices.get(1)! * 0.4);
        expect(prices.get(40)!).toBeLessThanOrEqual(15);
        expect(Math.abs(spent - 500 * 8 * 0.48)).toBeLessThan(60);
    });

    it('never asks more than the ceiling of a manager\'s credits for one man, and gives the excess to the others', () => {
        // One outlier far above everyone: without a ceiling he would take most of the attack money.
        const players = Array.from({length: 40}, (_, i) => ({id: i + 1, role: 'A' as const, scores: {overall: i === 0 ? 100 : 70 - i, fantaAvg: i === 0 ? 12 : 7 - i / 20, starter: 95, sample: 30}}));
        const prices = suggestPrices(players, {credits: 1000, participants: 12, slots: {P: 3, D: 8, C: 8, A: 6}, roleShare: {P: 0.08, D: 0.18, C: 0.27, A: 0.47}});
        expect(prices.get(1)!).toBe(400);
        expect(prices.get(2)!).toBeGreaterThan(100);
        const spent = [...prices.values()].reduce((s, v) => s + v, 0);
        expect(Math.abs(spent - 1000 * 12 * 0.47)).toBeLessThan(100);
    });

    it('a stronger club is worth more with the same numbers', () => {
        const at = (team: number) => ({id: team, role: 'A' as const, scores: {overall: 75, fantaAvg: 7.5, starter: 90, sample: 30, team}});
        const filler = Array.from({length: 40}, (_, i) => ({id: 100 + i, role: 'A' as const, scores: {overall: 60 - i, fantaAvg: 6.8 - i / 20, starter: 80, sample: 30, team: 50}}));
        const prices = suggestPrices([at(75), at(25), ...filler], {credits: 500, participants: 8, slots: {P: 3, D: 8, C: 8, A: 6}, roleShare: {P: 0.08, D: 0.16, C: 0.28, A: 0.48}});
        expect(prices.get(75)!).toBeGreaterThan(prices.get(25)! * 1.4);
        expect(prices.get(75)!).toBeLessThan(prices.get(25)! * 2.2);
    });

    it('prices attackers above midfielders, defenders and keepers with the same marks', () => {
        const players = (['P', 'D', 'C', 'A'] as const).flatMap((role) => Array.from({length: 60}, (_, i) => ({id: i + 1 + (role === 'P' ? 0 : role === 'D' ? 100 : role === 'C' ? 200 : 300), role, scores: {overall: 90 - i}})));
        const prices = suggestPrices(players, {credits: 500, participants: 8, slots: {P: 3, D: 8, C: 8, A: 6}, roleShare: {P: 0.08, D: 0.16, C: 0.28, A: 0.48}});
        expect(prices.get(301)!).toBeGreaterThan(prices.get(201)!);
        expect(prices.get(201)!).toBeGreaterThan(prices.get(101)!);
        expect(prices.get(101)!).toBeGreaterThan(prices.get(1)! * 0.7);
        // Keepers: every synthetic keeper is a starter here, so only the mark separates them.
        expect(prices.get(10)!).toBeLessThan(prices.get(1)! * 0.75);
    });
});

describe('a player who changed club', () => {
    it('keeper: the goals he let in elsewhere are replaced by what the new club concedes', () => {
        const leaky = scorePlayer({role: 'P', age: 28, currentYear: 2026, currentTeamId: 1, seasons: [line(2025, {goalsConceded: 55, saves: 100, rating: 6.9, teamId: 2})], injury: null, teamAttack: null, teamDefence: null, clubConcededPer90: null});
        const moved = scorePlayer({role: 'P', age: 28, currentYear: 2026, currentTeamId: 1, seasons: [line(2025, {goalsConceded: 55, saves: 100, rating: 6.9, teamId: 2})], injury: null, teamAttack: null, teamDefence: null, clubConcededPer90: 0.9});
        expect(moved.bonus).toBeGreaterThan(leaky.bonus + 20);
        expect(moved.discipline).toBeGreaterThan(leaky.discipline);
        expect(moved.fantaAvg!).toBeGreaterThan(leaky.fantaAvg! + 0.4);
        // At his own club the rate is his: nothing replaced.
        const home = scorePlayer({role: 'P', age: 28, currentYear: 2026, currentTeamId: 2, seasons: [line(2025, {goalsConceded: 55, saves: 100, rating: 6.9, teamId: 2})], injury: null, teamAttack: null, teamDefence: null, clubConcededPer90: 0.9});
        expect(home.bonus).toBe(leaky.bonus);
    });

    it('rotation in a cup weighs half of rotation in the league', () => {
        const base = {role: 'A' as const, age: 27, currentYear: 2026, currentTeamId: 1, injury: null, teamAttack: null, teamDefence: null};
        const leagueBench = scorePlayer({...base, seasons: [line(2025, {appearances: 30, lineups: 20, bench: 10, minutes: 1900, teamId: 2}), line(2025, {appearances: 10, lineups: 3, bench: 7, minutes: 300, teamId: 2, leagueId: 9})]});
        const cupBench = scorePlayer({...base, seasons: [line(2025, {appearances: 30, lineups: 20, bench: 10, minutes: 1900, teamId: 2}), line(2025, {appearances: 10, lineups: 3, bench: 7, minutes: 300, teamId: 2, leagueId: 9, cup: true})]});
        expect(cupBench.starter).toBeGreaterThan(leagueBench.starter);
    });

    it('a new signing of quality is expected to play more than his old rotation says, until the club shows otherwise', () => {
        const base = {role: 'A' as const, age: 26, currentYear: 2026, injury: null, teamAttack: null, teamDefence: null};
        const rotated = [line(2025, {appearances: 30, lineups: 15, bench: 15, minutes: 1500, goals: 12, assists: 4, rating: 7.1, teamId: 2})];
        const fresh = scorePlayer({...base, currentTeamId: 1, seasons: rotated});
        const stayed = scorePlayer({...base, currentTeamId: 2, seasons: rotated});
        expect(fresh.starter).toBeGreaterThan(stayed.starter + 5);
        // With the club's matches piling up the prior fades: ten in the squad and it is gone.
        const settled = scorePlayer({...base, currentTeamId: 1, seasons: [...rotated, line(2026, {games: 10, appearances: 4, lineups: 2, bench: 6, minutes: 250, teamId: 1})]});
        expect(settled.starter).toBeLessThan(fresh.starter);
    });
});

describe('what the review fixed', () => {
    it("a year without a minute says nothing about bonus and malus", () => {
        const idle = scorePlayer({role: 'P', age: 24, currentYear: 2025, currentTeamId: 1, injury: null, teamAttack: null, teamDefence: null, seasons: [line(2024, {appearances: 0, lineups: 0, bench: 30, minutes: 0, rating: null, goals: 0, assists: 0, goalsConceded: 0, penaltiesScored: 0, yellow: 0})]});
        expect(idle.bonus).toBe(1);
        expect(idle.discipline).toBe(50);
        expect(idle.fantaAvg).toBeNull();
        expect(idle.events).toBeNull();
    });

    it("a keeper's goals conceded are one number, in the bonus, the malus and the fantasy average", () => {
        const keeper = (level: number, teamId: number) => scorePlayer({role: 'P', age: 28, currentYear: 2025, currentTeamId: 1, injury: null, teamAttack: null, teamDefence: null, clubConcededPer90: 1.0, seasons: [line(2024, {level, teamId, goals: 0, assists: 0, penaltiesScored: 0, goalsConceded: 40, rating: 6.4})]});
        // The same keeper: at his club his own goals count, elsewhere the club's rate; the marks move together.
        const own = keeper(1, 1);
        const elsewhere = keeper(1, 2);
        expect(own.events!.conceded).toBeCloseTo(40 / 34, 2);
        expect(elsewhere.events!.conceded).toBeCloseTo(((1.0 * 2900) / 90) / 34, 2);
        expect(own.bonus).toBeLessThan(elsewhere.bonus);
        expect(own.discipline).toBeLessThan(elsewhere.discipline);
        // His own goals in a weaker league would be more here.
        expect(keeper(0.7, 1).events!.conceded).toBeGreaterThan(own.events!.conceded);
    });

    it("the league's rules change the fantasy average", () => {
        const s = scorePlayer({role: 'A', age: 26, currentYear: 2025, currentTeamId: 1, injury: null, teamAttack: null, teamDefence: null, seasons: [line(2024)]});
        expect(s.events).not.toBeNull();
        const classic = fantaAvgFor(s.events!, 'A', {goal: 3, assist: 1, goalConceded: -1, yellow: -0.5, red: -1, penaltyMissed: -3, penaltySaved: 3, cleanSheet: 1});
        expect(classic).toBe(s.fantaAvg);
        const generous = fantaAvgFor(s.events!, 'A', {goal: 4, assist: 2, goalConceded: -1, yellow: -0.5, red: -1, penaltyMissed: -3, penaltySaved: 3, cleanSheet: 1});
        expect(generous).toBeGreaterThan(classic);
    });

    it('a cup run does not make a rotation player available every week', () => {
        const leagueOnly = scorePlayer({role: 'C', age: 26, currentYear: 2025, currentTeamId: 1, injury: null, teamAttack: null, teamDefence: null, seasons: [line(2024, {appearances: 20, lineups: 16, bench: 4, minutes: 1500, goals: 3, assists: 2, penaltiesScored: 0})]});
        const withCup = scorePlayer({role: 'C', age: 26, currentYear: 2025, currentTeamId: 1, injury: null, teamAttack: null, teamDefence: null, seasons: [line(2024, {appearances: 20, lineups: 16, bench: 4, minutes: 1500, goals: 3, assists: 2, penaltiesScored: 0}), line(2024, {leagueId: 9, leagueName: 'Europa League', cup: true, games: 12, appearances: 12, lineups: 10, bench: 2, minutes: 900, goals: 1, assists: 1, penaltiesScored: 0})]});
        expect(withCup.fitness).toBe(leagueOnly.fitness);
    });
});
