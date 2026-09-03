import 'server-only';
import {apiFootballGet} from '@/lib/api-football/client';
import type {AfInjuryResponse} from '@/lib/api-football/types';
import {currentSeasons, ensurePlayers, ensureTeams, failSync, finishRun, footballClient, startRun, type SyncRun} from './context';

/**
 * sync-injuries (every 6 hours)
 *
 * One request per current season. API-Football reports injuries and
 * suspensions per upcoming fixture ("Missing Fixture", "Questionable");
 * rows have no id, so the season's list is replaced on every run.
 */
export async function syncInjuries(): Promise<SyncRun> {
    const db = footballClient();
    const run = await startRun(db, 'sync-injuries');
    try {
        for (const season of await currentSeasons(db)) {
            const {response} = await apiFootballGet<AfInjuryResponse[]>('injuries', {league: season.leagueProviderId, season: season.year});
            run.requests += 1;

            const teams = await ensureTeams(db, response.map((r) => ({id: r.team.id, name: r.team.name, logo: r.team.logo})));
            const players = await ensurePlayers(db, response.map((r) => ({id: r.player.id, name: r.player.name, photo: r.player.photo})));

            const {data: fixtureRows, error: fixtureError} = await db
                .from('fixtures')
                .select('id,provider_id')
                .in('provider_id', [...new Set(response.map((r) => r.fixture.id))]);
            if (fixtureError) failSync('fixtures.select', fixtureError);
            const fixtureIds = new Map<number, number>((fixtureRows ?? []).map((r) => [r.provider_id as number, r.id as number]));

            const {error: deleteError} = await db.from('sidelined').delete().eq('season_id', season.id);
            if (deleteError) failSync('sidelined.delete', deleteError);

            const rows = response
                .filter((r) => players.has(r.player.id))
                .map((r) => ({
                    season_id: season.id,
                    player_id: players.get(r.player.id)!,
                    team_id: teams.get(r.team.id) ?? null,
                    fixture_id: fixtureIds.get(r.fixture.id) ?? null,
                    category: categorize(r.player.type, r.player.reason),
                    description: r.player.reason ?? null,
                    start_date: r.fixture.date ? r.fixture.date.slice(0, 10) : null,
                    end_date: null,
                    games_missed: null,
                }));
            if (rows.length > 0) {
                const {error} = await db.from('sidelined').insert(rows);
                if (error) failSync('sidelined.insert', error);
            }
            run.bump('sidelined', rows.length);
        }

        await finishRun(db, run, 'ok');
        return run;
    } catch (error) {
        await finishRun(db, run, 'error', (error as Error).message);
        throw error;
    }
}

/** 'injury' | 'suspension' | 'doubtful' | 'other' from the provider's free text. */
export function categorize(type: string | null, reason: string | null): string {
    const t = (type ?? '').toLowerCase();
    const r = (reason ?? '').toLowerCase();
    if (r.includes('suspend') || r.includes('red card') || r.includes('yellow')) return 'suspension';
    if (t.includes('questionable')) return 'doubtful';
    if (r.includes('injur') || r.includes('knock') || r.includes('problem') || r.includes('illness') || t.includes('missing')) return 'injury';
    return 'other';
}
