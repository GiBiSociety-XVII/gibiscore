import 'server-only';
import {getCompetitions, isOverrideActive} from '@/lib/football/competitions';
import {apiFootballGet, ApiFootballError} from '@/lib/api-football/client';
import {currentSeason, positionName, seasonName, slugify} from '@/lib/api-football/mappers';
import type {AfLeagueResponse, AfSquadResponse, AfTeamResponse} from '@/lib/api-football/types';
import {ensureTeams, failSync, finishRun, footballClient, startRun, SyncError, type FootballClient, type SyncRun} from './context';

/**
 * sync-competitions (daily)
 *
 * 1. For every configured league: upsert the league and its current season.
 * 2. For every current season: upsert the teams taking part.
 * 3. For every team: upsert the squad (players + squad_members), unless
 *    API_FOOTBALL_SKIP_SQUADS=1 (players are still created lazily from
 *    lineups and events).
 *
 * Request budget: 6 leagues + 6 team lists + ~120 squads = ~130 requests.
 * With squads skipped: 12 requests, which fits the free plan while testing.
 */
export async function syncCompetitions(): Promise<SyncRun> {
    const db = footballClient();
    const run = await startRun(db, 'sync-competitions');

    try {
        const competitions = getCompetitions();
        if (isOverrideActive()) {
            run.warn(`API_FOOTBALL_LEAGUE_IDS=${process.env.API_FOOTBALL_LEAGUE_IDS} overrides the configured competitions`);
        }
        const skipSquads = process.env.API_FOOTBALL_SKIP_SQUADS === '1';

        const seasons: Array<{leagueDbId: number; leagueProviderId: number; slug: string; year: number}> = [];

        for (const comp of competitions) {
            const label = comp.slug ?? `league-${comp.providerId}`;
            let entry: AfLeagueResponse | undefined;
            try {
                const envelope = await apiFootballGet<AfLeagueResponse[]>('leagues', {id: comp.providerId});
                entry = envelope.response[0];
            } catch (error) {
                if (error instanceof ApiFootballError && error.kind === 'api') {
                    run.warn(`league ${label} (#${comp.providerId}): ${error.message}`);
                    continue;
                }
                throw error;
            } finally {
                run.requests += 1;
            }
            if (!entry) {
                run.warn(`league ${label} (#${comp.providerId}) not found in API-Football, check the id`);
                continue;
            }

            const slug = comp.slug ?? slugify(entry.league.name, entry.league.id);
            const {data: leagueRow, error} = await db
                .from('leagues')
                .upsert(
                    {
                        provider_id: entry.league.id,
                        name: entry.league.name,
                        short_code: null,
                        country: entry.country?.name ?? null,
                        type: entry.league.type?.toLowerCase() ?? null,
                        logo_url: entry.league.logo ?? null,
                        slug,
                        is_active: true,
                    },
                    {onConflict: 'provider_id'},
                )
                .select('id')
                .single();
            if (error) failSync('leagues.upsert', error);
            run.bump('leagues');
            console.info(`[sync-competitions] ${slug}: API-Football #${entry.league.id} = "${entry.league.name}" (${entry.country?.name})`);

            const season = currentSeason(entry.seasons);
            if (!season) {
                run.warn(`league ${slug} (#${entry.league.id}) has no seasons in the payload`);
                continue;
            }
            const coverage = season.coverage?.fixtures;
            if (coverage && (!coverage.events || !coverage.lineups || !coverage.statistics_players)) {
                run.warn(
                    `league ${slug} season ${season.year}: partial coverage (events=${coverage.events}, lineups=${coverage.lineups}, ` +
                        `team stats=${coverage.statistics_fixtures}, player stats=${coverage.statistics_players})`,
                );
            }

            await db.from('seasons').update({is_current: false}).eq('league_id', leagueRow.id as number);
            const {error: seasonError} = await db.from('seasons').upsert(
                {
                    league_id: leagueRow.id as number,
                    year: season.year,
                    name: seasonName(season),
                    is_current: true,
                    starting_at: season.start ?? null,
                    ending_at: season.end ?? null,
                },
                {onConflict: 'league_id,year'},
            );
            if (seasonError) failSync('seasons.upsert', seasonError);
            run.bump('seasons');
            seasons.push({leagueDbId: leagueRow.id as number, leagueProviderId: entry.league.id, slug, year: season.year});
        }

        if (seasons.length === 0) {
            throw new SyncError('no configured league could be loaded from API-Football; check API_FOOTBALL_KEY and the league ids');
        }

        const {data: seasonRows, error: seasonSelectError} = await db
            .from('seasons')
            .select('id,league_id,year')
            .eq('is_current', true);
        if (seasonSelectError) failSync('seasons.select', seasonSelectError);
        const seasonDbId = new Map<string, number>((seasonRows ?? []).map((r) => [`${r.league_id}:${r.year}`, r.id as number]));

        for (const season of seasons) {
            const dbSeasonId = seasonDbId.get(`${season.leagueDbId}:${season.year}`);
            if (!dbSeasonId) continue;

            const {response: teamEntries} = await apiFootballGet<AfTeamResponse[]>('teams', {league: season.leagueProviderId, season: season.year});
            run.requests += 1;
            const teamIds = await ensureTeams(
                db,
                teamEntries.map((t) => ({
                    id: t.team.id,
                    name: t.team.name,
                    logo: t.team.logo,
                    code: t.team.code ?? null,
                    country: t.team.country ?? null,
                    founded: t.team.founded ?? null,
                    venueName: t.venue?.name ?? null,
                })),
            );
            run.bump('teams', teamEntries.length);

            if (skipSquads) continue;
            for (const t of teamEntries) {
                const dbTeamId = teamIds.get(t.team.id);
                if (!dbTeamId) continue;
                try {
                    await syncSquad(db, run, dbSeasonId, t.team.id, dbTeamId);
                } catch (error) {
                    run.warn(`squad ${t.team.name} (#${t.team.id}): ${(error as Error).message}`);
                    if (error instanceof ApiFootballError && error.kind === 'quota') throw error;
                }
            }
        }

        await finishRun(db, run, 'ok');
        return run;
    } catch (error) {
        await finishRun(db, run, 'error', (error as Error).message);
        throw error;
    }
}

async function syncSquad(db: FootballClient, run: SyncRun, dbSeasonId: number, teamProviderId: number, dbTeamId: number) {
    const {response} = await apiFootballGet<AfSquadResponse[]>('players/squads', {team: teamProviderId});
    run.requests += 1;
    const members = response[0]?.players ?? [];
    if (members.length === 0) return;

    const playerRows = members.map((p) => {
        const name = p.name && p.name.trim() !== '' ? p.name : `Giocatore ${p.id}`;
        return {
            provider_id: p.id,
            name,
            position: positionName(p.position),
            age: p.age ?? null,
            image_url: p.photo ?? null,
            slug: slugify(name, p.id),
        };
    });
    const {error} = await db.from('players').upsert(playerRows, {onConflict: 'provider_id'});
    if (error) failSync('players.upsert', error);
    run.bump('players', playerRows.length);

    const {data: playerIds, error: selectError} = await db
        .from('players')
        .select('id,provider_id')
        .in('provider_id', members.map((m) => m.id));
    if (selectError) failSync('players.select', selectError);
    const idOf = new Map<number, number>((playerIds ?? []).map((r) => [r.provider_id as number, r.id as number]));

    const squadRows = members
        .filter((m) => idOf.has(m.id))
        .map((m) => ({
            season_id: dbSeasonId,
            team_id: dbTeamId,
            player_id: idOf.get(m.id)!,
            jersey_number: m.number ?? null,
            is_captain: false,
        }));
    if (squadRows.length > 0) {
        const {error: squadError} = await db.from('squad_members').upsert(squadRows, {onConflict: 'season_id,team_id,player_id'});
        if (squadError) failSync('squad_members.upsert', squadError);
        run.bump('squad_members', squadRows.length);
    }
}
