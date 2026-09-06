import 'server-only';
import {basicScope, getFeaturedCompetitions, historySeasonCount} from '@/lib/football/competitions';
import {apiFootballGet, ApiFootballError} from '@/lib/api-football/client';
import {currentSeason, positionName, seasonName, slugify} from '@/lib/api-football/mappers';
import type {AfLeagueResponse, AfPlayerProfileResponse, AfSquadResponse, AfTeamResponse, AfTransferResponse} from '@/lib/api-football/types';
import {seasonWindowStart, squadChanges} from './transfers';
import {fetchAll} from '@/lib/db/paginate';
import {chunk, ensureTeams, failSync, finishRun, footballClient, startRun, SyncError, type FootballClient, type SyncRun} from './context';

/**
 * sync-competitions (daily)
 *
 * 1. GET /leagues once: every competition API-Football publishes, with its
 *    seasons and coverage. Upsert them all (tier basic) or only the featured
 *    ones when API_FOOTBALL_SCOPE=featured.
 * 2. Mark the current season of each league.
 * 3. Featured leagues only: teams of the season and, unless
 *    API_FOOTBALL_SKIP_SQUADS=1, their squads.
 *
 * Request budget: 1 + featured teams (~13) + squads (~260) = ~275 requests.
 */
export async function syncCompetitions(options: {squads?: boolean} = {}): Promise<SyncRun> {
    const db = footballClient();
    const run = await startRun(db, 'sync-competitions');

    try {
        const featured = getFeaturedCompetitions();
        const featuredIds = new Set(featured.map((c) => c.providerId));
        const scope = basicScope();
        // Squads change rarely: fetched on Monday and Thursday (or on request), ~500 requests each time.
        // During the transfer windows (January, February, August, September) every day: the provider's
        // squads lag behind moves and the fantasy auction reads them.
        const now = new Date();
        const day = now.getUTCDay();
        const transferWindow = [0, 1, 7, 8].includes(now.getUTCMonth());
        const squadsDue = options.squads ?? (transferWindow || day === 1 || day === 4);
        const skipSquads = process.env.API_FOOTBALL_SKIP_SQUADS === '1' || !squadsDue;
        if (skipSquads) run.bump('squads_skipped');

        const {response: all} = await apiFootballGet<AfLeagueResponse[]>('leagues');
        run.requests += 1;
        const entries = scope === 'all' ? all : all.filter((e) => featuredIds.has(e.league.id));
        run.bump('leagues_in_api', all.length);

        for (const comp of featured) {
            const found = all.find((e) => e.league.id === comp.providerId);
            console.info(`[sync-competitions] ${comp.slug ?? comp.providerId}: API-Football #${comp.providerId} = ${found ? `"${found.league.name}" (${found.country?.name})` : 'NOT FOUND'}`);
            if (!found) run.warn(`featured league #${comp.providerId} (${comp.slug ?? '?'}) not found in API-Football, check the id`);
        }

        // Leagues
        const leagueRows = entries.map((e) => {
            const comp = featured.find((c) => c.providerId === e.league.id);
            const season = currentSeason(e.seasons);
            return {
                provider_id: e.league.id,
                name: e.league.name,
                short_code: null,
                country: e.country?.name ?? null,
                country_code: e.country?.code ?? null,
                type: e.league.type?.toLowerCase() ?? null,
                logo_url: e.league.logo ?? null,
                slug: comp?.slug ?? slugify(`${e.league.name} ${e.country?.name ?? ''}`.trim(), e.league.id),
                is_active: true,
                tier: featuredIds.has(e.league.id) ? 'featured' : 'basic',
                season_coverage: season?.coverage ?? null,
            };
        });
        for (const rows of chunk(leagueRows, 200)) {
            const {error} = await db.from('leagues').upsert(rows, {onConflict: 'provider_id'});
            if (error) failSync('leagues.upsert', error);
        }
        run.bump('leagues', leagueRows.length);

        // Demote leagues no longer featured, promote the featured ones.
        await db.from('leagues').update({tier: 'basic'}).eq('tier', 'featured').not('provider_id', 'in', `(${[...featuredIds].join(',')})`);

        // ~1,250 leagues: more than one Data API page.
        const leagueIdRows = await fetchAll((a, b) => db.from('leagues').select('id,provider_id').in('provider_id', entries.map((e) => e.league.id)).order('id').range(a, b), {max: 5000});
        const leagueDbId = new Map<number, number>(leagueIdRows.map((r) => [r.provider_id as number, r.id as number]));

        // Seasons: upsert the current one per league, then flag it. Featured
        // leagues also get their past seasons (history archive), not current.
        const history = historySeasonCount();
        const seasonRows = [];
        const historyRows = [];
        for (const e of entries) {
            const leagueId = leagueDbId.get(e.league.id);
            const season = currentSeason(e.seasons);
            if (!leagueId || !season) continue;
            seasonRows.push({
                league_id: leagueId,
                year: season.year,
                name: seasonName(season),
                is_current: true,
                starting_at: season.start ?? null,
                ending_at: season.end ?? null,
            });
            if (!featuredIds.has(e.league.id)) continue;
            for (const past of e.seasons ?? []) {
                if (past.year >= season.year || past.year < season.year - history) continue;
                historyRows.push({
                    league_id: leagueId,
                    year: past.year,
                    name: seasonName(past),
                    is_current: false,
                    starting_at: past.start ?? null,
                    ending_at: past.end ?? null,
                });
            }
        }
        for (const rows of chunk(seasonRows, 200)) {
            const {error} = await db.from('seasons').upsert(rows, {onConflict: 'league_id,year'});
            if (error) failSync('seasons.upsert', error);
        }
        run.bump('seasons', seasonRows.length);
        for (const rows of chunk(historyRows, 200)) {
            const {error} = await db.from('seasons').upsert(rows, {onConflict: 'league_id,year'});
            if (error) failSync('seasons.upsert', error);
        }
        run.bump('history_seasons', historyRows.length);
        // Older seasons of the same leagues are no longer current.
        for (const rows of chunk(seasonRows, 200)) {
            for (const r of rows) {
                await db.from('seasons').update({is_current: false}).eq('league_id', r.league_id).neq('year', r.year).eq('is_current', true);
            }
        }

        // Featured leagues: teams and squads.
        const {data: featuredSeasons, error: fsError} = await db
            .from('seasons')
            .select('id,year,league:leagues!inner(id,provider_id,name,tier)')
            .eq('is_current', true)
            .eq('leagues.tier', 'featured');
        if (fsError) failSync('seasons.select', fsError);

        // A club in league, cup and Europe is asked its squad once per run.
        const squadCache = new Map<number, AfSquadResponse['players']>();
        const transferCache = new Set<number>();
        for (const s of featuredSeasons ?? []) {
            const league = s.league as unknown as {id: number; provider_id: number; name: string};
            let teamEntries: AfTeamResponse[] = [];
            try {
                const {response} = await apiFootballGet<AfTeamResponse[]>('teams', {league: league.provider_id, season: s.year});
                teamEntries = response;
            } catch (error) {
                run.warn(`teams of ${league.name}: ${(error as Error).message}`);
                if (error instanceof ApiFootballError && error.kind === 'quota') throw error;
                continue;
            } finally {
                run.requests += 1;
            }
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
                    await syncSquad(db, run, s.id as number, t.team.id, dbTeamId, squadCache);
                } catch (error) {
                    run.warn(`squad ${t.team.name} (#${t.team.id}): ${(error as Error).message}`);
                    if (error instanceof ApiFootballError && error.kind === 'quota') throw error;
                }
                // The transfer feed moves faster than the squads: arrivals join, departures leave, today.
                if (transferCache.has(t.team.id)) continue;
                transferCache.add(t.team.id);
                try {
                    await syncTransfers(db, run, s.id as number, s.year as number, t.team.id, dbTeamId);
                } catch (error) {
                    run.warn(`transfers ${t.team.name} (#${t.team.id}): ${(error as Error).message}`);
                    if (error instanceof ApiFootballError && error.kind === 'quota') throw error;
                }
            }
        }

        if (leagueRows.length === 0) {
            throw new SyncError('no league could be loaded from API-Football; check API_FOOTBALL_KEY');
        }

        await finishRun(db, run, 'ok');
        return run;
    } catch (error) {
        await finishRun(db, run, 'error', (error as Error).message);
        throw error;
    }
}

async function syncSquad(db: FootballClient, run: SyncRun, dbSeasonId: number, teamProviderId: number, dbTeamId: number, cache: Map<number, AfSquadResponse['players']>) {
    let members = cache.get(teamProviderId);
    if (!members) {
        const {response} = await apiFootballGet<AfSquadResponse[]>('players/squads', {team: teamProviderId});
        run.requests += 1;
        members = response[0]?.players ?? [];
        cache.set(teamProviderId, members);
    }
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
    // Whoever the provider no longer lists has left: out of the squad. A short answer is a
    // partial one (a page missing, a club being rebuilt) and must not empty the squad.
    if (squadRows.length >= 15) {
        const {data: gone, error: goneError} = await db
            .from('squad_members')
            .delete()
            .eq('season_id', dbSeasonId)
            .eq('team_id', dbTeamId)
            .not('player_id', 'in', `(${squadRows.map((r) => r.player_id).join(',')})`)
            .select('player_id');
        if (goneError) failSync('squad_members.delete', goneError);
        if (gone && gone.length > 0) run.bump('squad_departures', gone.length);
    }
}

/** Profiles fetched per run for players the database has never seen: bounded, they cost a request each. */
const MAX_PROFILES_PER_TEAM = 6;

/**
 * Arrivals and departures from the transfer feed since the season started:
 * arrivals join the squad (a profile is fetched for the unknown ones),
 * departures leave it. One request per club, plus the profiles.
 */
async function syncTransfers(db: FootballClient, run: SyncRun, dbSeasonId: number, year: number, teamProviderId: number, dbTeamId: number) {
    const {response} = await apiFootballGet<AfTransferResponse[]>('transfers', {team: teamProviderId});
    run.requests += 1;
    const moves = response.flatMap((entry) =>
        (entry.transfers ?? []).map((t) => ({playerId: entry.player.id, name: entry.player.name, date: t.date, inTeam: t.teams?.in?.id ?? null, outTeam: t.teams?.out?.id ?? null})),
    );
    const until = new Date(Date.now() + 3 * 24 * 3600 * 1000).toISOString().slice(0, 10);
    const changes = squadChanges(moves, teamProviderId, seasonWindowStart(year), until);
    if (changes.arrivals.size === 0 && changes.departures.size === 0) return;

    const known = new Map<number, number>();
    const providerIds = [...changes.arrivals.keys(), ...changes.departures];
    for (const ids of chunk(providerIds, 200)) {
        const {data, error} = await db.from('players').select('id,provider_id').in('provider_id', ids);
        if (error) failSync('players.select', error);
        for (const r of data ?? []) known.set(r.provider_id as number, r.id as number);
    }

    // Departures: out of this squad (the feed knows before the squad endpoint does).
    const outIds = [...changes.departures].map((id) => known.get(id)).filter((id): id is number => id !== undefined);
    if (outIds.length > 0) {
        const {data: gone, error} = await db.from('squad_members').delete().eq('season_id', dbSeasonId).eq('team_id', dbTeamId).in('player_id', outIds).select('player_id');
        if (error) failSync('squad_members.delete', error);
        if (gone && gone.length > 0) run.bump('transfers_out', gone.length);
    }

    // Arrivals: known players join at once; unknown ones get a profile first, a few per club per run.
    let profiles = 0;
    for (const [providerId, name] of changes.arrivals) {
        if (!known.has(providerId)) {
            if (profiles >= MAX_PROFILES_PER_TEAM) continue;
            profiles += 1;
            const {response: found} = await apiFootballGet<AfPlayerProfileResponse[]>('players/profiles', {player: providerId});
            run.requests += 1;
            const profile = found[0]?.player;
            const fullName = profile?.name && profile.name.trim() !== '' ? profile.name : name;
            const {data: inserted, error} = await db
                .from('players')
                .upsert({provider_id: providerId, name: fullName, position: positionName(profile?.position ?? null), age: profile?.age ?? null, image_url: profile?.photo ?? null, slug: slugify(fullName, providerId)}, {onConflict: 'provider_id'})
                .select('id')
                .single();
            if (error) failSync('players.upsert', error);
            if (inserted) known.set(providerId, inserted.id as number);
            run.bump('transfer_profiles');
        }
        const playerId = known.get(providerId);
        if (!playerId) continue;
        const {error} = await db.from('squad_members').upsert({season_id: dbSeasonId, team_id: dbTeamId, player_id: playerId, jersey_number: null, is_captain: false}, {onConflict: 'season_id,team_id,player_id'});
        if (error) failSync('squad_members.upsert', error);
        run.bump('transfers_in');
    }
}
