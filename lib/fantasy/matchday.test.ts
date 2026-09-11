import {describe, expect, it} from 'vitest';
import {CLASSIC_RULES} from './scores';
import {forecastPlayer, recommendLineup, roundStates, type MatchdayFixture, type MatchdayPlayer, type PlayerContext, type PlayerForecast, type RecentMatch} from './matchday';

const fixture: MatchdayFixture = {id: 1, round: 'R4', startingAt: '2026-09-13T18:45:00Z', state: 'scheduled', home: {id: 10, name: 'Inter'}, away: {id: 20, name: 'Lecce'}, prediction: {lambdaHome: 2.2, lambdaAway: 0.6, home: 72, draw: 18, away: 10}, avgFor: {home: 1.9, away: 0.9}, form: {home: 'WWWDW', away: 'LLDLL'}};
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
        // On the bench: a small chance of a start, a fair one of a vote as a substitute, worth less.
        const bench = forecastPlayer(player(1, 'A', 10, 95), ctx('bench'), [fixture], CLASSIC_RULES);
        expect(bench.plays).toBe(0.25);
        expect(bench.starts).toBe(0.03);
        expect(bench.subPoints).toBeLessThan(bench.points);
        expect(bench.value).toBeCloseTo(0.03 * bench.points + 0.22 * bench.subPoints, 1);
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
        expect(regular.plays).toBeGreaterThan(regular.starts);
        expect(benched.plays).toBeLessThan(0.45);
        // A super-sub: a vote off the bench most weeks, at a sub's points.
        const superSub = forecastPlayer(player(4, 'A', 10, 40), {teamId: 10, recent: recent(['sub', 'sub', 'sub', 'sub']), official: null, sidelined: null}, [fixture], CLASSIC_RULES);
        expect(superSub.starts).toBeLessThan(0.25);
        expect(superSub.plays - superSub.starts).toBeGreaterThan(0.3);
        expect(superSub.value).toBeGreaterThan(superSub.starts * superSub.points);
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

    it('a big club in form against a small one in a slump: the rating moves both ways, the sheet lifts the defenders', () => {
        const ctx: PlayerContext = {teamId: 10, recent: recent(['started']), official: null, sidelined: null};
        const even: MatchdayFixture = {...fixture, prediction: {lambdaHome: 1.3, lambdaAway: 1.3, home: 38, draw: 26, away: 36}, form: {home: 'WDLWD', away: 'WDLWD'}};
        const bigHome = forecastPlayer(player(1, 'C', 10, 90), ctx, [fixture], CLASSIC_RULES);
        const evenHome = forecastPlayer(player(1, 'C', 10, 90), ctx, [even], CLASSIC_RULES);
        const smallAway = forecastPlayer(player(2, 'C', 20, 90), {...ctx, teamId: 20}, [fixture], CLASSIC_RULES);
        expect(bigHome.rating).toBeGreaterThan(evenHome.rating + 0.2);
        expect(smallAway.rating).toBeLessThan(evenHome.rating - 0.3);
        expect(bigHome.reasons.some((r) => r.kind === 'form' && r.own > r.opp)).toBe(true);
        const bigDefender = forecastPlayer(player(3, 'D', 10, 90, {goals: 0, assists: 0}), ctx, [fixture], CLASSIC_RULES);
        const bigMid = forecastPlayer(player(4, 'C', 10, 90, {goals: 0, assists: 0}), ctx, [fixture], CLASSIC_RULES);
        expect(bigDefender.rating).toBeGreaterThan(bigMid.rating);
    });

    it('a player marked out by hand does not play', () => {
        const ctx: PlayerContext = {teamId: 10, recent: recent(['started', 'started']), official: null, sidelined: {category: 'manual', description: null, longTerm: false}};
        const f = forecastPlayer(player(1, 'A', 10, 95), ctx, [fixture], CLASSIC_RULES);
        expect(f.plays).toBe(0);
        expect(f.reasons[0]).toEqual({kind: 'manual'});
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

    it('builds the lineup around the pinned starters, dropping the formations with no room for them', () => {
        const ctx: PlayerContext = {teamId: 10, recent: recent(['started', 'started']), official: null, sidelined: null};
        const roster: MatchdayPlayer[] = [
            player(1, 'P', 10, 100),
            ...[2, 3, 4, 5, 6].map((id) => player(id, 'D', 10, 90)),
            ...[7, 8, 9, 10, 11].map((id) => player(id, 'C', 10, 90)),
            player(12, 'A', 10, 90, {goals: 0.6}), player(13, 'A', 10, 90, {goals: 0.5}), player(14, 'A', 10, 90, {goals: 0.4}),
            // A fourth striker who never plays: pinned, he starts anyway.
            player(15, 'A', 10, 5),
        ];
        const forecasts = roster.map((p) => forecastPlayer(p, ctx, [fixture], CLASSIC_RULES));
        const free = recommendLineup(forecasts, {rules: CLASSIC_RULES});
        expect(free.starters.some((f) => f.player.id === 15)).toBe(false);
        const pinnedOne = recommendLineup(forecasts, {rules: CLASSIC_RULES, pinned: new Set([15])});
        expect(pinnedOne.starters.some((f) => f.player.id === 15)).toBe(true);
        expect(pinnedOne.total).toBeLessThanOrEqual(free.total);
        // Four pinned strikers: no formation holds them, the three-striker ones come first and the rest is marked.
        const pinnedFour = recommendLineup(forecasts, {rules: CLASSIC_RULES, pinned: new Set([12, 13, 14, 15])});
        expect(pinnedFour.formations.every((f) => !f.feasible)).toBe(true);
        expect(pinnedFour.formations[0].total).toBeGreaterThanOrEqual(pinnedFour.formations[1].total);
        // Three pinned strikers: only the 3-4-3 and 4-3-3 fit, a forced 4-4-2 is ignored.
        const three = recommendLineup(forecasts, {rules: CLASSIC_RULES, pinned: new Set([12, 13, 15]), force: '4-4-2'});
        expect(['3-4-3', '4-3-3']).toContain(three.formation);
        expect(three.formations.filter((f) => f.feasible).map((f) => f.key).sort()).toEqual(['3-4-3', '4-3-3']);
        expect(three.starters.filter((f) => f.player.role === 'A').map((f) => f.player.id).sort()).toEqual([12, 13, 15]);
    });

    it('a better player with a little more risk starts over a surer, weaker one: a miss is covered by the bench', () => {
        const sure = (p: MatchdayPlayer): PlayerForecast => ({player: p, fixture, home: true, opponent: fixture.away, plays: 0.92, starts: 0.92, rating: 6.5, points: 7.22, subPoints: 6, value: 6.64, reasons: []});
        const better = (p: MatchdayPlayer): PlayerForecast => ({player: p, fixture, home: true, opponent: fixture.away, plays: 0.86, starts: 0.86, rating: 7.17, points: 7.53, subPoints: 6, value: 6.48, reasons: []});
        const filler = (p: MatchdayPlayer, plays: number, points: number): PlayerForecast => ({player: p, fixture, home: true, opponent: fixture.away, plays, starts: plays, points, subPoints: 6, rating: 6, value: Math.round(plays * points * 100) / 100, reasons: []});
        const forecasts: PlayerForecast[] = [
            filler(player(1, 'P', 10, 100), 0.95, 6),
            better(player(2, 'D', 10, 90)), sure(player(3, 'D', 10, 90)),
            ...[4, 5, 6].map((id) => filler(player(id, 'D', 10, 90), 0.9, 6.3)),
            filler(player(7, 'D', 10, 50), 0.9, 6.0),
            ...[8, 9, 10, 11, 12].map((id) => filler(player(id, 'C', 10, 90), 0.9, 6.4)),
            ...[13, 14, 15, 16].map((id) => filler(player(id, 'A', 10, 90), 0.9, 6.8)),
        ];
        const advice = recommendLineup(forecasts, {rules: CLASSIC_RULES, force: '3-4-3'});
        const defenders = advice.starters.filter((f) => f.player.role === 'D').map((f) => f.player.id);
        expect(defenders[0]).toBe(2);
        expect(defenders).toContain(3);
        // The slot: his points when he plays, the substitute's when not, so the surer one is not ahead by the risk alone.
        expect(advice.slots.get(2)!).toBeGreaterThan(advice.slots.get(3)!);
        expect(advice.slots.get(2)!).toBeGreaterThan(6.48);
    });

    it('a player never in a squad this season is not a sure starter on his auction mark alone', () => {
        const ghost = forecastPlayer(player(1, 'D', 10, 95), {teamId: 10, recent: recent(['out', 'out', 'out']), official: null, sidelined: null}, [fixture], CLASSIC_RULES);
        expect(ghost.plays).toBeLessThan(0.45);
        expect(ghost.reasons.some((r) => r.kind === 'usage' && r.started === 0)).toBe(true);
    });

    it('his own recent votes pull the expected rating', () => {
        const voted = (ratings: number[]): RecentMatch[] => ratings.map((rating, i) => ({fixtureId: 200 + i, status: 'started', minutes: 90, rating, goals: 0, assists: 0}));
        const base = forecastPlayer(player(1, 'C', 10, 90), {teamId: 10, recent: recent(['started', 'started', 'started']), official: null, sidelined: null}, [fixture], CLASSIC_RULES);
        const hot = forecastPlayer(player(1, 'C', 10, 90), {teamId: 10, recent: voted([7.4, 7.2, 7.5]), official: null, sidelined: null}, [fixture], CLASSIC_RULES);
        const cold = forecastPlayer(player(1, 'C', 10, 90), {teamId: 10, recent: voted([5.8, 5.9, 6.0]), official: null, sidelined: null}, [fixture], CLASSIC_RULES);
        expect(hot.rating).toBeGreaterThan(base.rating + 0.1);
        expect(cold.rating).toBeLessThan(base.rating - 0.1);
        // Three votes: half of the full pull, a bit less.
        expect(hot.rating - base.rating).toBeLessThan(0.4 * 0.5 * (7.4 - 6.4) + 0.01);
        expect(hot.reasons.some((r) => r.kind === 'playerForm' && r.matches === 3)).toBe(true);
    });
});

describe('roundStates', () => {
    const f = (round: number, day: number, state: string) => ({round: `Regular Season - ${round}`, startingAt: `2026-09-${String(day).padStart(2, '0')}T18:00:00Z`, state});
    it('the next round is the first with most matches to play; a postponed match does not hold its round back', () => {
        const fixtures = [
            ...[1, 2, 3, 4].map(() => f(1, 1, 'finished')),
            ...[1, 2, 3].map(() => f(2, 8, 'finished')), f(2, 30, 'scheduled'),
            ...[1, 2, 3, 4].map(() => f(3, 15, 'scheduled')),
            ...[1, 2, 3, 4].map(() => f(4, 22, 'scheduled')),
        ];
        const rounds = roundStates(fixtures);
        expect(rounds.map((r) => r.state)).toEqual(['played', 'played', 'next', 'future']);
        // The played round's span ignores the match moved to the 30th.
        expect(rounds[1].to.startsWith('2026-09-08')).toBe(true);
    });
    it('a round with a match live is the live one, and rounds sort by number', () => {
        const fixtures = [f(10, 20, 'scheduled'), f(10, 20, 'scheduled'), f(9, 13, 'live'), f(9, 12, 'finished'), f(2, 1, 'finished'), f(2, 1, 'finished')];
        const rounds = roundStates(fixtures);
        expect(rounds.map((r) => r.round)).toEqual(['Regular Season - 2', 'Regular Season - 9', 'Regular Season - 10']);
        expect(rounds.map((r) => r.state)).toEqual(['played', 'live', 'future']);
    });
});
