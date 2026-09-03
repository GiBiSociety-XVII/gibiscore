import 'server-only';
import {liveFilter} from '@/lib/football/competitions';
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
    currentSeasons,
    ensurePlayers,
    ensureTeams,
    failSync,
    finishRun,
    footballClient,
    leagueIdMap,
    startRun,
    type FootballClient,
    type IdMap,
    type MinimalPlayer,
    type SyncRun,
} from './context';

function ymd(date: Date): string {
    return date.toISOString().slice(0, 10);
}

/**
 * sync-fixtures (hourly)
 *
 * One request per current season: the schedule from yesterday to +14 days.
 * Upserts fixtures and creates teams on the fly. Detail data (events,
 * statistics, lineups, player stats) is the live job's work.
 */
export async function syncFixtures(options: {fromDaysAgo?: number; toDaysAhead?: number} = {}): Promise<SyncRun> {
    const db = footballClient();
    const run = await startRun(db, 'sync-fixtures');
    try {
        const now = new Date();
        const from = ymd(new Date(now.getTime() - (options.fromDaysAgo ?? 1) * 86_400_000));
        const to = ymd(new Date(now.getTime() + (options.toDaysAhead ?? 14) * 86_400_000));

        const seasons = await currentSeasons(db);
        if (seasons.length === 0) {
            run.warn('no current season in the database: run sync-competitions first');
        }

        const fixtures: AfFixtureResponse[] = [];
        for (const season of seasons) {
            const {response} = await apiFootballGet<AfFixtureResponse[]>('fixtures', {
                league: season.leagueProviderId,
                season: season.year,
                from,
                to,
            });
            run.requests += 1;
            fixtures.push(...response);
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
 * 1. One request lists everything in play for our leagues.
 * 2. Those fixtures, plus the ones our DB still marks as live or that should
 *    have kicked off in the last 3 hours, are re-fetched by id (20 per
 *    request): the by-id response carries events, lineups, statistics and
 *    player stats.
 */
export async function syncLive(): Promise<SyncRun> {
    const db = footballClient();
    const run = await startRun(db, 'sync-live');
    try {
        const {response: inplay} = await apiFootballGet<AfFixtureResponse[]>('fixtures', {live: liveFilter()});
        run.requests += 1;
        run.bump('inplay', inplay.length);

        const ids = new Set<number>(inplay.map((f) => f.fixture.id));

        const {data: staleRows, error} = await db
            .from('fixtures')
            .select('provider_id')
            .in('state', ['live', 'half_time', 'extra_time', 'penalties']);
        if (error) failSync('fixtures.select', error);
        for (const r of staleRows ?? []) ids.add(r.provider_id as number);

        const threeHoursAgo = new Date(Date.now() - 3 * 3_600_000).toISOString();
        const {data: dueRows, error: dueError} = await db
            .from('fixtures')
            .select('provider_id')
            .eq('state', 'scheduled')
            .lte('starting_at', new Date().toISOString())
            .gte('starting_at', threeHoursAgo);
        if (dueError) failSync('fixtures.select', dueError);
        for (const r of dueRows ?? []) ids.add(r.provider_id as number);

        const detailed: AfFixtureResponse[] = [];
        for (const group of chunk([...ids], 20)) {
            const {response} = await apiFootballGet<AfFixtureResponse[]>('fixtures', {ids: group.join('-')});
            run.requests += 1;
            detailed.push(...response);
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

async function upsertFixtures(db: FootballClient, run: SyncRun, fixtures: AfFixtureResponse[], options: {withDetails?: boolean} = {}) {
    if (fixtures.length === 0) return;

    const leagues = await leagueIdMap(db, [...new Set(fixtures.map((f) => f.league.id))]);

    // Seasons by (league db id, year); create placeholders for unknown ones.
    const {data: seasonRows, error: seasonError} = await db.from('seasons').select('id,league_id,year');
    if (seasonError) failSync('seasons.select', seasonError);
    const seasonId = new Map<string, number>((seasonRows ?? []).map((r) => [`${r.league_id}:${r.year}`, r.id as number]));
    const missing = new Map<string, {league_id: number; year: number}>();
    for (const f of fixtures) {
        const leagueId = leagues.get(f.league.id);
        if (leagueId && !seasonId.has(`${leagueId}:${f.league.season}`)) {
            missing.set(`${leagueId}:${f.league.season}`, {league_id: leagueId, year: f.league.season});
        }
    }
    if (missing.size > 0) {
        const rows = [...missing.values()].map((m) => ({...m, name: String(m.year), is_current: false}));
        const {data: created, error} = await db.from('seasons').upsert(rows, {onConflict: 'league_id,year'}).select('id,league_id,year');
        if (error) failSync('seasons.upsert', error);
        for (const r of created ?? []) seasonId.set(`${r.league_id}:${r.year}`, r.id as number);
        run.warn(`created ${rows.length} placeholder season(s); run sync-competitions to name them`);
    }

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
        const leagueId = leagues.get(f.league.id);
        const season = leagueId ? seasonId.get(`${leagueId}:${f.league.season}`) : undefined;
        const homeId = teams.get(f.teams.home.id);
        const awayId = teams.get(f.teams.away.id);
        if (!leagueId || !season || !homeId || !awayId) {
            skipped.push(f.fixture.id);
            continue;
        }
        const state = mapFixtureState(f.fixture.status?.short);
        if (state === 'unknown') run.warn(`fixture ${f.fixture.id}: unknown status ${f.fixture.status?.short}`);
        fixtureRows.push({
            provider_id: f.fixture.id,
            league_id: leagueId,
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
            raw: options.withDetails ? stripRaw(f) : undefined,
            last_synced_at: new Date().toISOString(),
        });
    }
    if (skipped.length > 0) {
        run.warn(`skipped ${skipped.length} fixture(s) of leagues not in the database: ${skipped.slice(0, 10).join(',')}`);
    }

    for (const rows of chunk(fixtureRows, 200)) {
        const {error} = await db.from('fixtures').upsert(rows, {onConflict: 'provider_id'});
        if (error) failSync('fixtures.upsert', error);
    }
    run.bump('fixtures', fixtureRows.length);

    if (!options.withDetails) return;

    const {data: idRows, error: idError} = await db
        .from('fixtures')
        .select('id,provider_id')
        .in('provider_id', fixtureRows.map((r) => r.provider_id));
    if (idError) failSync('fixtures.select', idError);
    const fixtureIds: IdMap = new Map((idRows ?? []).map((r) => [r.provider_id as number, r.id as number]));

    for (const f of fixtures) {
        const fixtureId = fixtureIds.get(f.fixture.id);
        if (!fixtureId) continue;
        try {
            await upsertDetails(db, run, f, fixtureId, teams);
        } catch (error) {
            run.warn(`fixture ${f.fixture.id} details: ${(error as Error).message}`);
        }
    }
}

/** Keep the raw payload small: drop the bulky parts we already normalised. */
function stripRaw(f: AfFixtureResponse): Record<string, unknown> {
    return {fixture: f.fixture, league: f.league, teams: f.teams, goals: f.goals, score: f.score};
}

async function upsertDetails(db: FootballClient, run: SyncRun, f: AfFixtureResponse, fixtureId: number, teams: IdMap) {
    const events = mapEvents(f.events);
    const lineups = mapLineups(f.lineups);
    const playerStats = mapPlayerStats(f.players);

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
    if (f.events !== undefined) {
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
    const lineupRows = lineups
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
        }));
    if (lineupRows.length > 0) {
        const {error} = await db.from('lineups').upsert(lineupRows, {onConflict: 'fixture_id,team_id,player_id,is_expected'});
        if (error) failSync('lineups.upsert', error);
        run.bump('lineups', lineupRows.length);
    }

    // Player statistics
    const playerStatRows = playerStats
        .filter((s) => teams.has(s.providerTeamId) && players.has(s.providerPlayerId))
        .map(({providerPlayerId, providerTeamId, playerName: _name, ...s}) => {
            void _name;
            return {fixture_id: fixtureId, player_id: players.get(providerPlayerId)!, team_id: teams.get(providerTeamId)!, ...s};
        });
    if (playerStatRows.length > 0) {
        const {error} = await db.from('fixture_player_stats').upsert(playerStatRows, {onConflict: 'fixture_id,player_id'});
        if (error) failSync('fixture_player_stats.upsert', error);
        run.bump('player_stats', playerStatRows.length);
    }

    if (isLiveState(mapFixtureState(f.fixture.status?.short))) run.bump('live');
}
