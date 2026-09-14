import {describe, expect, it} from 'vitest';
import {bestHindsight, defenceModifierOf, playLineup, roundPoints, surprises, votoOf, withManualVotes, type RoundResults, type RoundStat} from './recap';
import {CLASSIC_RULES} from './scores';
import {DEFAULT_CALIBRATION} from './voto';
import {DEFAULT_DEFENCE_BONUS} from './config';

const stat = (over: Partial<RoundStat> = {}): RoundStat => ({minutes: 90, rating: null, goals: 0, assists: 0, yellow: 0, red: 0, conceded: 0, penaltiesSaved: 0, penaltiesMissed: 0, ownGoals: 0, ...over});
const official = (stats: Record<number, RoundStat>): RoundResults => ({round: 'Regular Season - 3', state: 'played', official: true, finishedTeams: [], matches: [], stats});

describe('votoOf', () => {
    it('takes the known vote when there is one, the rating on the vote scale otherwise', () => {
        expect(votoOf(stat({voto: 6.5, rating: 7.4}), 'C', DEFAULT_CALIBRATION)).toBe(6.5);
        expect(votoOf(stat({voto: null, rating: 7.4}), 'C', DEFAULT_CALIBRATION)).toBeNull();
        const estimated = votoOf(stat({rating: 7.4}), 'C', DEFAULT_CALIBRATION)!;
        expect(estimated).toBeGreaterThan(6.2);
        expect(estimated).toBeLessThan(7);
    });
    it('gives no estimated vote to who barely played or was not rated', () => {
        expect(votoOf(stat({rating: 7, minutes: 4}), 'A', DEFAULT_CALIBRATION)).toBeNull();
        expect(votoOf(stat({rating: null}), 'A', DEFAULT_CALIBRATION)).toBeNull();
        expect(votoOf(undefined, 'A', DEFAULT_CALIBRATION)).toBeNull();
    });
});

describe('withManualVotes', () => {
    it('lays a typed vote over the estimate but never over an official one', () => {
        const results = official({1: stat({rating: 7}), 2: stat({voto: 6, source: 'official'})});
        const manual = {1: {teamId: 5, voto: 7.5, goals: 1, assists: 0, yellow: 1, red: 0, conceded: 0, penaltiesSaved: 0, penaltiesMissed: 0, ownGoals: 0, at: 'now'}, 2: {teamId: 5, voto: 4, goals: 0, assists: 0, yellow: 0, red: 0, conceded: 0, penaltiesSaved: 0, penaltiesMissed: 0, ownGoals: 0, at: 'now'}, 3: {teamId: 5, voto: 6.5, goals: 0, assists: 0, yellow: 0, red: 0, conceded: 0, penaltiesSaved: 0, penaltiesMissed: 0, ownGoals: 0, at: 'now'}};
        const out = withManualVotes(results, manual);
        expect(out.stats[1]).toMatchObject({voto: 7.5, source: 'manual', goals: 1, yellow: 1, rating: 7});
        expect(out.stats[2]).toMatchObject({voto: 6, source: 'official'});
        // Nobody in the provider's squad: the typed vote makes him a player of the round.
        expect(out.stats[3]).toMatchObject({voto: 6.5, minutes: 90});
        expect(withManualVotes(results, undefined)).toBe(results);
    });
});

describe('roundPoints', () => {
    it('pays the events under the rules; keepers their conceded, saves and clean sheet', () => {
        expect(roundPoints(stat({voto: 6.5, goals: 2, assists: 1, yellow: 1}), 'A', CLASSIC_RULES, DEFAULT_CALIBRATION)).toBe(13);
        expect(roundPoints(stat({voto: 6, conceded: 2}), 'P', CLASSIC_RULES, DEFAULT_CALIBRATION)).toBe(4);
        expect(roundPoints(stat({voto: 6.5, conceded: 0, penaltiesSaved: 1}), 'P', CLASSIC_RULES, DEFAULT_CALIBRATION)).toBe(10.5);
        // Outfield players never pay the goals conceded.
        expect(roundPoints(stat({voto: 6, conceded: 3, ownGoals: 1}), 'D', CLASSIC_RULES, DEFAULT_CALIBRATION)).toBe(4);
        expect(roundPoints(stat({voto: null}), 'D', CLASSIC_RULES, DEFAULT_CALIBRATION)).toBeNull();
    });
});

describe('defenceModifierOf', () => {
    it('averages the keeper and the three best defenders, when enough played', () => {
        expect(defenceModifierOf(6.5, [6, 6.5, 7, 5.5], DEFAULT_DEFENCE_BONUS)).toBe(3);
        expect(defenceModifierOf(6.5, [6, 6.5, 7], DEFAULT_DEFENCE_BONUS)).toBe(0);
        expect(defenceModifierOf(6.5, [6, 6.5, 7, 5.5], false)).toBe(0);
        expect(defenceModifierOf(5, [5, 5, 5, 5], DEFAULT_DEFENCE_BONUS)).toBe(0);
    });
});

describe('playLineup', () => {
    const roles = {1: 'P', 2: 'D', 3: 'D', 4: 'D', 5: 'C', 6: 'C', 7: 'C', 8: 'C', 9: 'A', 10: 'A', 11: 'A', 12: 'D', 13: 'C', 14: 'A', 15: 'A'} as const;
    const p = (id: keyof typeof roles) => ({id, role: roles[id]});
    const starters = ([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] as const).map(p);
    const bench = ([12, 13, 14, 15] as const).map(p);

    it('replaces starters without a vote with the first of the bench in the role, up to three', () => {
        const stats: Record<number, RoundStat> = {};
        for (const id of [1, 2, 3, 4, 5, 6, 7, 8, 12, 13, 14, 15]) stats[id] = stat({voto: 6});
        // Three attackers without a vote, two attackers on the bench: one hole stays.
        stats[9] = stat({voto: null});
        stats[10] = stat({voto: null});
        stats[11] = stat({voto: null});
        const played = playLineup(starters, bench, official(stats), CLASSIC_RULES, DEFAULT_CALIBRATION, false);
        expect(played.subs).toBe(2);
        expect(played.holes).toBe(1);
        expect(played.slots.filter((s) => s.replaces !== undefined).map((s) => s.id)).toEqual([14, 15]);
        expect(played.slots.find((s) => s.id === 9)!.replacedBy).toBe(14);
        expect(played.bench.map((s) => s.id)).toEqual([12, 13]);
        // Ten sixes and the keeper's clean sheet.
        expect(played.points).toBe(61);
        expect(played.total).toBe(61);
    });

    it('never uses more than the substitutions allowed', () => {
        const stats: Record<number, RoundStat> = {};
        for (const id of [1, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]) stats[id] = stat({voto: 6});
        for (const id of [2, 3, 4]) stats[id] = stat({voto: null});
        const played = playLineup(starters, bench, official(stats), CLASSIC_RULES, DEFAULT_CALIBRATION, false, 1);
        expect(played.subs).toBe(1);
        expect(played.holes).toBe(2);
    });

    it('adds the defence modifier on the real votes', () => {
        const stats: Record<number, RoundStat> = {};
        for (const id of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]) stats[id] = stat({voto: 6.5});
        stats[12] = stat({voto: 7});
        const four = [...starters, p(12)];
        const played = playLineup(four, [], official(stats), CLASSIC_RULES, DEFAULT_CALIBRATION, DEFAULT_DEFENCE_BONUS);
        expect(played.defence).toBe(3);
        expect(played.total).toBe(played.points + 3);
    });
});

describe('bestHindsight', () => {
    it('picks the formation and the players that scored most', () => {
        const roster = [{id: 1, role: 'P' as const}, ...[2, 3, 4, 5, 6].map((id) => ({id, role: 'D' as const})), ...[7, 8, 9, 10, 11].map((id) => ({id, role: 'C' as const})), ...[12, 13, 14].map((id) => ({id, role: 'A' as const}))];
        const stats: Record<number, RoundStat> = {};
        for (const p of roster) stats[p.id] = stat({voto: 6});
        stats[12] = stat({voto: 7, goals: 2});
        stats[13] = stat({voto: 7, goals: 1});
        stats[14] = stat({voto: 6.5, goals: 1});
        stats[6] = stat({voto: null});
        const best = bestHindsight(roster, official(stats), CLASSIC_RULES, DEFAULT_CALIBRATION, false)!;
        expect(best.formation).toBe('3-4-3');
        expect(best.ids).toContain(12);
        expect(best.ids).not.toContain(6);
        // The keeper's six plus his clean sheet.
        expect(best.total).toBe(7 + 6 * 3 + 6 * 4 + 13 + 10 + 9.5);
    });
    it('is null when no formation can be filled with voted players', () => {
        const roster = [{id: 1, role: 'P' as const}, {id: 2, role: 'D' as const}];
        expect(bestHindsight(roster, official({1: stat({voto: 6}), 2: stat({voto: 6})}), CLASSIC_RULES, DEFAULT_CALIBRATION, false)).toBeNull();
    });
});

describe('surprises', () => {
    it('lists the gaps against the forecast, the biggest first, only for who had a vote', () => {
        const results = official({1: stat({voto: 7, goals: 1}), 2: stat({voto: 5.5}), 3: stat({voto: null})});
        const out = surprises([{id: 1, role: 'A', points: 7}, {id: 2, role: 'D', points: 6.2}, {id: 3, role: 'C', points: 6.5}], results, CLASSIC_RULES, DEFAULT_CALIBRATION);
        expect(out.map((s) => s.id)).toEqual([1, 2]);
        expect(out[0].delta).toBe(3);
        expect(out[1].delta).toBeCloseTo(-0.7);
    });
});
