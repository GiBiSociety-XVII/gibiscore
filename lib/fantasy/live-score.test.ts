import {describe, expect, it} from 'vitest';
import {liveScore, matchLine, teamMatch} from './live-score';
import type {RoundResults, RoundStat} from './recap';
import {CLASSIC_RULES} from './scores';
import {DEFAULT_CALIBRATION} from './voto';

const stat = (over: Partial<RoundStat> = {}): RoundStat => ({minutes: 90, rating: null, goals: 0, assists: 0, yellow: 0, red: 0, conceded: 0, penaltiesSaved: 0, penaltiesMissed: 0, ownGoals: 0, ...over});
const team = (id: number) => ({id, name: `T${id}`});
/** Clubs 1-2 over (2-0), 3-4 on the pitch at 60' (1-1), 5-6 still to play. */
const results = (stats: Record<number, RoundStat>): RoundResults => ({
    round: 'Regular Season - 5',
    state: 'live',
    official: false,
    finishedTeams: [1, 2],
    matches: [
        {home: team(1), away: team(2), finished: true, score: [2, 0]},
        {home: team(3), away: team(4), finished: false, live: true, minute: 60, score: [1, 1]},
        {home: team(5), away: team(6), finished: false, score: null},
    ],
    stats,
});
const p = (id: number, role: 'P' | 'D' | 'C' | 'A', teamId: number) => ({id, role, teamId});

describe('teamMatch and matchLine', () => {
    it('tells where a club stands and prints the score so far', () => {
        const r = results({});
        expect(teamMatch(r, 2)?.state).toBe('done');
        expect(teamMatch(r, 4)?.state).toBe('live');
        expect(teamMatch(r, 6)?.state).toBe('pending');
        expect(teamMatch(r, 9)).toBeNull();
        expect(matchLine(r.matches[0])).toBe('T1 2-0 T2');
        expect(matchLine(r.matches[1])).toBe('T3 1-1 T4');
        expect(matchLine(r.matches[2])).toBeNull();
    });
});

describe('liveScore', () => {
    const starters = [p(1, 'P', 1), p(2, 'D', 1), p(3, 'D', 3), p(4, 'C', 3), p(5, 'A', 5)];
    const bench = [p(6, 'D', 2), p(7, 'C', 2), p(8, 'A', 2)];
    it('counts the points so far, keeps the players on the pitch and to come apart, and does not replace them', () => {
        const r = results({
            1: stat({voto: 6, source: 'official'}),
            // The defender of the match over had no vote: the bench defender of a match over comes in.
            2: stat({minutes: 0}),
            6: stat({voto: 6.5, source: 'official', goals: 1}),
            // On the pitch: a live rating counts, provisional; the midfielder without a rating yet is not replaced.
            3: stat({rating: 7.2, minutes: 60}),
            4: stat({rating: null, minutes: 60}),
        });
        const score = liveScore(starters, bench, r, CLASSIC_RULES, DEFAULT_CALIBRATION, false);
        expect(score.state).toBe('live');
        expect(score.counts).toEqual({done: 2, live: 2, pending: 1});
        expect(score.subs).toBe(1);
        expect(score.holes).toBe(0);
        const byId = new Map(score.slots.map((s) => [s.id, s]));
        expect(byId.get(2)?.replacedBy).toBe(6);
        expect(byId.get(6)?.replaces).toBe(2);
        expect(byId.get(6)?.points).toBe(9.5);
        expect(byId.get(3)?.state).toBe('live');
        expect(byId.get(3)?.minute).toBe(60);
        expect(byId.get(3)?.match).toBe('T3 1-1 T4');
        expect(byId.get(3)?.points).toBeGreaterThan(6);
        expect(byId.get(4)?.points).toBeNull();
        expect(byId.get(4)?.replacedBy).toBeUndefined();
        expect(byId.get(5)?.state).toBe('pending');
        expect(byId.get(5)?.match).toBeNull();
        // The keeper's vote and his clean sheet, the substitute's vote and goal, the live points of the defender.
        expect(score.total).toBeCloseTo(byId.get(1)!.points! + 9.5 + byId.get(3)!.points!, 5);
        expect(byId.get(1)!.points).toBe(6 + CLASSIC_RULES.cleanSheet);
        expect(score.provisional).toBe(true);
        // The keeper first, then by role; the substitute who came in after the eleven.
        expect(score.slots.map((s) => s.id)).toEqual([1, 2, 3, 4, 5, 6]);
        expect(score.bench.map((s) => s.id)).toEqual([7, 8]);
    });
    it('is pending before kick-off and over, with the defence modifier, when every match is done', () => {
        const nothing = liveScore([p(1, 'P', 5), p(2, 'D', 6)], [], results({}), CLASSIC_RULES, DEFAULT_CALIBRATION, false);
        expect(nothing.state).toBe('pending');
        expect(nothing.total).toBe(0);
        const over: RoundResults = {...results({1: stat({voto: 7, source: 'official'}), 2: stat({voto: 7, source: 'official'}), 3: stat({voto: 7, source: 'official'}), 4: stat({voto: 7, source: 'official'})}), matches: [{home: team(1), away: team(2), finished: true, score: [0, 0]}]};
        const done = liveScore([p(1, 'P', 1), p(2, 'D', 1), p(3, 'D', 2), p(4, 'D', 2)], [], over, CLASSIC_RULES, DEFAULT_CALIBRATION, {minDefenders: 3, points: [1, 3, 6]});
        expect(done.state).toBe('over');
        expect(done.provisional).toBe(false);
        expect(done.defence).toBeGreaterThan(0);
        expect(done.total).toBe(done.points + done.defence);
        expect(done.points).toBe(29);
    });
});
