import 'server-only';
import {apiFootballGet} from '@/lib/api-football/client';
import {mapStandings} from '@/lib/api-football/mappers';
import type {AfStandingsResponse} from '@/lib/api-football/types';
import {currentSeasons, ensureTeams, failSync, finishRun, footballClient, startRun, type SyncRun} from './context';

/**
 * sync-standings (every 30 minutes)
 *
 * One request per current season. Cups without a table return nothing and
 * are skipped. Group stages (Champions League league phase, cup groups)
 * keep their group name; a plain league table is stored with group ''.
 */
export async function syncStandings(): Promise<SyncRun> {
    const db = footballClient();
    const run = await startRun(db, 'sync-standings');
    try {
        for (const season of await currentSeasons(db)) {
            const {response} = await apiFootballGet<AfStandingsResponse[]>('standings', {league: season.leagueProviderId, season: season.year});
            run.requests += 1;
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
