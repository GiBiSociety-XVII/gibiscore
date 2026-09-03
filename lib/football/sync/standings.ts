import 'server-only';
import {sportmonksPages} from '@/lib/sportmonks/client';
import {mapStanding} from '@/lib/sportmonks/mappers';
import type {SmStanding} from '@/lib/sportmonks/types';
import {ensureTeams, failSync, finishRun, footballClient, startRun, type SyncRun} from './context';

/**
 * sync-standings (every 30 minutes)
 *
 * One request per current season. Cups without a table simply return no
 * rows and are skipped.
 */
export async function syncStandings(): Promise<SyncRun> {
    const db = footballClient();
    const run = await startRun(db, 'sync-standings');
    try {
        const {data: seasons, error} = await db.from('seasons').select('id,sportmonks_id,name').eq('is_current', true);
        if (error) failSync('seasons.select', error);

        for (const season of seasons ?? []) {
            const standings: SmStanding[] = [];
            for await (const page of sportmonksPages<SmStanding>(`standings/seasons/${season.sportmonks_id}`, {
                include: 'participant;details.type;form;stage;group',
            })) {
                run.requests += 1;
                standings.push(...page);
            }
            if (standings.length === 0) {
                run.bump('seasons_without_table');
                continue;
            }

            const teams = await ensureTeams(db, standings.flatMap((s) => (s.participant ? [s.participant] : [])));
            const rows = standings
                .map(mapStanding)
                .filter((s) => teams.has(s.sportmonksTeamId))
                .map((s) => ({
                    season_id: season.id as number,
                    team_id: teams.get(s.sportmonksTeamId)!,
                    stage: s.stage,
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

            if (rows.every((r) => r.played === 0 && r.points === 0)) {
                run.warn(`season ${season.name}: every standing row is zero, check the details.type mapping`);
            }

            const {error: upsertError} = await db.from('standings').upsert(rows, {onConflict: 'season_id,stage,group,team_id'});
            if (upsertError) failSync('standings.upsert', upsertError);
            run.bump('standing_rows', rows.length);
        }

        await finishRun(db, run, 'ok');
        return run;
    } catch (error) {
        await finishRun(db, run, 'error', (error as Error).message);
        throw error;
    }
}
