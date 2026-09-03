import 'server-only';
import {apiFootballGet, ApiFootballError} from '@/lib/api-football/client';
import {mapStandings} from '@/lib/api-football/mappers';
import type {AfStandingsResponse} from '@/lib/api-football/types';
import {currentSeasons, ensureTeams, failSync, finishRun, footballClient, startRun, type SyncRun} from './context';

/**
 * sync-standings
 *
 * scope 'featured' (every 30 minutes): one request per featured season.
 * scope 'all' (daily): every current season whose league had a fixture in
 * the last 10 days or has one in the next 10, so dormant competitions cost
 * nothing. Cups without a table return nothing and are skipped.
 */
export async function syncStandings(scope: 'featured' | 'all' = 'featured'): Promise<SyncRun> {
    const db = footballClient();
    const run = await startRun(db, scope === 'all' ? 'sync-standings-all' : 'sync-standings');
    try {
        let seasons = await currentSeasons(db, scope === 'featured' ? 'featured' : undefined);

        if (scope === 'all') {
            const from = new Date(Date.now() - 10 * 86_400_000).toISOString();
            const to = new Date(Date.now() + 10 * 86_400_000).toISOString();
            const {data, error} = await db.from('fixtures').select('season_id').gte('starting_at', from).lte('starting_at', to).limit(20000);
            if (error) failSync('fixtures.select', error);
            const active = new Set((data ?? []).map((r) => r.season_id as number));
            seasons = seasons.filter((s) => active.has(s.id));
        }
        run.bump('seasons', seasons.length);

        for (const season of seasons) {
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
            if (!league || !league.standings || league.standings.length === 0) {
                run.bump('seasons_without_table');
                continue;
            }

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
                }));

            const {error} = await db.from('standings').upsert(dbRows, {onConflict: 'season_id,stage,group,team_id'});
            if (error) failSync('standings.upsert', error);
            run.bump('standing_rows', dbRows.length);
        }

        await finishRun(db, run, 'ok');
        return run;
    } catch (error) {
        await finishRun(db, run, 'error', (error as Error).message);
        throw error;
    }
}
