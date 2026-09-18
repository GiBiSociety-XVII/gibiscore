'use client';

import {useMemo} from "react";
import {keeperBlocks} from "@/lib/fantasy/block";
import {DEFAULT_RULES, ledgerOf, ROLE_SHARE, type AuctionConfig, type Purchase} from "@/lib/fantasy/config";
import type {AuctionPlayer, AuctionPool} from "@/lib/fantasy/data";
import {bargains, type Bargain} from "@/lib/fantasy/bargains";
import {dynamicPrices, marketState} from "@/lib/fantasy/dynamic";
import {fantaAvgFor, suggestPrices, type FantaRole} from "@/lib/fantasy/scores";
import {playerMatches} from "@/lib/fantasy/search";
import {planBFor, rankStrategies, type StrategyPick} from "@/lib/fantasy/strategies";
import {explainTiers, type Tier, type TierInfo} from "@/lib/fantasy/tiers";

const ROLES: FantaRole[] = ['P', 'D', 'C', 'A'];

/** How the list can be sorted: the seven marks behind the total, plus the total, the price, the average, the bargain and the name. */
export const SCORE_KEYS = ['starter', 'bonus', 'rating', 'discipline', 'fitness', 'team', 'form'] as const;
export type SortKey = 'overall' | 'price' | 'fantaAvg' | 'bargain' | (typeof SCORE_KEYS)[number] | 'name';

/**
 * Everything the board reads off the pool, the settings and the
 * purchases: the marks as the league wants them, the market as it sees
 * it (keepers by block or not), list and live prices, bargains, tiers,
 * and the strategies simulated on what is left. One place, so a purchase
 * redraws them all in the same order.
 */
export function useBoardData(rawPool: AuctionPool | null, config: AuctionConfig | null, purchases: Purchase[]) {
    // The marks the league wants: with the cups, or the main leagues only.
    const pool = useMemo(() => {
        if (!rawPool || !config) return rawPool;
        const overrides = config.roleOverrides;
        const fixed = Object.keys(overrides).length > 0 ? rawPool.players.map((p) => (overrides[String(p.id)] && overrides[String(p.id)] !== p.role ? {...p, role: overrides[String(p.id)], roleSource: 'manual' as const} : p)) : rawPool.players;
        const chosen = config.cupsCount ? fixed : fixed.map((p) => ({...p, scores: p.scoresLeagueOnly, seasons: p.seasons.filter((l) => !l.cup)}));
        // The league's own bonus and malus: the fantasy average follows them.
        const classic = (Object.keys(DEFAULT_RULES) as Array<keyof typeof DEFAULT_RULES>).every((k) => config.rules[k] === DEFAULT_RULES[k]);
        const players = classic ? chosen : chosen.map((p) => (p.scores.events ? {...p, scores: {...p.scores, fantaAvg: fantaAvgFor(p.scores.events, p.role, config.rules)}} : p));
        return players === rawPool.players ? rawPool : {...rawPool, players};
    }, [rawPool, config]);
    // Keepers by block (a league rule): the club's first keeper carries the block, the others are not on
    // the market by themselves. Prices, market and strategies then see one keeper slot and no backups.
    const board = useMemo(() => {
        if (!pool || !config) return null;
        const blocks = config.keeperBlock ? keeperBlocks(pool.players) : null;
        return {
            blocks,
            players: blocks ? pool.players.filter((p) => !blocks.backups.has(p.id)) : pool.players,
            config: blocks ? {...config, slots: {...config.slots, P: 1}} : config,
            purchases: blocks ? purchases.filter((p) => !blocks.backups.has(p.playerId)) : purchases,
        };
    }, [pool, config, purchases]);
    // List prices assume a full market; the live prices follow what has been bought and paid.
    const listPrices = useMemo(() => {
        if (!board) return new Map<number, number>();
        return suggestPrices(board.players, {credits: board.config.credits, participants: board.config.participants, slots: board.config.slots, roleShare: ROLE_SHARE, level: board.config.priceLevel / 100});
    }, [board]);
    // Cheap on Fantacalcio.it, worth much more to the site: ranked on the list prices, so the auction does not move them.
    const deals = useMemo(() => (board ? bargains(board.players.map((p) => ({id: p.id, role: p.role, listQuote: p.listQuote, value: p.scores.overall})), listPrices) : new Map<number, Bargain>()), [board, listPrices]);
    // Live prices follow the purchases: the plans below hang on them, so they are drawn once per purchase.
    const prices = useMemo(() => (board ? dynamicPrices(board.players, listPrices, board.config, board.purchases) : listPrices), [board, listPrices]);
    const market = board ? marketState(board.players, listPrices, board.config, board.purchases) : null;
    const bought = useMemo(() => new Map(purchases.map((p) => [p.playerId, p])), [purchases]);
    const tierInfos = useMemo(() => (pool && config ? explainTiers(pool.players, config) : new Map<number, TierInfo>()), [pool, config]);
    const tiers = useMemo(() => new Map<number, Tier>([...tierInfos].map(([id, info]) => [id, info.tier])), [tierInfos]);
    // Strategies simulated on what is still on the market at live prices, starting from what I already own.
    const plans = useMemo(() => {
        if (!board) return [];
        const byId = new Map(board.players.map((p) => [p.id, p]));
        const taken = new Set(board.purchases.filter((p) => p.manager !== board.config.me).map((p) => p.playerId));
        const mine = board.purchases.filter((p) => p.manager === board.config.me && byId.has(p.playerId)).map((p) => ({playerId: p.playerId, role: byId.get(p.playerId)!.role, price: p.price}));
        return rankStrategies(board.players, prices, {...board.config, credits: board.config.credits + ledgerOf(board.config.ledger, board.config.me)}, taken, mine, {want: new Set(board.config.want), avoid: new Set(board.config.avoid)}, board.config.strategies);
    }, [board, prices]);
    // Plan B of every target of the strategy in use: drawn by the strategy itself without him (see planBFor).
    const planB = useMemo(() => {
        const plan = board ? plans.find((p) => p.key === board.config.strategy) : undefined;
        if (!board || !plan) return new Map<number, StrategyPick[]>();
        const byId = new Map(board.players.map((p) => [p.id, p]));
        const taken = new Set(board.purchases.filter((p) => p.manager !== board.config.me).map((p) => p.playerId));
        const mine = board.purchases.filter((p) => p.manager === board.config.me && byId.has(p.playerId)).map((p) => ({playerId: p.playerId, role: byId.get(p.playerId)!.role, price: p.price}));
        const targets = ROLES.flatMap((r) => plan.picks[r]).filter((p) => !mine.some((m) => m.playerId === p.id));
        return planBFor(plan.strategy, board.players, prices, {...board.config, credits: board.config.credits + ledgerOf(board.config.ledger, board.config.me)}, taken, mine, {want: new Set(board.config.want), avoid: new Set(board.config.avoid)}, targets);
    }, [board, plans, prices]);
    // A warning in words; a custom strategy has no translation, so it is named from the plans.
    return {pool, board, listPrices, deals, prices, market, bought, tierInfos, tiers, plans, planB};
}

export interface BoardFilters {
    q: string;
    role: FantaRole | 'all';
    tier: Tier | 'all';
    teamId: number | 'all';
    hideBought: boolean;
    sort: SortKey;
}

/** The list as the filters and the sort leave it. */
export function useFilteredPlayers(pool: AuctionPool | null, filters: BoardFilters, tiers: Map<number, Tier>, bought: Map<number, Purchase>, prices: Map<number, number>, deals: Map<number, Bargain>) {
    const {q, role, tier, teamId, hideBought, sort} = filters;
    return useMemo(() => {
        if (!pool) return [];
        const needle = q.trim().toLowerCase();
        const list = pool.players.filter((p) => (role === 'all' || p.role === role) && (tier === 'all' || tiers.get(p.id) === tier) && (teamId === 'all' || p.team.id === teamId) && (!hideBought || !bought.has(p.id)) && (!needle || playerMatches(p, needle)));
        const value = (p: AuctionPlayer): number | string => (sort === 'price' ? (prices.get(p.id) ?? 0) : sort === 'fantaAvg' ? (p.scores.fantaAvg ?? -1) : sort === 'bargain' ? (deals.has(p.id) ? (deals.get(p.id)!.bargain ? 100 : 0) + deals.get(p.id)!.index : 0) : sort === 'name' ? p.name : p.scores[sort]);
        return list.sort((a, b) => {
            const va = value(a);
            const vb = value(b);
            if (typeof va === 'string' && typeof vb === 'string') return va.localeCompare(vb);
            return (vb as number) - (va as number) || b.scores.overall - a.scores.overall;
        });
    }, [pool, q, role, tier, tiers, teamId, hideBought, bought, sort, prices, deals]);
}
