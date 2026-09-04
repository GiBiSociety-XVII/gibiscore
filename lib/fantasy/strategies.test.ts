import {describe, expect, it} from 'vitest';
import {suggestPrices, type FantaRole} from './scores';
import {bestLineup, FORMATIONS, planStrategy, rankStrategies, shareFor, slotFractions, slotFractionsFor, strategyHealth, STRATEGIES, type PoolPlayer} from './strategies';

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

const config = {credits: 500, participants: 8, slots: {P: 3, D: 8, C: 8, A: 6}, modifiers: {defence: false, captain: false, fairPlay: false, midfield: false}};

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
        players[222].penaltyTaker = true; // A13, overall 68, behind A1..A12
        const prices = suggestPrices(players, {credits: 500, participants: 8, slots: config.slots, roleShare: {P: 0.08, D: 0.16, C: 0.28, A: 0.48}});
        const plan = planStrategy(STRATEGIES.find((s) => s.key === 'penaltyTakers')!, players, prices, config);
        expect(plan.picks.A.some((p) => p.id === players[222].id)).toBe(true);
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
        expect(ranked).toHaveLength(STRATEGIES.length);
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
});

describe('formations in plans', () => {
    it('every plan names its best formation and values all of them', () => {
        const players = pool();
        const prices = suggestPrices(players, {credits: 500, participants: 8, slots: config.slots, roleShare: {P: 0.08, D: 0.16, C: 0.28, A: 0.48}});
        const plan = planStrategy(STRATEGIES[0], players, prices, config);
        expect(FORMATIONS.map((f) => f.key)).toContain(plan.formation);
        expect(plan.formations[0].key).toBe(plan.formation);
        expect(plan.formations[0].value).toBe(plan.lineupValue);
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
        expect(plan.budget.P).toBe(25);
        expect(plan.picks.A).toHaveLength(6);
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
