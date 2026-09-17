import 'server-only';
import {apiFootballGet, ApiFootballError} from '@/lib/api-football/client';
import {mapStandings} from '@/lib/api-football/mappers';
import type {AfStandingsResponse} from '@/lib/api-football/types';
import {provides} from '@/lib/football/coverage';
import {fetchAll} from '@/lib/db/paginate';
import {allowance, currentSeasons, ensureTeams, failSync, finishRun, footballClient, startRun, type SeasonRef, type SyncRun} from './context';

const HOUR = 3_600_000;
/** A featured table with nothing new for this long is refreshed anyway (a walkover, a points deduction). */
const REFRESH_ANYWAY_MS = 24 * HOUR;
/** Results this far back decide which tables moved: a basic league never stored gets its table if it played this week. */
const RESULTS_WINDOW_MS = 8 * 24 * HOUR;
/** Requests one run may spend on the basic tier: the rest waits for the next hour. */
const BASIC_MAX_REQUESTS = 300;

/**
 * sync-standings (hourly)
 *
 * A table only changes when a match ends, so a season is asked only when
 * a fixture of its finished since the table was last stored. scope
 * 'featured': the featured seasons only, ~13 requests on a matchday, none
 * otherwise (and once a day regardless). scope 'all' (the cron): the
 * featured ones first, then every basic season whose league the provider
 * covers with a table (lib/football/coverage.ts) and a result since its
 * last store, up to 300 requests a run. Cups without a table return
 * nothing and are marked like the others.
 */
export async function syncStandings(scope: 'featured' | 'all' = 'all'): Promise<SyncRun> {
    const db = footballClient();
    const run = await startRun(db, scope === 'all' ? 'sync-standings-all' : 'sync-standings');
    try {
        if (!(await allowance(db, run, 'routine'))) {
            await finishRun(db, run, 'ok');
            return run;
        }
        const seasons = await dueSeasons(db, scope);
        run.bump('seasons', seasons.length);

        let basicRequests = 0;
        for (const season of seasons) {
            if (season.tier === 'basic' && basicRequests >= BASIC_MAX_REQUESTS) {
                run.bump('seasons_deferred');
                continue;
            }
            let response: AfStandingsResponse[] = [];
            try {
                ({response} = await apiFootballGet<AfStandingsResponse[]>('standings', {league: season.leagueProviderId, season: season.year}));
            } catch (error) {
                run.warn(`standings ${season.leagueSlug} ${season.year}: ${(error as Error).message}`);
                if (error instanceof ApiFootballError && error.kind === 'quota') throw error;
                continue;
            } finally {
                run.requests += 1;
                if (season.tier === 'basic') basicRequests += 1;
            }
            const league = response[0]?.league;
            if (league && league.standings && league.standings.length > 0) {
                const rows = mapStandings(league.standings, league.name);
                const teams = await ensureTeams(
                    db,
                    league.standings.flat().map((s) => ({id: s.team.id, name: s.team.name, logo: s.team.logo})),
                );
                const dbRows = rows
                    .filter((s) => teams.has(s.providerTeamId))
                    .map((s) => ({
                        season_id: season.id,
                        team_id: teams.get(s.providerTeamId)!,
                        stage: 'regular',
                        group: s.group,
                        position: s.position,
                        played: s.played,
                        won: s.won,
                        drawn: s.drawn,
                        lost: s.lost,
                        goals_for: s.goalsFor,
                        goals_against: s.goalsAgainst,
                        points: s.points,
                        form: s.form,
                        description: s.description,
                    }));
                const {error} = await db.from('standings').upsert(dbRows, {onConflict: 'season_id,stage,group,team_id'});
                if (error) failSync('standings.upsert', error);
                run.bump('standing_rows', dbRows.length);
                run.bump(season.tier === 'basic' ? 'basic_tables' : 'featured_tables');
            } else {
                run.bump('seasons_without_table');
            }
            const {error: markError} = await db.from('seasons').update({standings_synced_at: new Date().toISOString()}).eq('id', season.id);
            if (markError) failSync('seasons.update', markError);
        }

        await finishRun(db, run, 'ok');
        return run;
    } catch (error) {
        await finishRun(db, run, 'error', (error as Error).message);
        throw error;
    }
}

/**
 * Seasons whose table may have changed: a fixture finished since the last
 * store (kick-off after it minus three hours, and at least ~2h ago). A
 * featured season is also due when never stored or stored more than a day
 * ago; a basic one only with a result in the last eight days. Featured
 * first, then the basic ones whose table waited longest.
 */
async function dueSeasons(db: ReturnType<typeof footballClient>, scope: 'featured' | 'all'): Promise<SeasonRef[]> {
    const now = Date.now();
    const seasons = (await currentSeasons(db, scope === 'featured' ? 'featured' : undefined)).filter((s) => provides(s.tier, s.coverage, 'standings'));
    if (seasons.length === 0) return [];

    // Results of the window, by season: one query, then decide in memory.
    const finished = await fetchAll(
        (a, b) =>
            db
                .from('fixtures')
                .select('season_id,starting_at')
                .eq('state', 'finished')
                .gte('starting_at', new Date(now - RESULTS_WINDOW_MS).toISOString())
                .lte('starting_at', new Date(now - 2 * HOUR).toISOString())
                .order('id')
                .range(a, b),
        {max: 40000},
    );
    const lastResult = new Map<number, number>();
    for (const r of finished) {
        const at = Date.parse(r.starting_at as string);
        const seasonId = r.season_id as number;
        if ((lastResult.get(seasonId) ?? 0) < at) lastResult.set(seasonId, at);
    }

    return seasons
        .filter((s) => {
            const syncedAt = s.standingsSyncedAt ? Date.parse(s.standingsSyncedAt) : null;
            const result = lastResult.get(s.id);
            if (s.tier === 'featured' && (syncedAt === null || now - syncedAt > REFRESH_ANYWAY_MS)) return true;
            return result !== undefined && (syncedAt === null || result > syncedAt - 3 * HOUR);
        })
        .sort((a, b) => (a.tier === b.tier ? (a.standingsSyncedAt ?? '').localeCompare(b.standingsSyncedAt ?? '') : a.tier === 'featured' ? -1 : 1));
}
