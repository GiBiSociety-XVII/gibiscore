import 'server-only';
import {apiFootballGet, ApiFootballError} from '@/lib/api-football/client';
import {mapStandings} from '@/lib/api-football/mappers';
import type {AfStandingsResponse} from '@/lib/api-football/types';
import {fetchAll} from '@/lib/db/paginate';
import {allowance, currentSeasons, ensureTeams, failSync, finishRun, footballClient, startRun, type SeasonRef, type SyncRun} from './context';

const HOUR = 3_600_000;
/** A table with nothing new for this long is refreshed anyway (a walkover, a points deduction). */
const REFRESH_ANYWAY_MS = 24 * HOUR;
/** Requests one 'all' run may spend on the basic tier: the rest waits for tomorrow. */
const ALL_MAX_REQUESTS = 300;

/**
 * sync-standings
 *
 * A table only changes when a match ends, so a season is asked only when
 * a fixture of its finished since the table was last stored (or a day has
 * passed). scope 'featured' (hourly): the featured seasons, ~13 requests
 * on a matchday, none otherwise. scope 'all' (daily): every current season
 * with a result in the last 24 hours, up to 300 requests. Cups without a
 * table return nothing and are marked like the others.
 */
export async function syncStandings(scope: 'featured' | 'all' = 'featured'): Promise<SyncRun> {
    const db = footballClient();
    const run = await startRun(db, scope === 'all' ? 'sync-standings-all' : 'sync-standings');
    try {
        if (!(await allowance(db, run, 'routine'))) {
            await finishRun(db, run, 'ok');
            return run;
        }
        const seasons = await dueSeasons(db, scope);
        run.bump('seasons', seasons.length);

        for (const season of seasons) {
            if (scope === 'all' && run.requests >= ALL_MAX_REQUESTS) {
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

type SeasonWithMark = SeasonRef & {standingsSyncedAt: string | null};

/**
 * Seasons whose table may have changed: a fixture finished since the last
 * store (kick-off after it minus three hours, and at least ~2h ago), or
 * never stored, or stored more than a day ago. The 'all' scope only looks
 * at the last 24 hours of results and leaves the featured tier to the
 * hourly run.
 */
async function dueSeasons(db: ReturnType<typeof footballClient>, scope: 'featured' | 'all'): Promise<SeasonWithMark[]> {
    const now = Date.now();
    const all = (await currentSeasons(db, scope === 'featured' ? 'featured' : undefined)).filter((s) => scope === 'featured' || s.tier !== 'featured');
    if (all.length === 0) return [];
    const marks = new Map<number, string | null>();
    for (let i = 0; i < all.length; i += 500) {
        const ids = all.slice(i, i + 500).map((s) => s.id);
        const {data, error} = await db.from('seasons').select('id,standings_synced_at').in('id', ids);
        if (error) failSync('seasons.select', error);
        for (const r of data ?? []) marks.set(r.id as number, (r.standings_synced_at as string | null) ?? null);
    }
    const seasons: SeasonWithMark[] = all.map((s) => ({...s, standingsSyncedAt: marks.get(s.id) ?? null}));

    // Results of the window, by season: one query, then decide in memory.
    const windowFrom = scope === 'all' ? now - 24 * HOUR : Math.min(...seasons.map((s) => (s.standingsSyncedAt ? Date.parse(s.standingsSyncedAt) : now) - 3 * HOUR));
    const finished = await fetchAll(
        (a, b) =>
            db
                .from('fixtures')
                .select('season_id,starting_at')
                .eq('state', 'finished')
                .gte('starting_at', new Date(Math.max(windowFrom, now - 8 * 24 * HOUR)).toISOString())
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

    return seasons.filter((s) => {
        const syncedAt = s.standingsSyncedAt ? Date.parse(s.standingsSyncedAt) : null;
        const result = lastResult.get(s.id);
        if (scope === 'all') return result !== undefined && (syncedAt === null || result > syncedAt - 3 * HOUR);
        if (syncedAt === null || now - syncedAt > REFRESH_ANYWAY_MS) return true;
        return result !== undefined && result > syncedAt - 3 * HOUR;
    });
}
