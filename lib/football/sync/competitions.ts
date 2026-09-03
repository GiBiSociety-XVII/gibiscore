import 'server-only';
import {getCompetitions, isValidationMode} from '@/lib/football/competitions';
import {sportmonksAccess, sportmonksGet, sportmonksPages, SportmonksError} from '@/lib/sportmonks/client';
import {positionName, slugify} from '@/lib/sportmonks/mappers';
import type {SmLeague, SmSeason, SmSquadMember, SmTeam} from '@/lib/sportmonks/types';
import {ensureTeams, failSync, footballClient, finishRun, startRun, SyncError, type SyncRun} from './context';

/**
 * sync-competitions (daily)
 *
 * 1. For every configured league: upsert the league and its current season.
 * 2. For every current season: upsert the teams taking part.
 * 3. For every team: upsert the squad (players + squad_members).
 *
 * Request budget: 6 leagues + 6 seasons + ~120 squads = ~130 requests.
 */
export async function syncCompetitions(): Promise<SyncRun> {
    const db = footballClient();
    const run = await startRun(db, 'sync-competitions');

    try {
        const seasons: Array<{leagueDbId: number; season: SmSeason}> = [];
        const inaccessible: string[] = [];
        const competitions = getCompetitions();
        if (isValidationMode()) {
            run.warn(`validation mode: SPORTMONKS_LEAGUE_IDS=${process.env.SPORTMONKS_LEAGUE_IDS} overrides the configured competitions`);
        }

        for (const comp of competitions) {
            let league: SmLeague | null = null;
            const label = comp.slug ?? `league-${comp.sportmonksId}`;
            try {
                const envelope = await sportmonksGet<SmLeague>(`leagues/${comp.sportmonksId}`, {include: 'currentSeason'});
                league = envelope.data;
            } catch (error) {
                if (error instanceof SportmonksError && error.isNoAccess) {
                    inaccessible.push(`${label} (#${comp.sportmonksId})`);
                    run.warn(`league ${label} (#${comp.sportmonksId}) is not included in the Sportmonks subscription, skipped`);
                    continue;
                }
                throw error;
            } finally {
                run.requests += 1;
            }
            if (!league || typeof league.id !== 'number') {
                run.warn(`league ${label} (#${comp.sportmonksId}): empty payload, is it included in the plan?`);
                continue;
            }

            const slug = comp.slug ?? slugify(league.name, league.id);
            const {data: leagueRow, error} = await db
                .from('leagues')
                .upsert(
                    {
                        sportmonks_id: league.id,
                        name: league.name,
                        short_code: league.short_code ?? null,
                        type: league.type ?? null,
                        logo_url: league.image_path ?? null,
                        slug,
                        is_active: league.active ?? true,
                    },
                    {onConflict: 'sportmonks_id'},
                )
                .select('id')
                .single();
            if (error) failSync('leagues.upsert', error);
            run.bump('leagues');
            console.info(`[sync-competitions] ${slug}: Sportmonks #${league.id} = "${league.name}"`);

            const season = league.currentseason ?? league.currentSeason ?? null;
            if (!season) {
                run.warn(`league ${slug} (#${league.id}) has no current season in the payload`);
                continue;
            }
            seasons.push({leagueDbId: leagueRow.id as number, season});
        }

        if (seasons.length === 0) {
            // Nothing usable: explain which leagues the token can actually see.
            let available = '';
            try {
                const access = await sportmonksAccess();
                run.requests += 1;
                const plans = access.subscription?.plans?.map((p) => p.plan).join(', ') || 'unknown plan';
                available = `plan: ${plans}; leagues in subscription: ${access.leagues.map((l) => `${l.name} (#${l.id})`).join(', ') || 'none'}`;
            } catch (error) {
                available = `could not list accessible leagues: ${(error as Error).message}`;
            }
            throw new SyncError(
                `none of the configured leagues is accessible with this Sportmonks token (${inaccessible.join(', ')}). ${available}. ` +
                    'Activate the European Plan trial (or add the leagues to the plan) and run again. ' +
                    'To validate the pipeline meanwhile, set SPORTMONKS_LEAGUE_IDS to the accessible league ids and redeploy.',
            );
        }

        // Mark every season of these leagues as not current, then upsert the current ones.
        for (const {leagueDbId, season} of seasons) {
            await db.from('seasons').update({is_current: false}).eq('league_id', leagueDbId);
            const {error} = await db.from('seasons').upsert(
                {
                    sportmonks_id: season.id,
                    league_id: leagueDbId,
                    name: season.name,
                    is_current: true,
                    starting_at: season.starting_at ?? null,
                    ending_at: season.ending_at ?? null,
                },
                {onConflict: 'sportmonks_id'},
            );
            if (error) failSync('seasons.upsert', error);
            run.bump('seasons');
        }

        const {data: seasonRows, error: seasonError} = await db
            .from('seasons')
            .select('id,sportmonks_id')
            .in('sportmonks_id', seasons.map((s) => s.season.id));
        if (seasonError) failSync('seasons.select', seasonError);
        const seasonDbId = new Map<number, number>((seasonRows ?? []).map((r) => [r.sportmonks_id as number, r.id as number]));

        for (const {season} of seasons) {
            const teams: SmTeam[] = [];
            for await (const page of sportmonksPages<SmTeam>(`teams/seasons/${season.id}`, {include: 'venue'})) {
                run.requests += 1;
                teams.push(...page);
            }
            const teamIds = await ensureTeams(db, teams);
            run.bump('teams', teams.length);

            const dbSeasonId = seasonDbId.get(season.id);
            if (!dbSeasonId) continue;

            for (const team of teams) {
                const dbTeamId = teamIds.get(team.id);
                if (!dbTeamId) continue;
                try {
                    await syncSquad(db, run, season.id, dbSeasonId, team.id, dbTeamId);
                } catch (error) {
                    run.warn(`squad ${team.name} (#${team.id}): ${(error as Error).message}`);
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

async function syncSquad(
    db: ReturnType<typeof footballClient>,
    run: SyncRun,
    seasonSportmonksId: number,
    dbSeasonId: number,
    teamSportmonksId: number,
    dbTeamId: number,
) {
    const members: SmSquadMember[] = [];
    for await (const page of sportmonksPages<SmSquadMember>(
        `squads/seasons/${seasonSportmonksId}/teams/${teamSportmonksId}`,
        {include: 'player.position;player.detailedPosition;player.nationality'},
    )) {
        run.requests += 1;
        members.push(...page);
    }
    if (members.length === 0) return;

    const playerRows = members
        .filter((m) => m.player)
        .map((m) => {
            const p = m.player!;
            const name = p.display_name ?? p.common_name ?? p.name ?? `Giocatore ${p.id}`;
            return {
                sportmonks_id: p.id,
                name,
                display_name: p.display_name ?? null,
                position: positionName(p.position_id) ?? p.position?.name?.toLowerCase() ?? null,
                detailed_position: p.detailedposition?.name ?? p.detailedPosition?.name ?? null,
                date_of_birth: p.date_of_birth ?? null,
                nationality: p.nationality?.name ?? null,
                image_url: p.image_path ?? null,
                height_cm: p.height ?? null,
                weight_kg: p.weight ?? null,
                slug: slugify(name, p.id),
            };
        });
    if (playerRows.length > 0) {
        const {error} = await db.from('players').upsert(playerRows, {onConflict: 'sportmonks_id'});
        if (error) failSync('players.upsert', error);
        run.bump('players', playerRows.length);
    }

    const {data: playerIds, error: selectError} = await db
        .from('players')
        .select('id,sportmonks_id')
        .in('sportmonks_id', members.map((m) => m.player_id));
    if (selectError) failSync('players.select', selectError);
    const idOf = new Map<number, number>((playerIds ?? []).map((r) => [r.sportmonks_id as number, r.id as number]));

    const squadRows = members
        .filter((m) => idOf.has(m.player_id))
        .map((m) => ({
            season_id: dbSeasonId,
            team_id: dbTeamId,
            player_id: idOf.get(m.player_id)!,
            jersey_number: m.jersey_number ?? null,
            is_captain: m.captain ?? false,
        }));
    if (squadRows.length > 0) {
        const {error} = await db.from('squad_members').upsert(squadRows, {onConflict: 'season_id,team_id,player_id'});
        if (error) failSync('squad_members.upsert', error);
        run.bump('squad_members', squadRows.length);
    }
}
