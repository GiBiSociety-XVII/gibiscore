import 'server-only';
import {getPriorStudy, getSeasonStudy} from '@/lib/football/data/study';
import {getPredictionTuning} from '@/lib/football/data/tuning';
import {settleLegs, suggestBets, summarizeOdds, type LegKey, type MatchFacts, type OddsMarkets} from '@/lib/football/markets';
import {predictMatch} from '@/lib/football/prediction';
import {schedinaLost, schedinaWon, settledReturn, type SchedinaKind} from '@/lib/football/schedina';
import {chunk, failSync, type FootballClient, type SyncRun} from './context';
import {notifyUsers} from '@/lib/notifications/dispatch';
import {localize, type Localized} from '@/lib/notifications/events';

/**
 * The record of the advice: what the model proposes for a match is
 * written down before kick-off (fixture_advice, one row per tier, the
 * last snapshot wins) and settled once the match is over: on the final
 * score, the half-time score, the corners and the cards, whichever the
 * legs read (a leg on the statistics waits for the details sync; if
 * the details come without its statistic, or nothing comes for three
 * days, it is lost). What the pages
 * show as the model's track record comes from here, never from a
 * prediction redone after the fact.
 */

interface FactsRow {
    state: string;
    home_score: number | null;
    away_score: number | null;
    home_score_ht: number | null;
    away_score_ht: number | null;
    starting_at: string;
    /** The ninety-minute score when extra time was played; null otherwise. */
    home_score_ft: number | null;
    away_score_ft: number | null;
    details_synced_at: string | null;
    stats: Array<{corners: number | null; yellow_cards: number | null; red_cards: number | null}> | null;
}

const FACTS_SELECT = 'state,starting_at,home_score,away_score,home_score_ft,away_score_ft,home_score_ht,away_score_ht,details_synced_at,stats:fixture_team_stats(corners,yellow_cards,red_cards)';
/** A fact not in this long after kick-off is not coming: the leg that waits for it is lost. */
const FACTS_WAIT_MS = 3 * 86_400_000;

/**
 * The facts a finished match offers its legs; null while the score is
 * not in. A count is null (the leg waits) until the details are synced;
 * when they came without it, or nothing came for three days, it is NaN:
 * no line is over or under an unknown, the leg is lost. The half-time
 * score the same way.
 */
function factsOf(f: FactsRow): MatchFacts | null {
    if (f.state !== 'finished' || f.home_score === null || f.away_score === null) return null;
    const overdue = Date.now() - Date.parse(f.starting_at) > FACTS_WAIT_MS;
    // Both sides' statistics, or nothing: one side's count is not the match's.
    const total = (pick: (s: {corners: number | null; yellow_cards: number | null; red_cards: number | null}) => number | null): number | null => {
        if (!f.details_synced_at) return overdue ? Number.NaN : null;
        const values = (f.stats ?? []).map(pick);
        if (values.length !== 2 || values.some((v) => v === null)) return Number.NaN;
        return (values as number[]).reduce((sum, v) => sum + v, 0);
    };
    const half = (v: number | null) => (v === null && overdue ? Number.NaN : v);
    // The markets settle on ninety minutes: the score before extra time when there was any.
    return {home: f.home_score_ft ?? f.home_score, away: f.away_score_ft ?? f.away_score, htHome: half(f.home_score_ht), htAway: half(f.away_score_ht), corners: total((s) => s.corners), yellows: total((s) => (s.yellow_cards === null ? null : s.yellow_cards + (s.red_cards ?? 0)))};
}

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
    const oddsByFixture = new Map<number, Array<{bookmaker: string; markets: OddsMarkets}>>();
    for (const ids of chunk(fixtures.map((f) => f.id), 100)) {
        const {data: oddsRows, error: oddsError} = await db.from('fixture_odds').select('fixture_id,bookmaker,markets').in('fixture_id', ids).limit(5000);
        if (oddsError) failSync('fixture_odds.select', oddsError);
        for (const r of (oddsRows ?? []) as Array<{fixture_id: number; bookmaker: string; markets: OddsMarkets}>) oddsByFixture.set(r.fixture_id, [...(oddsByFixture.get(r.fixture_id) ?? []), r]);
    }

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
                prediction: {home: prediction.home, draw: prediction.draw, away: prediction.away, over25: prediction.over25, btts: prediction.btts, lambda: prediction.lambda, tuning: {goalScale: tuning.goalScale, homeEdge: tuning.homeEdge, rho: tuning.rho}},
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
    // A tier the new snapshot no longer proposes is withdrawn: the record holds what was proposed last, not a leftover.
    const tiersOf = new Map<number, string[]>();
    for (const r of rows) tiersOf.set(r.fixture_id as number, [...(tiersOf.get(r.fixture_id as number) ?? []), r.tier as string]);
    for (const f of fixtures) {
        const kept = tiersOf.get(f.id) ?? [];
        if (kept.length === 3) continue;
        const {error} = kept.length === 0 ? await db.from('fixture_advice').delete().eq('fixture_id', f.id).is('hit', null) : await db.from('fixture_advice').delete().eq('fixture_id', f.id).is('hit', null).not('tier', 'in', `(${kept.join(',')})`);
        if (error) failSync('fixture_advice.delete', error);
    }
    run.bump('advice', rows.length);
}

/** Every slip of a finished match not settled yet: won or lost on the facts. A slip of a match that will not be played, or that finished without a score, is withdrawn. */
export async function settleAdvice(db: FootballClient, run: SyncRun): Promise<void> {
    const {data: dead, error: deadError} = await db
        .from('fixture_advice')
        .select('fixture_id,fixture:fixtures!inner(state,starting_at,home_score)')
        .is('hit', null)
        .in('fixtures.state', ['cancelled', 'abandoned', 'postponed', 'finished'])
        .limit(2000);
    if (deadError) failSync('fixture_advice.select', deadError);
    const overdue = Date.now() - FACTS_WAIT_MS;
    const voidIds = [...new Set(((dead ?? []) as unknown as Array<{fixture_id: number; fixture: {state: string; starting_at: string; home_score: number | null}}>).filter((r) => r.fixture.state === 'cancelled' || r.fixture.state === 'abandoned' || ((r.fixture.state === 'postponed' || r.fixture.home_score === null) && Date.parse(r.fixture.starting_at) < overdue)).map((r) => r.fixture_id))];
    for (const ids of chunk(voidIds, 200)) {
        const {error} = await db.from('fixture_advice').delete().in('fixture_id', ids).is('hit', null);
        if (error) failSync('fixture_advice.delete', error);
    }
    if (voidIds.length > 0) run.bump('voided', voidIds.length);
    const {data, error} = await db
        .from('fixture_advice')
        .select(`fixture_id,tier,legs,fixture:fixtures!inner(${FACTS_SELECT})`)
        .is('hit', null)
        .eq('fixtures.state', 'finished')
        .limit(2000);
    if (error) failSync('fixture_advice.select', error);
    const open = (data ?? []) as unknown as Array<{fixture_id: number; tier: string; legs: Array<{key: LegKey}>; fixture: FactsRow}>;
    let settled = 0;
    for (const row of open) {
        const facts = factsOf(row.fixture);
        if (!facts) continue;
        const hit = settleLegs(row.legs.map((l) => l.key), facts);
        if (hit === null) continue;
        const {error: updateError} = await db.from('fixture_advice').update({hit, settled_at: new Date().toISOString()}).eq('fixture_id', row.fixture_id).eq('tier', row.tier);
        if (updateError) failSync('fixture_advice.update', updateError);
        settled += 1;
    }
    if (settled > 0) run.bump('settled', settled);
}

/**
 * Every saved slip whose matches are all over: won or lost on their
 * facts. A slip lost before its last match keeps being judged match by
 * match until every selection is in: the ticket then shows how many
 * were right, not only that one was wrong.
 */
export async function settleSchedine(db: FootballClient, run: SyncRun): Promise<void> {
    // Every open slip whose first match has started (within the last two months: older ones are stuck on a match that will never be judged), and every lost one whose last match may still be judged (its kick-off less than the facts' wait, plus a day, ago): each finished selection is judged as it ends. Oldest first, so a backlog never starves the rest.
    const started = new Date(Date.now() - 90 * 60_000).toISOString();
    const oldest = new Date(Date.now() - 60 * 86_400_000).toISOString();
    const judgeable = new Date(Date.now() - FACTS_WAIT_MS - 86_400_000).toISOString();
    const {data, error} = await db.from('schedine').select('id,user_id,kind,system_of,selections,results,hit,payout,lines').lte('first_kickoff', started).or(`and(hit.is.null,first_kickoff.gte.${oldest}),and(hit.eq.false,last_kickoff.gte.${judgeable})`).order('first_kickoff').limit(500);
    if (error) failSync('schedine.select', error);
    const open = ((data ?? []) as Array<{id: number; user_id: string; kind: SchedinaKind; system_of: number | null; selections: Array<{fixtureId: number; banker?: boolean; legs: Array<{key: LegKey}>; pct: number; odds?: number | null}>; results: Array<boolean | null> | null; hit: boolean | null; payout: number | string | null; lines: Array<{k: number; stake: number}> | null}>).filter((s) => s.hit === null || (s.results ?? []).length < s.selections.length || (s.results ?? []).some((r) => r === null));
    if (open.length === 0) return;
    const ids = [...new Set(open.flatMap((s) => s.selections.map((x) => x.fixtureId)))];
    const {data: fixtures, error: fixturesError} = await db.from('fixtures').select(`id,${FACTS_SELECT}`).in('id', ids);
    if (fixturesError) failSync('fixtures.select', fixturesError);
    const byId = new Map(((fixtures ?? []) as unknown as Array<FactsRow & {id: number}>).map((f) => [f.id, f]));
    // A match that will not be played (cancelled, abandoned, postponed with no new date in sight) is void: the bookmakers' way, it leaves the slip, which is judged on the others.
    const isVoid = (f: (FactsRow & {id: number}) | undefined) => !!f && (f.state === 'cancelled' || f.state === 'abandoned' || (f.state === 'postponed' && Date.now() - Date.parse(f.starting_at) > FACTS_WAIT_MS));
    let settled = 0;
    const told: Array<{userId: string; text: Localized; url: string; tag: string}> = [];
    const tell = (s: (typeof open)[number], won: boolean, hits: number, results: Array<boolean | null>) => {
        // What the slip really pays: a system may win on some columns only.
        const payout = won ? settledReturn(s.kind, s.selections, results, s.payout !== null ? Number(s.payout) : null, s.lines) : 0;
        const prize = won && payout > 0 ? ` · ${payout.toFixed(2)} €` : '';
        told.push({
            userId: s.user_id,
            text: localize((_w, locale) =>
                locale === 'en'
                    ? {title: `Betting slip no. ${s.id}: ${won ? 'won!' : 'lost'}`, body: `${hits}/${s.selections.length} in${prize ? `${prize} payout` : ''}`}
                    : {title: `Schedina n. ${s.id}: ${won ? 'vinta!' : 'persa'}`, body: `${hits}/${s.selections.length} centrate${prize ? `${prize} di vincita` : ''}`},
            ),
            url: '/account',
            tag: `schedina-${s.id}`,
        });
    };
    for (const s of open) {
        // Per selection: won, lost, or null while the match is not over (a postponed one waits with the calendar).
        const results = s.selections.map((x) => {
            const f = byId.get(x.fixtureId);
            const facts = f ? factsOf(f) : null;
            return facts ? settleLegs(x.legs.map((l) => l.key), facts) : null;
        });
        const voids = s.selections.map((x) => isVoid(byId.get(x.fixtureId)));
        const judged = results.filter((_r, i) => !voids[i]);
        const bankers = s.selections.filter((_x, i) => !voids[i]).map((x) => x.banker === true);
        const hits = results.filter((r) => r === true).length;
        const complete = judged.every((r) => r !== null);
        // A slip of void matches only: nothing to judge, nothing won.
        if (judged.length === 0) {
            if (s.hit === null) {
                const {error: updateError} = await db.from('schedine').update({results, hits: 0, hit: false, settled_at: new Date().toISOString()}).eq('id', s.id);
                if (updateError) failSync('schedine.update', updateError);
                settled += 1;
            }
            continue;
        }
        if (s.hit === false) {
            // Lost already and told so: only the tally of the matches since moves.
            if (JSON.stringify(results) !== JSON.stringify(s.results ?? [])) {
                const {error: updateError} = await db.from('schedine').update({results, hits}).eq('id', s.id);
                if (updateError) failSync('schedine.update', updateError);
            }
            continue;
        }
        if (complete) {
            const won = schedinaWon(s.kind, judged.map((r) => r === true), s.system_of, bankers);
            const {error: updateError} = await db.from('schedine').update({results, hits, hit: won, settled_at: new Date().toISOString()}).eq('id', s.id);
            if (updateError) failSync('schedine.update', updateError);
            settled += 1;
            tell(s, won, hits, results);
        } else if (schedinaLost(s.kind, judged, s.system_of, bankers)) {
            // Lost already: no need to wait for the matches still to play.
            const {error: updateError} = await db.from('schedine').update({results, hits, hit: false, settled_at: new Date().toISOString()}).eq('id', s.id);
            if (updateError) failSync('schedine.update', updateError);
            settled += 1;
            tell(s, false, hits, results);
        } else if (JSON.stringify(results) !== JSON.stringify(s.results ?? [])) {
            const {error: updateError} = await db.from('schedine').update({results, hits}).eq('id', s.id);
            if (updateError) failSync('schedine.update', updateError);
        }
    }
    if (settled > 0) run.bump('schedine_settled', settled);
    await notifyUsers(db, run, 'schedina', told);
}
