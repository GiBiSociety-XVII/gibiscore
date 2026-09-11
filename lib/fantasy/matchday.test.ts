import {describe, expect, it} from 'vitest';
import {CLASSIC_RULES} from './scores';
import {forecastPlayer, recommendLineup, type MatchdayFixture, type MatchdayPlayer, type PlayerContext, type RecentMatch} from './matchday';

const fixture: MatchdayFixture = {id: 1, round: 'R4', startingAt: '2026-09-13T18:45:00Z', state: 'scheduled', home: {id: 10, name: 'Inter'}, away: {id: 20, name: 'Lecce'}, prediction: {lambdaHome: 2.2, lambdaAway: 0.6, home: 72, draw: 18, away: 10}, avgFor: {home: 1.9, away: 0.9}};
const player = (id: number, role: MatchdayPlayer['role'], teamId: number, starter: number, over: Partial<MatchdayPlayer['scores']['events']> = {}): MatchdayPlayer => ({
    id, name: `${role}${id}`, slug: `p${id}`, role, team: {id: teamId, name: teamId === 10 ? 'Inter' : 'Lecce'}, penaltyTaker: false,
    scores: {starter, fantaAvg: 6.8, events: {rating: 6.4, goals: 0.3, assists: 0.1, yellow: 0.1, red: 0, penaltyMissed: 0, penaltySaved: 0, conceded: 1.2, cleanSheet: 0.3, ...over}},
});
const recent = (statuses: RecentMatch['status'][]): RecentMatch[] => statuses.map((status, i) => ({fixtureId: 100 + i, status, minutes: status === 'started' ? 90 : status === 'sub' ? 20 : 0, rating: null, goals: 0, assists: 0}));

describe('forecastPlayer', () => {
    it('a player whose club does not play is worth nothing', () => {
        const f = forecastPlayer(player(1, 'A', 30, 90), null, [fixture], CLASSIC_RULES);
        expect(f.plays).toBe(0);
        expect(f.value).toBe(0);
        expect(f.reasons[0]).toEqual({kind: 'noMatch'});
    });

    it('the official lineup settles the chance of playing', () => {
        const ctx = (official: PlayerContext['official']): PlayerContext => ({teamId: 10, recent: recent(['bench', 'bench']), official, sidelined: null});
        expect(forecastPlayer(player(1, 'A', 10, 30), ctx('starter'), [fixture], CLASSIC_RULES).plays).toBe(0.95);
        expect(forecastPlayer(player(1, 'A', 10, 95), ctx('out'), [fixture], CLASSIC_RULES).plays).toBe(0.02);
    });

    it('an injured or suspended player is out, a doubt halves the chance', () => {
        const hurt: PlayerContext = {teamId: 10, recent: recent(['started', 'started']), official: null, sidelined: {category: 'injury', description: 'Knee', longTerm: false}};
        expect(forecastPlayer(player(1, 'D', 10, 95), hurt, [fixture], CLASSIC_RULES).plays).toBe(0);
        const doubt: PlayerContext = {...hurt, sidelined: {category: 'doubtful', description: null, longTerm: false}};
        const sure = forecastPlayer(player(1, 'D', 10, 95), {...hurt, sidelined: null}, [fixture], CLASSIC_RULES).plays;
        expect(forecastPlayer(player(1, 'D', 10, 95), doubt, [fixture], CLASSIC_RULES).plays).toBeCloseTo(sure * 0.45, 2);
    });

    it('recent use outweighs the auction mark: a regular of late plays, a benched star does not', () => {
        const regular = forecastPlayer(player(1, 'C', 10, 40), {teamId: 10, recent: recent(['started', 'started', 'started', 'sub']), official: null, sidelined: null}, [fixture], CLASSIC_RULES);
        const benched = forecastPlayer(player(2, 'C', 10, 90), {teamId: 10, recent: recent(['bench', 'bench', 'out']), official: null, sidelined: null}, [fixture], CLASSIC_RULES);
        expect(regular.plays).toBeGreaterThan(0.7);
        expect(benched.plays).toBeLessThan(0.45);
        // Nothing seen yet: the mark alone.
        expect(forecastPlayer(player(3, 'C', 10, 80), {teamId: 10, recent: [], official: null, sidelined: null}, [fixture], CLASSIC_RULES).plays).toBe(0.8);
    });

    it('the match moves the points: a favourite at home scores more, a keeper facing a weak attack keeps a clean sheet', () => {
        const ctx: PlayerContext = {teamId: 10, recent: recent(['started']), official: null, sidelined: null};
        const homeStriker = forecastPlayer(player(1, 'A', 10, 90, {goals: 0.5}), ctx, [fixture], CLASSIC_RULES);
        const awayStriker = forecastPlayer(player(2, 'A', 20, 90, {goals: 0.5}), {...ctx, teamId: 20}, [fixture], CLASSIC_RULES);
        expect(homeStriker.points).toBeGreaterThan(awayStriker.points + 0.5);
        expect(homeStriker.reasons.some((r) => r.kind === 'attack' && r.factor > 1)).toBe(true);
        const keeper = forecastPlayer(player(3, 'P', 10, 100, {goals: 0, assists: 0, yellow: 0}), ctx, [fixture], CLASSIC_RULES);
        // Expected 0.6 conceded: -0.6, clean sheet 55%: +0.55.
        expect(keeper.points).toBeCloseTo(keeper.rating - 0.6 + Math.exp(-0.6), 1);
        expect(keeper.reasons.some((r) => r.kind === 'cleanSheet' && r.pct === 55)).toBe(true);
    });
});

describe('recommendLineup', () => {
    it('fields the eleven that is worth most with automatic substitutions and orders the bench by role', () => {
        const ctx = (statuses: RecentMatch['status'][]): PlayerContext => ({teamId: 10, recent: recent(statuses), official: null, sidelined: null});
        const roster: MatchdayPlayer[] = [
            player(1, 'P', 10, 100), player(2, 'P', 10, 5), player(3, 'P', 10, 3),
            ...[4, 5, 6, 7, 8, 9, 10, 11].map((id) => player(id, 'D', 10, 95)),
            ...[12, 13, 14, 15, 16, 17, 18, 19].map((id) => player(id, 'C', 10, 90, {goals: 0.15})),
            ...[20, 21, 22, 23, 24, 25].map((id) => player(id, 'A', 10, 85, {goals: 0.45})),
        ];
        const forecasts = roster.map((p) => forecastPlayer(p, ctx(p.id % 7 === 0 ? ['bench', 'bench'] : ['started', 'started']), [fixture], CLASSIC_RULES));
        const advice = recommendLineup(forecasts, {rules: CLASSIC_RULES});
        expect(advice.starters).toHaveLength(11);
        expect(advice.starters[0].player.role).toBe('P');
        expect(advice.starters[0].player.id).toBe(1);
        expect(advice.bench).toHaveLength(14);
        expect(advice.bench.map((f) => f.player.role)).toEqual([...advice.bench.map((f) => f.player.role)].sort((a, b) => ['P', 'D', 'C', 'A'].indexOf(a) - ['P', 'D', 'C', 'A'].indexOf(b)));
        expect(advice.formations[0].key).toBe(advice.formation);
        expect(advice.formations.every((f, i) => i === 0 || f.total <= advice.formations[0].total)).toBe(true);
        // The benched regulars (ids 7, 14, 21) do not start.
        expect(advice.starters.some((f) => f.player.id === 7 || f.player.id === 14 || f.player.id === 21)).toBe(false);
    });

    it('prefers the roster\'s own formation when it is within a hair of the best', () => {
        const ctx: PlayerContext = {teamId: 10, recent: recent(['started']), official: null, sidelined: null};
        const roster: MatchdayPlayer[] = [player(1, 'P', 10, 100), ...[2, 3, 4, 5, 6].map((id) => player(id, 'D', 10, 95)), ...[7, 8, 9, 10, 11].map((id) => player(id, 'C', 10, 95)), ...[12, 13, 14].map((id) => player(id, 'A', 10, 95))];
        const forecasts = roster.map((p) => forecastPlayer(p, ctx, [fixture], CLASSIC_RULES));
        const free = recommendLineup(forecasts, {rules: CLASSIC_RULES});
        const held = recommendLineup(forecasts, {rules: CLASSIC_RULES, prefer: free.formations[1].key});
        expect(held.formation).toBe(free.formations[1].total >= free.total * 0.98 ? free.formations[1].key : free.formation);
    });
});
