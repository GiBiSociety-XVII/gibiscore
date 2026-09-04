import 'server-only';
import {basicScope, isFeaturedProviderId} from '@/lib/football/competitions';
import {apiFootballGet} from '@/lib/api-football/client';
import {
    extractMinute,
    isLiveState,
    mapEvents,
    mapFixtureState,
    mapLineups,
    mapPlayerStats,
    mapTeamStats,
} from '@/lib/api-football/mappers';
import type {AfFixtureResponse} from '@/lib/api-football/types';
import {
    chunk,
    ensureLeagues,
    ensurePlayers,
    ensureSeasons,
    ensureTeams,
    failSync,
    finishRun,
    footballClient,
    startRun,
    type FootballClient,
    type IdMap,
    type LeagueRef,
    type MinimalPlayer,
    type SyncRun,
} from './context';

function ymd(date: Date): string {
    return date.toISOString().slice(0, 10);
}

/** Fixtures outside the basic scope are ignored entirely. */
function inScope(f: AfFixtureResponse): boolean {
    return basicScope() === 'all' || isFeaturedProviderId(f.league.id);
}

/**
 * sync-fixtures (hourly)
 *
 * One request per day: GET /fixtures?date=YYYY-MM-DD returns every match of
 * every competition that day. Default window: yesterday to +7 days (9
 * requests). The daily run extends it to +30 days.
 */
export async function syncFixtures(options: {fromDaysAgo?: number; toDaysAhead?: number} = {}): Promise<SyncRun> {
    const db = footballClient();
    const run = await startRun(db, 'sync-fixtures');
    try {
        const fromDaysAgo = options.fromDaysAgo ?? 1;
        const toDaysAhead = options.toDaysAhead ?? 7;
        const fixtures: AfFixtureResponse[] = [];
        for (let offset = -fromDaysAgo; offset <= toDaysAhead; offset += 1) {
            const day = ymd(new Date(Date.now() + offset * 86_400_000));
            const {response} = await apiFootballGet<AfFixtureResponse[]>('fixtures', {date: day});
            run.requests += 1;
            fixtures.push(...response.filter(inScope));
        }
        run.bump('fetched', fixtures.length);

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
 * 1. GET /fixtures?live=all: every match in play worldwide, with events.
 *    Scores, minute and events are stored for all of them.
 * 2. Featured fixtures in play, plus fixtures our DB still marks as live
 *    but the feed no longer lists (they just ended) and fixtures that should
 *    have kicked off in the last 3 hours, are re-fetched by id (20 per
 *    request) for lineups, statistics and player stats.
 */
export async function syncLive(): Promise<SyncRun> {
    const db = footballClient();
    const run = await startRun(db, 'sync-live');
    try {
        // Nothing in play and no kick-off in the last 3 hours or the next
        // 2 minutes: no request at all (saves ~700 requests a day at night).
        const {count: possible, error: possibleError} = await db
            .from('fixtures')
            .select('id', {count: 'exact', head: true})
            .or(`state.in.(live,half_time,extra_time,penalties),and(state.eq.scheduled,starting_at.gte.${new Date(Date.now() - 3 * 3_600_000).toISOString()},starting_at.lte.${new Date(Date.now() + 2 * 60_000).toISOString()})`);
        if (possibleError) failSync('fixtures.count', possibleError);
        if ((possible ?? 0) === 0) {
            run.bump('idle');
            await finishRun(db, run, 'ok');
            return run;
        }

        const {response: inplayAll} = await apiFootballGet<AfFixtureResponse[]>('fixtures', {live: 'all'});
        run.requests += 1;
        const inplay = inplayAll.filter(inScope);
        run.bump('inplay', inplay.length);

        const inplayIds = new Set(inplay.map((f) => f.fixture.id));
        const detailIds = new Set<number>(inplay.filter((f) => isFeaturedProviderId(f.league.id)).map((f) => f.fixture.id));

        const {data: staleRows, error} = await db
            .from('fixtures')
            .select('provider_id')
            .in('state', ['live', 'half_time', 'extra_time', 'penalties']);
        if (error) failSync('fixtures.select', error);
        for (const r of staleRows ?? []) if (!inplayIds.has(r.provider_id as number)) detailIds.add(r.provider_id as number);

        const threeHoursAgo = new Date(Date.now() - 3 * 3_600_000).toISOString();
        const {data: dueRows, error: dueError} = await db
            .from('fixtures')
            .select('provider_id')
            .eq('state', 'scheduled')
            .lte('starting_at', new Date().toISOString())
            .gte('starting_at', threeHoursAgo);
        if (dueError) failSync('fixtures.select', dueError);
        for (const r of dueRows ?? []) if (!inplayIds.has(r.provider_id as number)) detailIds.add(r.provider_id as number);

        // Basic-tier live fixtures: scores and events straight from the feed.
        const basicLive = inplay.filter((f) => !detailIds.has(f.fixture.id));
        await upsertFixtures(db, run, basicLive, {withDetails: true, eventsOnly: true});

        const detailed: AfFixtureResponse[] = [];
        for (const group of chunk([...detailIds], 20)) {
            const {response} = await apiFootballGet<AfFixtureResponse[]>('fixtures', {ids: group.join('-')});
            run.requests += 1;
            detailed.push(...response.filter(inScope));
        }
        run.bump('detailed', detailed.length);
        await upsertFixtures(db, run, detailed, {withDetails: true});

        await finishRun(db, run, 'ok');
        return run;
    } catch (error) {
        await finishRun(db, run, 'error', (error as Error).message);
        throw error;
    }
}

/** Fetch one fixture with full detail and store it. Used by backfills and debugging. */
export async function syncFixtureById(providerId: number): Promise<SyncRun> {
    const db = footballClient();
    const run = await startRun(db, 'sync-fixture');
    try {
        const {response} = await apiFootballGet<AfFixtureResponse[]>('fixtures', {id: providerId});
        run.requests += 1;
        await upsertFixtures(db, run, response, {withDetails: true});
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

export interface UpsertOptions {
    withDetails?: boolean;
    /** Only events are stored from the payload (live feed for basic leagues). */
    eventsOnly?: boolean;
}

export async function upsertFixtures(db: FootballClient, run: SyncRun, fixtures: AfFixtureResponse[], options: UpsertOptions = {}) {
    if (fixtures.length === 0) return;

    const leagues = await ensureLeagues(
        db,
        fixtures.map((f) => ({id: f.league.id, name: f.league.name, country: f.league.country, logo: f.league.logo})),
        (id) => (isFeaturedProviderId(id) ? 'featured' : 'basic'),
    );

    const seasonKey = new Map<string, {leagueId: number; year: number}>();
    for (const f of fixtures) {
        const league = leagues.get(f.league.id);
        if (league) seasonKey.set(`${league.id}:${f.league.season}`, {leagueId: league.id, year: f.league.season});
    }
    const seasons = await ensureSeasons(db, [...seasonKey.values()], run);

    const teams = await ensureTeams(
        db,
        fixtures.flatMap((f) => [
            {id: f.teams.home.id, name: f.teams.home.name, logo: f.teams.home.logo},
            {id: f.teams.away.id, name: f.teams.away.name, logo: f.teams.away.logo},
        ]),
    );

    const fixtureRows = [];
    const skipped: number[] = [];
    for (const f of fixtures) {
        const league = leagues.get(f.league.id);
        const season = league ? seasons.get(`${league.id}:${f.league.season}`) : undefined;
        const homeId = teams.get(f.teams.home.id);
        const awayId = teams.get(f.teams.away.id);
        if (!league || !season || !homeId || !awayId) {
            skipped.push(f.fixture.id);
            continue;
        }
        const state = mapFixtureState(f.fixture.status?.short);
        if (state === 'unknown') run.warn(`fixture ${f.fixture.id}: unknown status ${f.fixture.status?.short}`);
        fixtureRows.push({
            provider_id: f.fixture.id,
            league_id: league.id,
            season_id: season,
            round: f.league.round ?? null,
            stage: null,
            starting_at: new Date(f.fixture.date).toISOString(),
            state,
            minute: extractMinute(f.fixture.status, state),
            home_team_id: homeId,
            away_team_id: awayId,
            home_score: f.goals?.home ?? null,
            away_score: f.goals?.away ?? null,
            home_score_ht: f.score?.halftime?.home ?? null,
            away_score_ht: f.score?.halftime?.away ?? null,
            venue_name: f.fixture.venue?.name ?? null,
            referee: f.fixture.referee ?? null,
            last_synced_at: new Date().toISOString(),
            // Full detail stored in this pass: events, lineups, stats, ratings.
            ...(options.withDetails && !options.eventsOnly ? {details_synced_at: new Date().toISOString()} : {}),
        });
    }
    if (skipped.length > 0) {
        run.warn(`skipped ${skipped.length} fixture(s) with unresolved league/season/teams: ${skipped.slice(0, 10).join(',')}`);
    }

    for (const rows of chunk(fixtureRows, 300)) {
        const {error} = await db.from('fixtures').upsert(rows, {onConflict: 'provider_id'});
        if (error) failSync('fixtures.upsert', error);
    }
    run.bump('fixtures', fixtureRows.length);

    if (!options.withDetails) return;

    const fixtureIds: IdMap = new Map();
    for (const ids of chunk(fixtureRows.map((r) => r.provider_id), 500)) {
        const {data: idRows, error: idError} = await db.from('fixtures').select('id,provider_id').in('provider_id', ids);
        if (idError) failSync('fixtures.select', idError);
        for (const r of idRows ?? []) fixtureIds.set(r.provider_id as number, r.id as number);
    }

    for (const f of fixtures) {
        const fixtureId = fixtureIds.get(f.fixture.id);
        if (!fixtureId) continue;
        try {
            await upsertDetails(db, run, f, fixtureId, teams, options.eventsOnly === true, leagues.get(f.league.id));
        } catch (error) {
            run.warn(`fixture ${f.fixture.id} details: ${(error as Error).message}`);
        }
    }
}

function uniqueBy<T>(rows: T[], key: (row: T) => string): T[] {
    const map = new Map<string, T>();
    for (const row of rows) map.set(key(row), row);
    return [...map.values()];
}

async function upsertDetails(db: FootballClient, run: SyncRun, f: AfFixtureResponse, fixtureId: number, teams: IdMap, eventsOnly: boolean, league?: LeagueRef) {
    const events = mapEvents(f.events);
    const lineups = eventsOnly ? [] : mapLineups(f.lineups);
    const playerStats = eventsOnly ? [] : mapPlayerStats(f.players);

    // Players referenced anywhere must exist first (FK).
    const refs: MinimalPlayer[] = [];
    for (const e of events) {
        if (e.providerPlayerId) refs.push({id: e.providerPlayerId, name: e.playerName});
        if (e.providerRelatedPlayerId) refs.push({id: e.providerRelatedPlayerId, name: e.relatedPlayerName});
    }
    for (const l of lineups) refs.push({id: l.providerPlayerId, name: l.playerName});
    for (const s of playerStats) refs.push({id: s.providerPlayerId, name: s.playerName});
    const players = await ensurePlayers(db, refs);

    // Events: no provider id, so replace the whole timeline of the fixture.
    if (Array.isArray(f.events)) {
        const {error: deleteError} = await db.from('fixture_events').delete().eq('fixture_id', fixtureId);
        if (deleteError) failSync('fixture_events.delete', deleteError);
        const rows = events.map((e) => ({
            fixture_id: fixtureId,
            team_id: e.providerTeamId ? teams.get(e.providerTeamId) ?? null : null,
            player_id: e.providerPlayerId ? players.get(e.providerPlayerId) ?? null : null,
            related_player_id: e.providerRelatedPlayerId ? players.get(e.providerRelatedPlayerId) ?? null : null,
            player_name: e.playerName,
            related_player_name: e.relatedPlayerName,
            type: e.type,
            minute: e.minute,
            extra_minute: e.extraMinute,
            info: e.info,
            sort_order: e.sortOrder,
        }));
        if (rows.length > 0) {
            const {error} = await db.from('fixture_events').insert(rows);
            if (error) failSync('fixture_events.insert', error);
        }
        run.bump('events', rows.length);
    }

    if (eventsOnly) return;

    // Team statistics
    const statRows = [...mapTeamStats(f.statistics).entries()]
        .filter(([teamProviderId]) => teams.has(teamProviderId))
        .map(([teamProviderId, s]) => ({fixture_id: fixtureId, team_id: teams.get(teamProviderId)!, ...s}));
    if (statRows.length > 0) {
        const {error} = await db.from('fixture_team_stats').upsert(statRows, {onConflict: 'fixture_id,team_id'});
        if (error) failSync('fixture_team_stats.upsert', error);
        run.bump('team_stats', statRows.length);
    }

    // Lineups
    // The feed sometimes lists a player twice (bench and pitch, or in both
    // teams' blocks): one row per key, last one wins, or Postgres rejects
    // the whole upsert ("cannot affect row a second time").
    const lineupRows = uniqueBy(lineups
        .filter((l) => teams.has(l.providerTeamId) && players.has(l.providerPlayerId))
        .map((l) => ({
            fixture_id: fixtureId,
            team_id: teams.get(l.providerTeamId)!,
            player_id: players.get(l.providerPlayerId)!,
            is_expected: false,
            is_starter: l.isStarter,
            formation: l.formation,
            formation_position: l.formationPosition,
            jersey_number: l.jerseyNumber,
        })), (r) => `${r.team_id}:${r.player_id}`);
    if (lineupRows.length > 0) {
        const {error} = await db.from('lineups').upsert(lineupRows, {onConflict: 'fixture_id,team_id,player_id,is_expected'});
        if (error) failSync('lineups.upsert', error);
        run.bump('lineups', lineupRows.length);
    }

    // Player statistics
    const playerStatRows = uniqueBy(playerStats
        .filter((s) => teams.has(s.providerTeamId) && players.has(s.providerPlayerId))
        .map(({providerPlayerId, providerTeamId, playerName: _name, ...s}) => {
            void _name;
            return {fixture_id: fixtureId, player_id: players.get(providerPlayerId)!, team_id: teams.get(providerTeamId)!, ...s};
        }), (r) => String(r.player_id));
    if (playerStatRows.length > 0) {
        const {error} = await db.from('fixture_player_stats').upsert(playerStatRows, {onConflict: 'fixture_id,player_id'});
        if (error) failSync('fixture_player_stats.upsert', error);
        run.bump('player_stats', playerStatRows.length);
    }

    if (isLiveState(mapFixtureState(f.fixture.status?.short))) run.bump(league?.tier === 'featured' ? 'live_featured' : 'live_basic');
}
