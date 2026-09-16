import 'server-only';
import {getPriorStudy, getSeasonStudy} from '@/lib/football/data/study';
import {getPredictionTuning} from '@/lib/football/data/tuning';
import {settleLegs, suggestBets, summarizeOdds, type LegKey, type OddsMarkets} from '@/lib/football/markets';
import {predictMatch} from '@/lib/football/prediction';
import {chunk, failSync, type FootballClient, type SyncRun} from './context';

/**
 * The record of the advice: what the model proposes for a match is
 * written down before kick-off (fixture_advice, one row per tier, the
 * last snapshot wins) and settled on the final score once the match is
 * over. What the pages show as the model's track record comes from
 * here, never from a prediction redone after the fact.
 */

export interface AdviceFixture {
    id: number;
    seasonId: number;
    homeId: number;
    awayId: number;
}

/** The slips of every tier for these upcoming fixtures, with the odds stored for them. */
export async function snapshotAdvice(db: FootballClient, run: SyncRun, fixtures: AdviceFixture[]): Promise<void> {
    if (fixtures.length === 0) return;
    const tuning = await getPredictionTuning();
    const studies = new Map<number, Awaited<ReturnType<typeof getSeasonStudy>>>();
    const priors = new Map<number, Awaited<ReturnType<typeof getPriorStudy>>>();
    for (const seasonId of new Set(fixtures.map((f) => f.seasonId))) {
        studies.set(seasonId, await getSeasonStudy(seasonId));
        priors.set(seasonId, await getPriorStudy(seasonId));
    }
    const {data: oddsRows, error: oddsError} = await db.from('fixture_odds').select('fixture_id,bookmaker,markets').in('fixture_id', fixtures.map((f) => f.id)).limit(5000);
    if (oddsError) failSync('fixture_odds.select', oddsError);
    const oddsByFixture = new Map<number, Array<{bookmaker: string; markets: OddsMarkets}>>();
    for (const r of (oddsRows ?? []) as Array<{fixture_id: number; bookmaker: string; markets: OddsMarkets}>) oddsByFixture.set(r.fixture_id, [...(oddsByFixture.get(r.fixture_id) ?? []), r]);

    const rows: Array<Record<string, unknown>> = [];
    const now = new Date().toISOString();
    for (const f of fixtures) {
        const prediction = predictMatch(studies.get(f.seasonId) ?? null, f.homeId, f.awayId, priors.get(f.seasonId) ?? null, tuning);
        if (!prediction) continue;
        const odds = summarizeOdds(oddsByFixture.get(f.id) ?? []);
        for (const slip of suggestBets(prediction, odds)) {
            rows.push({
                fixture_id: f.id,
                tier: slip.tier,
                legs: slip.legs,
                pct: slip.pct,
                fair: slip.fair,
                odds: slip.odds,
                prediction: {home: prediction.home, draw: prediction.draw, away: prediction.away, over25: prediction.over25, btts: prediction.btts, lambda: prediction.lambda, tuning},
                advised_at: now,
                hit: null,
                settled_at: null,
            });
        }
    }
    for (const group of chunk(rows, 500)) {
        const {error} = await db.from('fixture_advice').upsert(group, {onConflict: 'fixture_id,tier'});
        if (error) failSync('fixture_advice.upsert', error);
    }
    run.bump('advice', rows.length);
}

/** Every slip of a finished match not settled yet: won or lost on the final score. */
export async function settleAdvice(db: FootballClient, run: SyncRun): Promise<void> {
    const {data, error} = await db
        .from('fixture_advice')
        .select('fixture_id,tier,legs,fixture:fixtures!inner(state,home_score,away_score)')
        .is('hit', null)
        .eq('fixtures.state', 'finished')
        .limit(2000);
    if (error) failSync('fixture_advice.select', error);
    const open = (data ?? []) as unknown as Array<{fixture_id: number; tier: string; legs: Array<{key: LegKey}>; fixture: {state: string; home_score: number | null; away_score: number | null}}>;
    let settled = 0;
    for (const row of open) {
        if (row.fixture.home_score === null || row.fixture.away_score === null) continue;
        const hit = settleLegs(row.legs.map((l) => l.key), row.fixture.home_score, row.fixture.away_score);
        const {error: updateError} = await db.from('fixture_advice').update({hit, settled_at: new Date().toISOString()}).eq('fixture_id', row.fixture_id).eq('tier', row.tier);
        if (updateError) failSync('fixture_advice.update', updateError);
        settled += 1;
    }
    if (settled > 0) run.bump('settled', settled);
}
