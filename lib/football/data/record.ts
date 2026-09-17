import 'server-only';
import {unstable_cache} from 'next/cache';
import type {BetLeg, BetSuggestion} from '../markets';
import {footballDb, logReadError, TEAM_SELECT, toTeam, type TeamRow} from './shared';
import type {TeamSummary} from '../types';

/**
 * The track record of the advice: every slip written down before
 * kick-off (fixture_advice) and settled on the final score, folded per
 * tier of risk, with the latest settled slips one by one.
 */

export interface TierTally {
    slips: number;
    hits: number;
    hitRate: number;
    /** Average chance promised, percent. */
    promised: number;
    /** Return of a flat stake on every slip at the bookmakers' price, percent; null when no slip had a price. */
    roi: number | null;
    priced: number;
}

export interface SettledSlip {
    fixtureId: number;
    tier: BetSuggestion['tier'];
    legs: BetLeg[];
    pct: number;
    fair: number;
    odds: number | null;
    hit: boolean;
    startingAt: string;
    league: string;
    home: TeamSummary;
    away: TeamSummary;
    homeScore: number;
    awayScore: number;
}

export interface AdviceRecord {
    tiers: Record<BetSuggestion['tier'], TierTally>;
    /** Latest first. */
    latest: SettledSlip[];
    /** Slips settled in all. */
    total: number;
}

interface Row {
    fixture_id: number;
    tier: BetSuggestion['tier'];
    legs: BetLeg[];
    pct: number;
    fair: number | string;
    odds: number | string | null;
    hit: boolean;
    fixture: {starting_at: string; home_score: number; away_score: number; league: {name: string} | null; home: TeamRow | null; away: TeamRow | null} | null;
}

const num = (v: number | string | null) => (v === null ? null : Number(v));

export const getAdviceRecord = unstable_cache(
    async (latestCount = 40): Promise<AdviceRecord | null> => {
        try {
            const db = footballDb();
            const {data, error} = await db
                .from('fixture_advice')
                .select(`fixture_id,tier,legs,pct,fair,odds,hit,fixture:fixtures!inner(starting_at,home_score,away_score,league:leagues(name),home:teams!fixtures_home_team_id_fkey(${TEAM_SELECT}),away:teams!fixtures_away_team_id_fkey(${TEAM_SELECT}))`)
                .not('hit', 'is', null)
                .order('settled_at', {ascending: false})
                .limit(5000);
            if (error) throw error;
            const rows = ((data ?? []) as unknown as Row[]).filter((r) => r.fixture && r.fixture.home && r.fixture.away);
            const tally = () => ({slips: 0, hits: 0, pct: 0, priced: 0, returned: 0});
            const acc = {safe: tally(), balanced: tally(), bold: tally()};
            for (const r of rows) {
                const a = acc[r.tier];
                if (!a) continue;
                a.slips += 1;
                a.pct += r.pct;
                if (r.hit) a.hits += 1;
                const odds = num(r.odds);
                if (odds !== null) {
                    a.priced += 1;
                    a.returned += r.hit ? odds - 1 : -1;
                }
            }
            const tiers = {} as AdviceRecord['tiers'];
            for (const tier of ['safe', 'balanced', 'bold'] as const) {
                const a = acc[tier];
                tiers[tier] = {slips: a.slips, hits: a.hits, hitRate: a.slips > 0 ? Math.round((a.hits / a.slips) * 100) : 0, promised: a.slips > 0 ? Math.round(a.pct / a.slips) : 0, roi: a.priced > 0 ? Math.round((a.returned / a.priced) * 1000) / 10 : null, priced: a.priced};
            }
            const latest: SettledSlip[] = rows
                .slice()
                .sort((a, b) => b.fixture!.starting_at.localeCompare(a.fixture!.starting_at) || a.tier.localeCompare(b.tier))
                .slice(0, latestCount)
                .map((r) => ({fixtureId: r.fixture_id, tier: r.tier, legs: r.legs, pct: r.pct, fair: Number(r.fair), odds: num(r.odds), hit: r.hit, startingAt: r.fixture!.starting_at, league: r.fixture!.league?.name ?? '', home: toTeam(r.fixture!.home!), away: toTeam(r.fixture!.away!), homeScore: r.fixture!.home_score, awayScore: r.fixture!.away_score}));
            return {tiers, latest, total: rows.length};
        } catch (error) {
            logReadError('getAdviceRecord', error);
            return null;
        }
    },
    ['advice-record'],
    {revalidate: 600},
);

/** The site-wide tally of the slips users saved: how many, how many settled, how many won. */
export const getSchedineTally = unstable_cache(
    async (): Promise<{total: number; settled: number; won: number} | null> => {
        try {
            const {data, error} = await footballDb().rpc('schedine_record');
            if (error) throw error;
            const row = (Array.isArray(data) ? data[0] : data) as {total: number | string; settled: number | string; won: number | string} | undefined;
            return row ? {total: Number(row.total), settled: Number(row.settled), won: Number(row.won)} : null;
        } catch (error) {
            logReadError('getSchedineTally', error);
            return null;
        }
    },
    ['schedine-tally'],
    {revalidate: 600},
);
