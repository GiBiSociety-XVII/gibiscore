import 'server-only';
import {apiFootballGet, ApiFootballError} from '@/lib/api-football/client';
import type {AfInjuryResponse} from '@/lib/api-football/types';
import {allowance, currentSeasons, ensurePlayers, ensureTeams, failSync, finishRun, footballClient, startRun, type SyncRun} from './context';

/** A season with no match this far ahead has no one to report as missing. */
const LOOKAHEAD_MS = 7 * 24 * 3_600_000;

/**
 * sync-injuries (every 2 hours, featured leagues only: up to ~13 requests)
 *
 * One request per featured season with a match in the next seven days.
 * API-Football reports injuries and suspensions per upcoming fixture
 * ("Missing Fixture", "Questionable"); rows have no id, so the season's
 * list is replaced on every run. A season on a break costs nothing.
 */
export async function syncInjuries(): Promise<SyncRun> {
    const db = footballClient();
    const run = await startRun(db, 'sync-injuries');
    try {
        if (!(await allowance(db, run, 'routine'))) {
            await finishRun(db, run, 'ok');
            return run;
        }
        const seasons = await currentSeasons(db, 'featured');
        const {data: upcoming, error: upcomingError} = await db
            .from('fixtures')
            .select('season_id')
            .in('season_id', seasons.map((s) => s.id))
            .eq('state', 'scheduled')
            .gte('starting_at', new Date().toISOString())
            .lte('starting_at', new Date(Date.now() + LOOKAHEAD_MS).toISOString())
            .limit(5000);
        if (upcomingError) failSync('fixtures.select', upcomingError);
        const active = new Set((upcoming ?? []).map((r) => r.season_id as number));
        run.bump('seasons_on_break', seasons.length - seasons.filter((s) => active.has(s.id)).length);
        for (const season of seasons.filter((s) => active.has(s.id))) {
            let response: AfInjuryResponse[] = [];
            try {
                ({response} = await apiFootballGet<AfInjuryResponse[]>('injuries', {league: season.leagueProviderId, season: season.year}));
            } catch (error) {
                run.warn(`injuries ${season.leagueSlug}: ${(error as Error).message}`);
                if (error instanceof ApiFootballError && error.kind === 'quota') throw error;
                continue;
            } finally {
                run.requests += 1;
            }

            const teams = await ensureTeams(db, response.map((r) => ({id: r.team.id, name: r.team.name, logo: r.team.logo})));
            const players = await ensurePlayers(db, response.map((r) => ({id: r.player.id, name: r.player.name, photo: r.player.photo})));

            const {data: fixtureRows, error: fixtureError} = await db
                .from('fixtures')
                .select('id,provider_id')
                .in('provider_id', [...new Set(response.map((r) => r.fixture.id))]);
            if (fixtureError) failSync('fixtures.select', fixtureError);
            const fixtureIds = new Map<number, number>((fixtureRows ?? []).map((r) => [r.provider_id as number, r.id as number]));

            const {error: deleteError} = await db.from('sidelined').delete().eq('season_id', season.id).eq('source', 'fixture');
            if (deleteError) failSync('sidelined.delete', deleteError);

            // The provider repeats a listing for both sides of a fixture.
            const seen = new Set<string>();
            const rows = response
                .filter((r) => players.has(r.player.id) && !seen.has(`${r.player.id}:${r.fixture.id}`) && seen.add(`${r.player.id}:${r.fixture.id}`))
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
                    source: 'fixture',
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
