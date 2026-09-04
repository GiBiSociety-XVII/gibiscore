import 'server-only';
import {historySeasonCount} from '@/lib/football/competitions';
import {apiFootballGet, dailyRemaining, quotaAllows, waitForMinuteWindow} from '@/lib/api-football/client';
import {mapPlayerProfile, mapPlayerSeason} from '@/lib/api-football/mappers';
import type {AfPlayerResponse} from '@/lib/api-football/types';
import {
    chunk,
    ensureTeams,
    failSync,
    featuredSeasons,
    finishRun,
    footballClient,
    idMap,
    startRun,
    type FootballClient,
    type SeasonRow,
    type SyncRun,
} from './context';

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
/** No new season is started after this, well inside the route's maxDuration. */
/** Requests to leave for the rest of the day: live scores, fixtures, injuries. */
const DAILY_RESERVE = 1500;
const DEADLINE_MS = 200_000;
const RETRY = {retryOnMinuteLimit: true};

export type PlayerSeasonsScope = 'auto' | 'current' | 'history' | 'all';

export interface PlayerSeasonsOptions {
    /** Max API requests for this run; a season already started is completed anyway. */
    budget?: number;
    /**
     * auto (default): current seasons with a matchday finished since the
     * last sync (or older than 7 days), then past seasons never imported.
     * current: every current season now. history: past seasons never
     * imported. all: everything, regardless of freshness.
     */
    scope?: PlayerSeasonsScope;
    /** Only this season year (e.g. 2024), forced. */
    year?: number;
    /** Only these league slugs (e.g. ['serie-a']). */
    leagues?: string[];
}

/**
 * sync-player-seasons (hourly)
 *
 * Season aggregates of every player of the featured leagues, as computed
 * by API-Football (/players?league&season, ~20 players per page, ~35
 * pages per league-season): appearances, minutes, rating, goals, assists,
 * shots, passes, tackles, duels, dribbles, fouls, cards, penalties. Stored
 * in player_season_stats so rankings and formulas read only our database.
 *
 * Current season: refreshed after each matchday (a fixture finished since
 * the previous run) and in any case weekly. Past seasons: imported once,
 * within the request budget, until API_FOOTBALL_HISTORY_SEASONS are done.
 */
export async function syncPlayerSeasons(options: PlayerSeasonsOptions = {}): Promise<SyncRun> {
    const db = footballClient();
    const run = await startRun(db, 'sync-player-seasons');
    const startedAt = Date.now();
    try {
        const budget = options.budget ?? 500;
        const scope = options.scope ?? 'auto';
        let seasons = await featuredSeasons(db, historySeasonCount(), run);
        if (options.leagues && options.leagues.length > 0) seasons = seasons.filter((s) => options.leagues!.includes(s.leagueSlug));
        if (options.year !== undefined) seasons = seasons.filter((s) => s.year === options.year);

        const due: SeasonRow[] = [];
        for (const s of seasons) {
            if (options.year !== undefined || scope === 'all') due.push(s);
            else if (s.isCurrent && scope !== 'history' && (scope === 'current' || (await currentSeasonDue(db, s)))) due.push(s);
            else if (!s.isCurrent && scope !== 'current' && s.playersSyncedAt === null) due.push(s);
        }
        run.bump('seasons_due', due.length);

        // A league-season costs up to a hundred requests: never start on a day whose quota
        // the live and fixture jobs still need.
        const remaining = due.length > 0 ? await dailyRemaining() : null;
        if (!quotaAllows(remaining, DAILY_RESERVE)) {
            run.warn(`daily quota low (${remaining} left): player seasons wait for tomorrow`);
            run.bump('seasons_skipped_quota', due.length);
            await finishRun(db, run, 'ok');
            return run;
        }

        let failed = 0;
        for (const s of due) {
            if (run.requests >= budget || Date.now() - startedAt > DEADLINE_MS) {
                run.bump('seasons_deferred');
                continue;
            }
            // One season failing (a bad payload, a rejected row) must not stop the others, nor
            // make the run retry every season on the hour.
            try {
                const players = await syncSeason(db, run, s);
                const {error} = await db.from('seasons').update({players_synced_at: new Date().toISOString()}).eq('id', s.id);
                if (error) failSync('seasons.update', error);
                run.bump('seasons_synced');
                console.info(`[sync-player-seasons] ${s.leagueSlug} ${s.year}: ${players} players, ${run.requests} requests so far`);
            } catch (error) {
                failed += 1;
                run.bump('seasons_failed');
                run.warn(`${s.leagueSlug} ${s.year}: ${(error as Error).message}`);
            }
        }

        await finishRun(db, run, failed > 0 && run.counters.seasons_synced === undefined ? 'error' : 'ok', failed > 0 ? `${failed} season(s) failed, see warnings` : undefined);
        return run;
    } catch (error) {
        await finishRun(db, run, 'error', (error as Error).message);
        throw error;
    }
}

/** A current season is due when a fixture finished since the last sync (and ended at least ~2h ago), or weekly. */
async function currentSeasonDue(db: FootballClient, s: SeasonRow): Promise<boolean> {
    if (!s.playersSyncedAt) return true;
    const syncedAt = Date.parse(s.playersSyncedAt);
    if (Date.now() - syncedAt > 7 * DAY) return true;
    const {count, error} = await db
        .from('fixtures')
        .select('id', {count: 'exact', head: true})
        .eq('season_id', s.id)
        .eq('state', 'finished')
        .gt('starting_at', new Date(syncedAt - 3 * HOUR).toISOString())
        .lt('starting_at', new Date(Date.now() - 3 * HOUR).toISOString());
    if (error) failSync('fixtures.count', error);
    return (count ?? 0) > 0;
}

/** One page, sequentially: the per-minute allowance of the plan is shared with the live job. */
async function fetchPage(run: SyncRun, s: SeasonRow, page: number) {
    await waitForMinuteWindow();
    const envelope = await apiFootballGet<AfPlayerResponse[]>('players', {league: s.leagueProviderId, season: s.year, page}, RETRY);
    run.requests += 1;
    return envelope;
}

/** Every page of one league-season; returns the number of players stored. */
async function syncSeason(db: FootballClient, run: SyncRun, s: SeasonRow): Promise<number> {
    const first = await fetchPage(run, s, 1);
    const pages: AfPlayerResponse[][] = [first.response];
    const total = first.paging?.total ?? 1;
    for (let page = 2; page <= total; page += 1) {
        const envelope = await fetchPage(run, s, page);
        pages.push(envelope.response);
    }
    const entries = pages.flat();
    const unique = new Map<number, AfPlayerResponse>();
    for (const e of entries) if (e?.player?.id) unique.set(e.player.id, e);
    if (unique.size === 0) {
        run.warn(`${s.leagueSlug} ${s.year}: no player returned`);
        return 0;
    }

    // Profiles: this is the richest player payload we get, it wins over squads.
    const profiles = [...unique.values()].map((e) => mapPlayerProfile(e.player, e.statistics?.[0]?.games?.position ?? null));
    for (const rows of chunk(profiles, 300)) {
        const {error} = await db.from('players').upsert(rows, {onConflict: 'provider_id'});
        if (error) failSync('players.upsert', error);
    }
    run.bump('players', profiles.length);

    const stats = [...unique.values()].flatMap((e) =>
        (e.statistics ?? [])
            .filter((st) => st?.league?.id === s.leagueProviderId && st.league.season === s.year && st.team?.id)
            .map((st) => ({playerProviderId: e.player.id, st})),
    );
    const teams = await ensureTeams(db, stats.map(({st}) => ({id: st.team.id, name: st.team.name, logo: st.team.logo})));
    const players = await idMap(db, 'players', [...unique.keys()]);

    // The feed can list the same player/team twice (pagination overlaps,
    // duplicated statistics blocks): keep one row per key or Postgres
    // rejects the whole upsert ("cannot affect row a second time").
    const byKey = new Map<string, Record<string, unknown>>();
    const rawByKey = new Map<string, Record<string, unknown>>();
    for (const {playerProviderId, st} of stats) {
        const playerId = players.get(playerProviderId);
        const teamId = teams.get(st.team.id);
        if (!playerId || !teamId) continue;
        // The provider's full payload goes to its own table: nobody reads it on the site.
        const {raw, ...row} = mapPlayerSeason(st);
        byKey.set(`${playerId}:${teamId}`, {player_id: playerId, team_id: teamId, league_id: s.leagueId, season_id: s.id, ...row});
        rawByKey.set(`${playerId}:${teamId}`, {player_id: playerId, team_id: teamId, league_id: s.leagueId, season_year: row.season_year, raw, synced_at: row.synced_at});
    }
    const rows = [...byKey.values()];
    for (const group of chunk(rows, 300)) {
        const {error} = await db.from('player_season_stats').upsert(group, {onConflict: 'player_id,team_id,league_id,season_year'});
        if (error) failSync('player_season_stats.upsert', error);
    }
    for (const group of chunk([...rawByKey.values()], 100)) {
        const {error} = await db.from('player_season_raw').upsert(group, {onConflict: 'player_id,team_id,league_id,season_year'});
        if (error) failSync('player_season_raw.upsert', error);
    }
    run.bump('player_seasons', rows.length);
    return unique.size;
}
