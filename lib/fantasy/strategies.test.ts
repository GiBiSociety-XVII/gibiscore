import {describe, expect, it} from 'vitest';
import {suggestPrices, type FantaRole} from './scores';
import {bestLineup, customFrom, defenceOption, FORMATIONS, newCustomId, optimizedStrategy, planBFor, planStrategy, rankStrategies, shareFor, slotCeiling, slotFractions, slotFractionsFor, strategyHealth, STRATEGIES, type PoolPlayer} from './strategies';
import {normalizeCustomStrategy} from './config';

function pool(): PoolPlayer[] {
    const out: PoolPlayer[] = [];
    let id = 0;
    const make = (role: FantaRole, n: number) => {
        for (let i = 0; i < n; i += 1) {
            id += 1;
            const overall = Math.max(5, 92 - i * 2);
            out.push({id, name: `${role}${i + 1}`, role, team: {name: 'T'}, penaltyTaker: false, scores: {overall, starter: Math.min(100, overall + 5), fantaAvg: 5.5 + overall / 40}});
        }
    };
    make('P', 30);
    make('D', 90);
    make('C', 90);
    make('A', 100);
    return out;
}

const config = {credits: 500, participants: 8, slots: {P: 3, D: 8, C: 8, A: 6}, modifiers: {defence: false}};

describe('slotFractions', () => {
    it('sums to one and gets steeper with focus', () => {
        const flat = slotFractions(6, 0.2);
        const steep = slotFractions(6, 0.8);
        expect(flat.reduce((s, v) => s + v, 0)).toBeCloseTo(1, 5);
        expect(steep[0]).toBeGreaterThan(flat[0]);
        expect(steep[5]).toBeLessThan(flat[5]);
    });
});

describe('planStrategy', () => {
    it('fills every slot inside the budget', () => {
        const players = pool();
        const prices = suggestPrices(players, {credits: 500, participants: 8, slots: config.slots, roleShare: {P: 0.08, D: 0.16, C: 0.28, A: 0.48}});
        const plan = planStrategy(STRATEGIES[0], players, prices, config);
        expect(plan.picks.P).toHaveLength(3);
        expect(plan.picks.A).toHaveLength(6);
        expect(plan.spent).toBeLessThanOrEqual(500);
        for (const role of ['P', 'D', 'C', 'A'] as const) expect(plan.picks[role].reduce((s, p) => s + p.price, 0)).toBeLessThanOrEqual(plan.budget[role]);
        expect(plan.lineupValue).toBeGreaterThan(60);
    });

    it('spends more on attack with the attack strategy', () => {
        const players = pool();
        const prices = suggestPrices(players, {credits: 500, participants: 8, slots: config.slots, roleShare: {P: 0.08, D: 0.16, C: 0.28, A: 0.48}});
        const attack = planStrategy(STRATEGIES.find((s) => s.key === 'topAttack')!, players, prices, config);
        const mid = planStrategy(STRATEGIES.find((s) => s.key === 'strongMidfield')!, players, prices, config);
        expect(attack.picks.A[0].overall).toBeGreaterThanOrEqual(mid.picks.A[0].overall);
        expect(mid.picks.C.reduce((s, p) => s + p.price, 0)).toBeGreaterThan(attack.picks.C.reduce((s, p) => s + p.price, 0));
    });

    it('never suggests an ignored player, and plans a wanted one in whatever the marks say', () => {
        const players = pool();
        const prices = suggestPrices(players, {credits: 500, participants: 8, slots: config.slots, roleShare: {P: 0.08, D: 0.16, C: 0.28, A: 0.48}});
        const plain = planStrategy(STRATEGIES[0], players, prices, config);
        const topA = plain.picks.A[0];
        const without = planStrategy(STRATEGIES[0], players, prices, config, new Set(), [], {avoid: new Set([topA.id])});
        expect(without.picks.A.some((p) => p.id === topA.id)).toBe(false);
        expect(without.picks.A).toHaveLength(6);
        // A modest attacker nobody would plan: wanted, he is in, pinned, and the roster still complete.
        const modest = players.filter((p) => p.role === 'A' && !plain.picks.A.some((x) => x.id === p.id)).sort((a, b) => a.scores.overall - b.scores.overall)[Math.floor(players.filter((p) => p.role === 'A').length / 2)];
        const withHim = planStrategy(STRATEGIES[0], players, prices, config, new Set(), [], {want: new Set([modest.id])});
        const pick = withHim.picks.A.find((p) => p.id === modest.id);
        expect(pick).toBeDefined();
        expect(pick!.pinned).toBe(true);
        expect(withHim.picks.A).toHaveLength(6);
        expect(withHim.spent).toBeLessThanOrEqual(500);
    });

    it('skips players already taken', () => {
        const players = pool();
        const prices = suggestPrices(players, {credits: 500, participants: 8, slots: config.slots, roleShare: {P: 0.08, D: 0.16, C: 0.28, A: 0.48}});
        const plan = planStrategy(STRATEGIES[0], players, prices, config, new Set([1]));
        expect(plan.picks.P.some((p) => p.id === 1)).toBe(false);
    });
});

describe('preferences', () => {
    it('penalty takers strategy picks the taker over a slightly better non-taker', () => {
        const players = pool();
        players[225].penaltyTaker = true; // A16, overall 62: the plan's second slot would take A14 without the flag
        const prices = suggestPrices(players, {credits: 500, participants: 8, slots: config.slots, roleShare: {P: 0.08, D: 0.16, C: 0.28, A: 0.48}});
        const plan = planStrategy(STRATEGIES.find((s) => s.key === 'penaltyTakers')!, players, prices, config);
        expect(plan.picks.A.some((p) => p.id === players[225].id)).toBe(true);
    });

    it('young upside prefers the younger of two equal players', () => {
        const players = pool();
        players[210].age = 33; // A1, overall 92
        players[211].age = 21; // A2, overall 90
        for (const p of players) if (p.age === undefined) p.age = 27;
        const prices = suggestPrices(players, {credits: 500, participants: 8, slots: config.slots, roleShare: {P: 0.08, D: 0.16, C: 0.28, A: 0.48}});
        // Enough credits that the first attacker slot can afford either: the younger one wins.
        const plan = planStrategy(STRATEGIES.find((s) => s.key === 'youngUpside')!, players, prices, {...config, credits: 1000});
        expect(plan.picks.A[0].id).toBe(players[211].id);
    });
});

describe('own purchases', () => {
    it('keeps what I bought, spends the rest of the role budget and gives a max bid per target', () => {
        const players = pool();
        const prices = suggestPrices(players, {credits: 500, participants: 8, slots: config.slots, roleShare: {P: 0.08, D: 0.16, C: 0.28, A: 0.48}});
        const mine = [{playerId: 211, role: 'A' as const, price: 160}];
        const plan = planStrategy(STRATEGIES[0], players, prices, config, new Set(), mine);
        expect(plan.picks.A[0]).toMatchObject({id: 211, price: 160});
        expect(plan.picks.A).toHaveLength(6);
        expect(plan.picks.A.slice(1).reduce((s, p) => s + p.price, 0)).toBeLessThanOrEqual(plan.budget.A - 160);
        for (const p of plan.picks.A.slice(1)) expect(p.maxBid).toBeGreaterThanOrEqual(p.price);
        expect(plan.spent).toBeGreaterThanOrEqual(160);
    });
});

describe('rankStrategies', () => {
    it('ranks available strategies first and marks the defence block unavailable without the modifier', () => {
        const players = pool();
        const prices = suggestPrices(players, {credits: 500, participants: 8, slots: config.slots, roleShare: {P: 0.08, D: 0.16, C: 0.28, A: 0.48}});
        const ranked = rankStrategies(players, prices, config);
        // The built-in ones plus the split searched on the pool.
        expect(ranked).toHaveLength(STRATEGIES.length + 1);
        expect(ranked.some((p) => p.key === 'optimized')).toBe(true);
        expect(ranked[ranked.length - 1].key).toBe('defenceBlock');
        expect(ranked[ranked.length - 1].available).toBe(false);
        expect(rankStrategies(players, prices, {...config, modifiers: {...config.modifiers, defence: true}}).every((p) => p.available)).toBe(true);
    });
});

describe('bestLineup', () => {
    const player = (role: FantaRole, fantaAvg: number, starter = 90) => ({role, scores: {fantaAvg, starter}});
    it('values every classic formation and picks the one that fits the roster', () => {
        // Three good attackers, weak fourth midfielder: 3-4-3 vs 4-3-3 decided by the fourth defender vs fourth midfielder.
        const roster = [
            player('P', 5.2),
            ...[6.4, 6.3, 6.2, 5.9, 5.8].map((v) => player('D', v)),
            ...[7.0, 6.8, 6.5, 6.4, 5.7].map((v) => player('C', v)),
            ...[8.5, 8.0, 7.2, 6.0].map((v) => player('A', v)),
        ];
        const lineup = bestLineup(roster);
        expect(lineup.formations).toHaveLength(FORMATIONS.length);
        expect(lineup.formations.map((f) => f.key)).toContain('4-3-3');
        expect(lineup.formation).toBe('3-4-3');
        expect(lineup.value).toBe(lineup.formations[0].value);
        // Sorted best first.
        for (let i = 1; i < lineup.formations.length; i += 1) expect(lineup.formations[i - 1].value).toBeGreaterThanOrEqual(lineup.formations[i].value);
    });

    it('moves to two strikers when the third attacker is weak and the midfield deep', () => {
        const roster = [
            player('P', 5.2),
            ...[6.4, 6.3, 6.2, 5.9, 5.8].map((v) => player('D', v)),
            ...[7.2, 7.0, 6.9, 6.8, 6.7, 6.2].map((v) => player('C', v)),
            player('A', 8.5), player('A', 8.0), player('A', 5.5, 40),
        ];
        expect(bestLineup(roster).formation).toBe('3-5-2');
    });

    it('cannot field a formation with empty slots: a roster of eight is worth less in every formation', () => {
        const eleven = [player('P', 5), ...Array(4).fill(player('D', 6)), ...Array(4).fill(player('C', 6.5)), ...Array(3).fill(player('A', 7.5))];
        const eight = eleven.slice(0, 8);
        expect(bestLineup(eight).value).toBeLessThan(bestLineup(eleven).value);
    });

    it('rewards four defenders when the league plays the defence modifier', () => {
        const roster = [
            player('P', 5.6),
            ...[6.7, 6.6, 6.6, 6.2].map((v) => player('D', v)),
            ...[6.6, 6.5, 6.4, 6.4].map((v) => player('C', v)),
            ...[8.0, 7.5, 6.6].map((v) => player('A', v)),
        ];
        expect(bestLineup(roster).formation).toBe('3-4-3');
        expect(bestLineup(roster, {defenceModifier: true}).formation).toBe('4-3-3');
    });

    it("plays the league's own table: nothing when it pays nothing, more defenders when it pays a lot", () => {
        const roster = [
            player('P', 5.6),
            ...[6.7, 6.6, 6.6, 6.2, 6.0].map((v) => player('D', v)),
            ...[6.6, 6.5, 6.4, 6.4].map((v) => player('C', v)),
            ...[8.0, 7.5, 6.6].map((v) => player('A', v)),
        ];
        expect(bestLineup(roster, {defenceModifier: {minDefenders: 4, points: [0, 0, 0, 0, 0]}})).toEqual(bestLineup(roster));
        expect(bestLineup(roster, {defenceModifier: {minDefenders: 5, points: [4, 6, 8, 10, 12]}}).formation).toBe('5-3-2');
        expect(defenceOption({modifiers: {defence: true}, defenceBonus: {minDefenders: 4, points: [0, 0, 0, 0, 0]}})).toBe(false);
        expect(defenceOption({modifiers: {defence: false}})).toBe(false);
        expect(defenceOption({modifiers: {defence: true}})).toEqual({minDefenders: 4, points: [1, 2, 3, 4, 6]});
    });
});

describe('formations in plans', () => {
    it('every plan names its best formation and values all of them', () => {
        const players = pool();
        const prices = suggestPrices(players, {credits: 500, participants: 8, slots: config.slots, roleShare: {P: 0.08, D: 0.16, C: 0.28, A: 0.48}});
        const plan = planStrategy(STRATEGIES[0], players, prices, config);
        expect(FORMATIONS.map((f) => f.key)).toContain(plan.formation);
        expect(plan.formations[0].key).toBe(plan.formation);
        expect(Math.max(...plan.formations.map((f) => f.value))).toBe(plan.lineupValue);
    });
});

describe('strategyHealth', () => {
    const prices = () => suggestPrices(pool(), {credits: 500, participants: 8, slots: config.slots, roleShare: {P: 0.08, D: 0.16, C: 0.28, A: 0.48}});

    it('is fine at the start, when the strategy in use is the best one', () => {
        const players = pool();
        const list = prices();
        const baseline = rankStrategies(players, list, config);
        const health = strategyHealth(baseline, baseline[0].key, baseline, config, [], new Set())!;
        expect(health.status).toBe('ok');
        expect(health.reasons).toHaveLength(0);
        expect(health.best.key).toBe(baseline[0].key);
    });

    it('warns when a role share is gone with slots still open, and tells to switch when another plan is clearly better', () => {
        const players = pool();
        const list = prices();
        const baseline = rankStrategies(players, list, config);
        // Following "top attack" (65% on attack) but I blew 300 of 325 on one attacker and 90 on a keeper: keeper share (25) is gone with 2 slots open.
        const mine = [{playerId: 211, role: 'A' as const, price: 300}, {playerId: 1, role: 'P' as const, price: 90}];
        const plans = rankStrategies(players, list, config, new Set(), mine);
        const health = strategyHealth(plans, 'topAttack', baseline, config, mine, new Set())!;
        expect(health.reasons.some((r) => r.kind === 'starved' && r.role === 'P')).toBe(true);
        expect(health.status).not.toBe('ok');
        expect(health.current.key).toBe('topAttack');
    });

    it('counts the key targets lost to other managers', () => {
        const players = pool();
        const list = prices();
        const baseline = rankStrategies(players, list, config);
        const start = baseline.find((p) => p.key === 'topAttack')!;
        // The two dearest attackers and midfielders of the plan, plus its keeper, went elsewhere.
        const gone = ['A', 'C', 'P'].flatMap((r) => [...start.picks[r as FantaRole]].sort((a, b) => b.price - a.price).slice(0, r === 'P' ? 1 : 2).map((p) => p.id));
        const taken = new Set(gone);
        const plans = rankStrategies(players, list, config, taken, []);
        const health = strategyHealth(plans, 'topAttack', baseline, config, [], taken)!;
        const lost = health.reasons.find((r) => r.kind === 'targetsLost');
        expect(lost).toMatchObject({lost: 5, total: 7});
        expect(health.status).not.toBe('ok');
    });

    it('returns null for a strategy not in the plans', () => {
        const players = pool();
        const list = prices();
        const baseline = rankStrategies(players, list, config);
        expect(strategyHealth([], 'balanced', baseline, config, [], new Set())).toBeNull();
    });
});

describe('re-budgeting after my purchases', () => {
    const prices = () => suggestPrices(pool(), {credits: 500, participants: 8, slots: config.slots, roleShare: {P: 0.08, D: 0.16, C: 0.28, A: 0.48}});

    it('takes what I overpaid off the roles still to fill, so the plan stays inside my credits', () => {
        const players = pool();
        // Top attack: A budget 325. I paid 300 for one attacker and 70 for a keeper (P budget 25).
        const mine = [{playerId: 211, role: 'A' as const, price: 300}, {playerId: 1, role: 'P' as const, price: 70}];
        const plan = planStrategy(STRATEGIES.find((s) => s.key === 'topAttack')!, players, prices(), config, new Set(), mine);
        expect(plan.spent).toBeLessThanOrEqual(500);
        expect(plan.budget.C + plan.budget.D).toBeLessThan(150);
        // The keeper's share grows to what I paid plus the cheapest keepers for the two slots still open.
        expect(plan.budget.P).toBeGreaterThanOrEqual(72);
        expect(plan.budget.P).toBeLessThan(80);
        expect(plan.picks.P).toHaveLength(3);
        expect(plan.picks.A).toHaveLength(6);
        expect(Object.values(plan.budget).reduce((a, b) => a + b, 0)).toBeLessThanOrEqual(500);
    });

    it('fills every slot of a role I overpaid in, instead of leaving them empty', () => {
        const players = pool();
        // Strong midfield: P budget 30. I paid exactly 30 for one keeper: two keepers at a credit still come.
        const mine = [{playerId: 1, role: 'P' as const, price: 30}];
        const plan = planStrategy(STRATEGIES.find((s) => s.key === 'strongMidfield')!, players, prices(), config, new Set(), mine);
        expect(plan.picks.P).toHaveLength(3);
        expect(plan.spent).toBeLessThanOrEqual(500);
    });

    it('moves the money a role cannot spend to the roles that used their share', () => {
        const players = pool();
        const list = prices();
        // Strong midfield, but every midfielder worth more than a few credits is gone: its C share cannot be spent there.
        const taken = new Set(players.filter((p) => p.role === 'C' && (list.get(p.id) ?? 1) > 3).map((p) => p.id));
        const strategy = STRATEGIES.find((s) => s.key === 'strongMidfield')!;
        const plan = planStrategy(strategy, players, list, config, taken);
        const start = planStrategy(strategy, players, list, config);
        expect(plan.budget.C).toBeLessThan(start.budget.C);
        expect(plan.budget.A + plan.budget.D).toBeGreaterThan(start.budget.A + start.budget.D);
        expect(Object.values(plan.budget).reduce((a, b) => a + b, 0)).toBe(500);
        expect(plan.spent).toBeGreaterThan(start.spent - 15);
        expect(plan.spent).toBeLessThanOrEqual(500);
        expect(plan.picks.C).toHaveLength(8);
    });

    it('raises a role share for a wanted star above it, taking the money off the other roles', () => {
        const players = pool();
        const list = prices();
        const stars = players.filter((p) => p.role === 'D').sort((a, b) => (list.get(b.id) ?? 0) - (list.get(a.id) ?? 0)).slice(0, 2);
        // Three stars: D budget 45, the two best defenders together cost more than that.
        const strategy = STRATEGIES.find((s) => s.key === 'threeStars')!;
        expect(stars.reduce((s, p) => s + list.get(p.id)!, 0)).toBeGreaterThan(45);
        const plan = planStrategy(strategy, players, list, config, new Set(), [], {want: new Set(stars.map((p) => p.id))});
        for (const star of stars) expect(plan.picks.D.some((p) => p.id === star.id && p.pinned)).toBe(true);
        expect(plan.picks.D).toHaveLength(8);
        expect(plan.spent).toBeLessThanOrEqual(500);
    });

    it('gives what I saved in a finished role to the others', () => {
        const players = pool();
        // Three cheap keepers (P budget 35 in the balanced split): 32 credits freed for the rest.
        const mine = [1, 2, 3].map((id) => ({playerId: id, role: 'P' as const, price: 1}));
        const plan = planStrategy(STRATEGIES[0], players, prices(), config, new Set(), mine);
        expect(plan.budget.D + plan.budget.C + plan.budget.A).toBeGreaterThanOrEqual(495);
        expect(plan.spent).toBeLessThanOrEqual(500);
    });
});

describe('a fixed formation', () => {
    const prices = () => suggestPrices(pool(), {credits: 500, participants: 8, slots: config.slots, roleShare: {P: 0.08, D: 0.16, C: 0.28, A: 0.48}});

    it('pays the starters of the formation plus one cover, the rest a credit', () => {
        const f = slotFractionsFor(8, 0.4, 5);
        expect(f).toHaveLength(8);
        expect(f.reduce((s, v) => s + v, 0)).toBeCloseTo(1, 5);
        expect(f[5]).toBeGreaterThan(f[6] * 5);
        expect(f[6]).toBeCloseTo(f[7], 5);
    });

    it('bends the split towards the roles the formation fields more of', () => {
        const five = shareFor(STRATEGIES[0].share, FORMATIONS.find((f) => f.key === '5-3-2')!);
        const three = shareFor(STRATEGIES[0].share, FORMATIONS.find((f) => f.key === '3-4-3')!);
        expect(five.D).toBeGreaterThan(three.D);
        expect(three.A).toBeGreaterThan(five.A);
        expect(Object.values(five).reduce((s, v) => s + v, 0)).toBeCloseTo(1, 5);
    });

    it('builds and values the plan in the formation asked for', () => {
        const players = pool();
        const five = planStrategy(STRATEGIES[0], players, prices(), {...config, formation: '5-3-2'});
        const three = planStrategy(STRATEGIES[0], players, prices(), {...config, formation: '3-4-3'});
        expect(five.formation).toBe('5-3-2');
        expect(three.formation).toBe('3-4-3');
        expect(five.formations[0].key).toBe('5-3-2');
        expect(five.budget.D).toBeGreaterThan(three.budget.D);
        // Five defenders worth paying for against three: the fifth best defender costs real money only with five at the back.
        const fifth = (plan: typeof five) => [...plan.picks.D].sort((a, b) => b.price - a.price)[4].price;
        expect(fifth(five)).toBeGreaterThan(fifth(three));
        expect(three.picks.A.filter((p) => p.price >= 20).length).toBeGreaterThanOrEqual(3);
    });
});

describe('what the review fixed', () => {
    const players = pool();
    const prices = suggestPrices(players.map((p) => ({...p, age: 26, scores: {...p.scores, sample: 30, confidence: 'high' as const}})), {credits: 500, participants: 8, slots: config.slots, roleShare: {P: 0.06, D: 0.16, C: 0.28, A: 0.5}, level: 1});
    const player = (role: FantaRole, fantaAvg: number, starter = 90) => ({role, scores: {fantaAvg, starter}});

    it('the role budgets add up to the credits, formation or not', () => {
        for (const credits of [500, 503, 1000]) {
            for (const formation of [null, '3-4-3', '5-3-2', '4-4-2']) {
                for (const s of STRATEGIES) {
                    const plan = planStrategy(s, players, prices, {...config, credits, formation});
                    expect(Object.values(plan.budget).reduce((a, b) => a + b, 0)).toBe(credits);
                    expect(plan.spent).toBeLessThanOrEqual(credits);
                }
            }
        }
    });

    it('one substitute covers a role once, whoever is missing', () => {
        const roster = [
            player('P', 5.5, 100),
            ...[6.2, 6.2, 6.2, 6.2].map((v) => player('D', v, 100)),
            ...[6.4, 6.4, 6.4].map((v) => player('C', v, 100)),
            ...[7.0, 7.0, 7.0].map((v) => player('A', v, 50)),
            player('A', 6.0, 100),
        ];
        const value = bestLineup(roster).formations.find((f) => f.key === '4-3-3')!.value;
        // Three attackers at 50%: 3 × 3.5 fielded, and the substitute plays when at least one is out (1 − 0.5³ = 0.875).
        const attack = 3 * 3.5 + 0.875 * 6.0;
        expect(value).toBeCloseTo(5.5 + 4 * 6.2 + 3 * 6.4 + attack, 0);
    });
});

describe('strategies of my own', () => {
    const custom = {id: 's1', name: 'Mia', base: 'balanced', share: {P: 0.05, D: 0.1, C: 0.2, A: 0.65}, focus: {P: 0.6, D: 0.3, C: 0.4, A: 0.8}, formations: ['3-4-3'], prefer: 'none' as const, want: [] as number[]};

    it('is planned and ranked with the built-in ones under its own key and name', () => {
        const players = pool();
        const prices = suggestPrices(players, {credits: 500, participants: 8, slots: config.slots, roleShare: {P: 0.08, D: 0.16, C: 0.28, A: 0.48}});
        const ranked = rankStrategies(players, prices, config, new Set(), [], {}, [custom]);
        const mine = ranked.find((p) => p.key === 'custom:s1');
        expect(mine).toBeDefined();
        expect(mine!.name).toBe('Mia');
        expect(mine!.budget.A).toBeGreaterThan(mine!.budget.C + mine!.budget.D);
        expect(mine!.strategy.prefer).toBe('none');
    });

    it('plans the players it wants in, whatever the marks say, without touching the other strategies', () => {
        const players = pool();
        const prices = suggestPrices(players, {credits: 500, participants: 8, slots: config.slots, roleShare: {P: 0.08, D: 0.16, C: 0.28, A: 0.48}});
        // The worst attacker of the pool.
        const worst = players.filter((p) => p.role === 'A').sort((a, b) => a.scores.overall - b.scores.overall)[0];
        const ranked = rankStrategies(players, prices, config, new Set(), [], {}, [{...custom, want: [worst.id]}]);
        const mine = ranked.find((p) => p.key === 'custom:s1')!;
        expect(mine.picks.A.some((p) => p.id === worst.id && p.pinned)).toBe(true);
        expect(ranked.find((p) => p.key === 'balanced')!.picks.A.some((p) => p.id === worst.id)).toBe(false);
    });

    it('can be copied from a built-in strategy to edit', () => {
        const copy = customFrom(STRATEGIES.find((s) => s.key === 'penaltyTakers')!, 's2', 'Rigoristi (mia)');
        expect(copy.base).toBe('penaltyTakers');
        expect(copy.prefer).toBe('penalty');
        expect(copy.share).toEqual(STRATEGIES.find((s) => s.key === 'penaltyTakers')!.share);
        expect(newCustomId([custom, copy])).toBe('s3');
    });

    it('is made whole when loaded: shares renormalized, junk dropped', () => {
        const loaded = normalizeCustomStrategy({id: 's9', name: '  Test  ', share: {P: 10, D: 20, C: 30, A: 40}, focus: {P: 2, D: -1}, formations: ['4-3-3', 'nope', '4-3-3'], prefer: 'weird'});
        expect(loaded).not.toBeNull();
        expect(loaded!.name).toBe('Test');
        expect(loaded!.share.A).toBeCloseTo(0.4);
        expect(loaded!.focus).toEqual({P: 1, D: 0, C: 0.45, A: 0.45});
        expect(loaded!.formations).toEqual(['4-3-3']);
        expect(loaded!.prefer).toBe('none');
        expect(normalizeCustomStrategy({id: 'bad id', share: custom.share})).toBeNull();
        expect(normalizeCustomStrategy({id: 's1', share: {P: 0, D: 0, C: 0, A: 0}})).toBeNull();
    });
});

describe('the optimized strategy', () => {
    it('searches a split on the pool that is at least as good as the balanced one, adding up to one', () => {
        const players = pool();
        const prices = suggestPrices(players, {credits: 500, participants: 8, slots: config.slots, roleShare: {P: 0.08, D: 0.16, C: 0.28, A: 0.48}});
        const opt = optimizedStrategy(players, prices, config);
        expect(opt.key).toBe('optimized');
        expect(Object.values(opt.share).reduce((s, v) => s + v, 0)).toBeCloseTo(1, 2);
        const ranked = rankStrategies(players, prices, config);
        const best = ranked.find((p) => p.key === 'optimized')!;
        const balanced = ranked.find((p) => p.key === 'balanced')!;
        expect(best.lineupValue).toBeGreaterThanOrEqual(balanced.lineupValue - 0.05);
    });
});

describe('planBFor', () => {
    const prices = () => suggestPrices(pool(), {credits: 500, participants: 8, slots: config.slots, roleShare: {P: 0.08, D: 0.16, C: 0.28, A: 0.48}});

    it('names, first, the player the plan picks once the target is gone', () => {
        const players = pool();
        const p = prices();
        const plan = planStrategy(STRATEGIES[0], players, p, config);
        const targets = (['P', 'D', 'C', 'A'] as const).flatMap((role) => plan.picks[role]);
        const planB = planBFor(STRATEGIES[0], players, p, config, new Set(), [], {}, targets);
        for (const target of targets) {
            const alternatives = planB.get(target.id) ?? [];
            expect(alternatives.length).toBeGreaterThan(0);
            expect(alternatives.length).toBeLessThanOrEqual(3);
            // Same role, never a current target, never the target himself.
            for (const a of alternatives) {
                expect(a.role).toBe(target.role);
                expect(a.id).not.toBe(target.id);
                expect(targets.some((t) => t.id === a.id)).toBe(false);
            }
            // The first plan B is what the plan shows once the target went to another table.
            const without = planStrategy(STRATEGIES[0], players, p, config, new Set([target.id]));
            expect(without.picks[target.role].some((x) => x.id === alternatives[0].id)).toBe(true);
        }
        // The three plan B of a target are three different players.
        const first = planB.get(targets[0].id)!;
        expect(new Set(first.map((a) => a.id)).size).toBe(first.length);
    });

    it('differs from target to target: the star gets a star, the filler a filler', () => {
        const players = pool();
        const p = prices();
        const plan = planStrategy(STRATEGIES[0], players, p, config);
        const mids = plan.picks.C;
        const planB = planBFor(STRATEGIES[0], players, p, config, new Set(), [], {}, mids);
        const star = planB.get(mids[0].id)![0];
        const filler = planB.get(mids[mids.length - 1].id)![0];
        expect(star.id).not.toBe(filler.id);
        expect(star.overall).toBeGreaterThan(filler.overall);
    });

    it('skips what I own and never proposes a player of another table', () => {
        const players = pool();
        const p = prices();
        const taken = new Set([players.find((x) => x.name === 'C2')!.id]);
        const mine = [{playerId: players.find((x) => x.name === 'A1')!.id, role: 'A' as const, price: 80}];
        const plan = planStrategy(STRATEGIES[0], players, p, config, taken, mine);
        const targets = (['P', 'D', 'C', 'A'] as const).flatMap((role) => plan.picks[role]);
        const planB = planBFor(STRATEGIES[0], players, p, config, taken, mine, {}, targets);
        expect(planB.has(mine[0].playerId)).toBe(false);
        for (const list of planB.values()) for (const a of list) expect(taken.has(a.id)).toBe(false);
    });
});

describe('slotCeiling', () => {
    const picks = [
        {id: 1, name: 'star', team: 'T', role: 'C' as const, price: 60, overall: 90, maxBid: 65},
        {id: 2, name: 'good', team: 'T', role: 'C' as const, price: 25, overall: 82, maxBid: 27},
        {id: 3, name: 'filler', team: 'T', role: 'C' as const, price: 5, overall: 70, maxBid: 8},
    ];
    const player = (id: number, overall: number) => ({id, role: 'C' as const, scores: {overall}});

    it('gives a target the ceiling of his own slot', () => {
        expect(slotCeiling(picks, player(2, 82), new Set())).toBe(27);
    });
    it('gives a player not planned the ceiling of the slot he would take by rank', () => {
        // As good as the second pick but dearer than his slot: the strategy stops at that slot's ceiling.
        expect(slotCeiling(picks, player(9, 85), new Set())).toBe(27);
        expect(slotCeiling(picks, player(9, 95), new Set())).toBe(65);
        expect(slotCeiling(picks, player(9, 71), new Set())).toBe(8);
    });
    it('has no ceiling for a player below every pick', () => {
        expect(slotCeiling(picks, player(9, 60), new Set())).toBeNull();
    });
    it('skips the slots I have already filled', () => {
        expect(slotCeiling(picks, player(9, 95), new Set([1]))).toBe(27);
    });
});
