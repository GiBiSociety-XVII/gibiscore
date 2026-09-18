import 'server-only';
import {getPriorStudy, getSeasonStudy} from '@/lib/football/data/study';
import {getPredictionTuning} from '@/lib/football/data/tuning';
import {settleLegs, suggestBets, summarizeOdds, type LegKey, type OddsMarkets} from '@/lib/football/markets';
import {predictMatch} from '@/lib/football/prediction';
import {schedinaLost, schedinaWon, type SchedinaKind} from '@/lib/football/schedina';
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

/** Every saved slip whose matches are all over: won or lost on their scores. */
export async function settleSchedine(db: FootballClient, run: SyncRun): Promise<void> {
    // Every open slip whose first match has started: each finished selection is judged as it ends.
    const {data, error} = await db.from('schedine').select('id,kind,system_of,selections,results').is('hit', null).lte('first_kickoff', new Date(Date.now() - 90 * 60_000).toISOString()).limit(500);
    if (error) failSync('schedine.select', error);
    const open = (data ?? []) as Array<{id: number; kind: SchedinaKind; system_of: number | null; selections: Array<{fixtureId: number; banker?: boolean; legs: Array<{key: LegKey}>}>; results: Array<boolean | null> | null}>;
    if (open.length === 0) return;
    const ids = [...new Set(open.flatMap((s) => s.selections.map((x) => x.fixtureId)))];
    const {data: fixtures, error: fixturesError} = await db.from('fixtures').select('id,state,home_score,away_score').in('id', ids);
    if (fixturesError) failSync('fixtures.select', fixturesError);
    const byId = new Map(((fixtures ?? []) as Array<{id: number; state: string; home_score: number | null; away_score: number | null}>).map((f) => [f.id, f]));
    let settled = 0;
    for (const s of open) {
        // Per selection: won, lost, or null while the match is not over (a postponed one waits with the calendar).
        const results = s.selections.map((x) => {
            const f = byId.get(x.fixtureId);
            if (!f || f.state !== 'finished' || f.home_score === null || f.away_score === null) return null;
            return settleLegs(x.legs.map((l) => l.key), f.home_score, f.away_score);
        });
        const bankers = s.selections.map((x) => x.banker === true);
        const hits = results.filter((r) => r === true).length;
        const complete = results.every((r) => r !== null);
        if (complete) {
            const {error: updateError} = await db.from('schedine').update({results, hits, hit: schedinaWon(s.kind, results.map((r) => r === true), s.system_of, bankers), settled_at: new Date().toISOString()}).eq('id', s.id);
            if (updateError) failSync('schedine.update', updateError);
            settled += 1;
        } else if (schedinaLost(s.kind, results, s.system_of, bankers)) {
            // Lost already: no need to wait for the matches still to play.
            const {error: updateError} = await db.from('schedine').update({results, hits, hit: false, settled_at: new Date().toISOString()}).eq('id', s.id);
            if (updateError) failSync('schedine.update', updateError);
            settled += 1;
        } else if (JSON.stringify(results) !== JSON.stringify(s.results ?? [])) {
            const {error: updateError} = await db.from('schedine').update({results, hits}).eq('id', s.id);
            if (updateError) failSync('schedine.update', updateError);
        }
    }
    if (settled > 0) run.bump('schedine_settled', settled);
}
