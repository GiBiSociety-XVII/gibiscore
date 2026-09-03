import 'server-only';
import {COMPETITION_FILTER} from '@/lib/football/competitions';
import {sportmonksGet, sportmonksPages} from '@/lib/sportmonks/client';
import {
    extractMinute,
    extractScores,
    isLiveState,
    isStoredEvent,
    mapEventKind,
    mapFixtureState,
    mapLineups,
    mapTeamStats,
    splitParticipants,
    toIsoUtc,
} from '@/lib/sportmonks/mappers';
import type {SmFixture} from '@/lib/sportmonks/types';
import {
    chunk,
    ensurePlayers,
    ensureTeams,
    failSync,
    finishRun,
    footballClient,
    leagueIdMap,
    seasonIdMap,
    startRun,
    type FootballClient,
    type IdMap,
    type MinimalPlayer,
    type SyncRun,
} from './context';

/** Includes for the schedule sync: enough to render lists and the live strip. */
const SCHEDULE_INCLUDES = 'participants;scores;state;round;periods;venue';

/** Includes for live and post-match detail. */
const DETAIL_INCLUDES = 'participants;scores;state;round;periods;venue;events.type;statistics.type;lineups.details.type';

function ymd(date: Date): string {
    return date.toISOString().slice(0, 10);
}

/**
 * sync-fixtures (hourly)
 *
 * Fetches the schedule from yesterday to +14 days for the configured leagues
 * and upserts fixtures, creating teams on the fly. Detail data (events,
 * statistics, lineups) is not fetched here: it is the live job's work.
 */
export async function syncFixtures(options: {fromDaysAgo?: number; toDaysAhead?: number} = {}): Promise<SyncRun> {
    const db = footballClient();
    const run = await startRun(db, 'sync-fixtures');
    try {
        const now = new Date();
        const from = new Date(now.getTime() - (options.fromDaysAgo ?? 1) * 86_400_000);
        const to = new Date(now.getTime() + (options.toDaysAhead ?? 14) * 86_400_000);

        const fixtures: SmFixture[] = [];
        for await (const page of sportmonksPages<SmFixture>(`fixtures/between/${ymd(from)}/${ymd(to)}`, {
            include: SCHEDULE_INCLUDES,
            params: {filters: `fixtureLeagues:${COMPETITION_FILTER}`, per_page: 50},
        })) {
            run.requests += 1;
            fixtures.push(...page);
        }

        await upsertFixtures(db, run, fixtures);
        await finishRun(db, run, 'ok');
        return run;
    } catch (error) {
        await finishRun(db, run, 'error', (error as Error).message);
        throw error;
    }
}

/**
 * sync-live (every minute)
 *
 * 1. Pull everything in play for our leagues with full detail.
 * 2. Re-fetch fixtures that our DB still marks as live but the API no
 *    longer lists in play (they just finished), so final scores, events and
 *    player statistics land.
 * 3. Re-fetch fixtures finished in the last 3 hours once more without
 *    lineups detail already present, to catch late statistics corrections.
 */
export async function syncLive(): Promise<SyncRun> {
    const db = footballClient();
    const run = await startRun(db, 'sync-live');
    try {
        const {data: inplay} = await sportmonksGet<SmFixture[]>('livescores/inplay', {
            include: DETAIL_INCLUDES,
            params: {filters: `fixtureLeagues:${COMPETITION_FILTER}`},
        });
        run.requests += 1;
        run.bump('inplay', inplay.length);

        const inplayIds = new Set(inplay.map((f) => f.id));

        // Fixtures we think are live but the API does not: they ended (or were
        // suspended). Fetch them individually to get their final state.
        const {data: staleRows, error} = await db
            .from('fixtures')
            .select('sportmonks_id')
            .in('state', ['live', 'half_time', 'extra_time', 'penalties']);
        if (error) failSync('fixtures.select', error);
        const staleIds = (staleRows ?? []).map((r) => r.sportmonks_id as number).filter((id) => !inplayIds.has(id));

        // Also fixtures that should have kicked off in the last 3 hours but are
        // still "scheduled" for us (state missed by the schedule job).
        const threeHoursAgo = new Date(Date.now() - 3 * 3_600_000).toISOString();
        const {data: dueRows, error: dueError} = await db
            .from('fixtures')
            .select('sportmonks_id')
            .eq('state', 'scheduled')
            .lte('starting_at', new Date().toISOString())
            .gte('starting_at', threeHoursAgo);
        if (dueError) failSync('fixtures.select', dueError);
        for (const r of dueRows ?? []) {
            const id = r.sportmonks_id as number;
            if (!inplayIds.has(id)) staleIds.push(id);
        }

        const refetched: SmFixture[] = [];
        for (const ids of chunk([...new Set(staleIds)], 20)) {
            const {data} = await sportmonksGet<SmFixture[]>(`fixtures/multi/${ids.join(',')}`, {include: DETAIL_INCLUDES});
            run.requests += 1;
            refetched.push(...data);
        }
        run.bump('refetched', refetched.length);

        await upsertFixtures(db, run, [...inplay, ...refetched], {withDetails: true});
        await finishRun(db, run, 'ok');
        return run;
    } catch (error) {
        await finishRun(db, run, 'error', (error as Error).message);
        throw error;
    }
}

/** Fetch one fixture with full detail and store it. Used by backfills and debugging. */
export async function syncFixtureById(sportmonksId: number): Promise<SyncRun> {
    const db = footballClient();
    const run = await startRun(db, 'sync-fixture');
    try {
        const {data} = await sportmonksGet<SmFixture>(`fixtures/${sportmonksId}`, {include: DETAIL_INCLUDES});
        run.requests += 1;
        await upsertFixtures(db, run, [data], {withDetails: true});
        await finishRun(db, run, 'ok');
        return run;
    } catch (error) {
        await finishRun(db, run, 'error', (error as Error).message);
        throw error;
    }
}

// ---------------------------------------------------------------------------
// Core upsert
// ---------------------------------------------------------------------------

async function upsertFixtures(db: FootballClient, run: SyncRun, fixtures: SmFixture[], options: {withDetails?: boolean} = {}) {
    if (fixtures.length === 0) return;

    const leagues = await leagueIdMap(db, [...new Set(fixtures.map((f) => f.league_id))]);
    const seasons = await seasonIdMap(db, [...new Set(fixtures.map((f) => f.season_id))]);

    // Seasons we have never seen (e.g. a cup season created mid-year): create them
    // on the fly so fixtures are never dropped.
    const missingSeasons = fixtures.filter((f) => !seasons.has(f.season_id) && leagues.has(f.league_id));
    if (missingSeasons.length > 0) {
        const rows = [...new Map(missingSeasons.map((f) => [f.season_id, f])).values()].map((f) => ({
            sportmonks_id: f.season_id,
            league_id: leagues.get(f.league_id)!,
            name: `season-${f.season_id}`,
            is_current: false,
        }));
        const {error} = await db.from('seasons').upsert(rows, {onConflict: 'sportmonks_id', ignoreDuplicates: true});
        if (error) failSync('seasons.upsert', error);
        for (const [k, v] of await seasonIdMap(db, rows.map((r) => r.sportmonks_id))) seasons.set(k, v);
        run.warn(`created ${rows.length} placeholder season(s); run sync-competitions to name them`);
    }

    const teams = await ensureTeams(db, fixtures.flatMap((f) => f.participants ?? []));

    const fixtureRows = [];
    const skipped: number[] = [];
    for (const f of fixtures) {
        const sides = splitParticipants(f.participants);
        const leagueId = leagues.get(f.league_id);
        const seasonId = seasons.get(f.season_id);
        const homeId = sides && teams.get(sides.home.id);
        const awayId = sides && teams.get(sides.away.id);
        if (!sides || !leagueId || !seasonId || !homeId || !awayId) {
            skipped.push(f.id);
            continue;
        }
        const state = mapFixtureState(f);
        if (state === 'unknown') run.warn(`fixture ${f.id}: unknown state ${f.state?.developer_name ?? f.state_id}`);
        const {current, halfTime} = extractScores(f.scores);
        fixtureRows.push({
            sportmonks_id: f.id,
            league_id: leagueId,
            season_id: seasonId,
            round: f.round?.name ?? null,
            stage: f.stage?.name ?? null,
            starting_at: toIsoUtc(f.starting_at),
            state,
            minute: extractMinute(f.periods, state),
            home_team_id: homeId,
            away_team_id: awayId,
            home_score: current.home,
            away_score: current.away,
            home_score_ht: halfTime.home,
            away_score_ht: halfTime.away,
            venue_name: f.venue?.name ?? null,
            referee: f.referees?.[0]?.referee?.common_name ?? f.referees?.[0]?.referee?.name ?? null,
            raw: options.withDetails ? stripRaw(f) : undefined,
            last_synced_at: new Date().toISOString(),
        });
    }
    if (skipped.length > 0) run.warn(`skipped ${skipped.length} fixture(s) with missing league/season/participants: ${skipped.slice(0, 10).join(',')}`);

    for (const rows of chunk(fixtureRows, 200)) {
        const {error} = await db.from('fixtures').upsert(rows, {onConflict: 'sportmonks_id'});
        if (error) failSync('fixtures.upsert', error);
    }
    run.bump('fixtures', fixtureRows.length);

    if (!options.withDetails) return;

    const {data: idRows, error: idError} = await db
        .from('fixtures')
        .select('id,sportmonks_id')
        .in('sportmonks_id', fixtureRows.map((r) => r.sportmonks_id));
    if (idError) failSync('fixtures.select', idError);
    const fixtureIds: IdMap = new Map((idRows ?? []).map((r) => [r.sportmonks_id as number, r.id as number]));

    for (const f of fixtures) {
        const fixtureId = fixtureIds.get(f.id);
        if (!fixtureId) continue;
        try {
            await upsertDetails(db, run, f, fixtureId, teams);
        } catch (error) {
            run.warn(`fixture ${f.id} details: ${(error as Error).message}`);
        }
    }
}

/** Keep the raw payload small: drop the bulky includes we already normalised. */
function stripRaw(f: SmFixture): Record<string, unknown> {
    const {events: _events, statistics: _statistics, lineups: _lineups, participants: _participants, ...rest} = f;
    void _events; void _statistics; void _lineups; void _participants;
    return rest as Record<string, unknown>;
}

async function upsertDetails(db: FootballClient, run: SyncRun, f: SmFixture, fixtureId: number, teams: IdMap) {
    // Players referenced by events and lineups must exist first (FK).
    const playerRefs: MinimalPlayer[] = [];
    for (const e of f.events ?? []) {
        if (e.player_id) playerRefs.push({id: e.player_id, name: e.player_name ?? null});
        if (e.related_player_id) playerRefs.push({id: e.related_player_id, name: e.related_player_name ?? null});
    }
    for (const l of f.lineups ?? []) {
        playerRefs.push({id: l.player_id, name: l.player_name ?? null, player: l.player ?? null});
    }
    const players = await ensurePlayers(db, playerRefs);

    // Events
    const eventRows = (f.events ?? [])
        .map((e) => ({e, kind: mapEventKind(e)}))
        .filter(({kind}) => isStoredEvent(kind))
        .map(({e, kind}) => ({
            sportmonks_id: e.id,
            fixture_id: fixtureId,
            team_id: e.participant_id ? teams.get(e.participant_id) ?? null : null,
            player_id: e.player_id ? players.get(e.player_id) ?? null : null,
            related_player_id: e.related_player_id ? players.get(e.related_player_id) ?? null : null,
            type: kind,
            minute: e.minute,
            extra_minute: e.extra_minute,
            result: e.result ?? null,
            info: e.info ?? e.addition ?? null,
            sort_order: e.sort_order ?? null,
        }));
    if (eventRows.length > 0) {
        const {error} = await db.from('fixture_events').upsert(eventRows, {onConflict: 'sportmonks_id'});
        if (error) failSync('fixture_events.upsert', error);
        run.bump('events', eventRows.length);
    }

    // Team statistics
    const statRows = [...mapTeamStats(f.statistics).entries()]
        .filter(([teamSmId]) => teams.has(teamSmId))
        .map(([teamSmId, s]) => ({fixture_id: fixtureId, team_id: teams.get(teamSmId)!, ...s}));
    if (statRows.length > 0) {
        const {error} = await db.from('fixture_team_stats').upsert(statRows, {onConflict: 'fixture_id,team_id'});
        if (error) failSync('fixture_team_stats.upsert', error);
        run.bump('team_stats', statRows.length);
    }

    // Lineups and player statistics
    const {lineups, playerStats} = mapLineups(f.lineups);
    const formations = new Map((f.formations ?? []).map((x) => [x.participant_id, x.formation]));
    const lineupRows = lineups
        .filter((l) => teams.has(l.sportmonksTeamId) && players.has(l.sportmonksPlayerId))
        .map((l) => ({
            fixture_id: fixtureId,
            team_id: teams.get(l.sportmonksTeamId)!,
            player_id: players.get(l.sportmonksPlayerId)!,
            is_expected: false,
            is_starter: l.isStarter,
            formation: formations.get(l.sportmonksTeamId) ?? null,
            formation_position: l.formationPosition,
            jersey_number: l.jerseyNumber,
        }));
    if (lineupRows.length > 0) {
        const {error} = await db.from('lineups').upsert(lineupRows, {onConflict: 'fixture_id,team_id,player_id,is_expected'});
        if (error) failSync('lineups.upsert', error);
        run.bump('lineups', lineupRows.length);
    }

    const playerStatRows = playerStats
        .filter((s) => teams.has(s.sportmonksTeamId) && players.has(s.sportmonksPlayerId))
        .map(({sportmonksPlayerId, sportmonksTeamId, ...s}) => ({
            fixture_id: fixtureId,
            player_id: players.get(sportmonksPlayerId)!,
            team_id: teams.get(sportmonksTeamId)!,
            ...s,
        }));
    if (playerStatRows.length > 0) {
        const {error} = await db.from('fixture_player_stats').upsert(playerStatRows, {onConflict: 'fixture_id,player_id'});
        if (error) failSync('fixture_player_stats.upsert', error);
        run.bump('player_stats', playerStatRows.length);
    }

    if (isLiveState(mapFixtureState(f))) run.bump('live');
}
