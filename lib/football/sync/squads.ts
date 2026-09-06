import 'server-only';
import {getFeaturedCompetitions} from '@/lib/football/competitions';
import {apiFootballGet, ApiFootballError} from '@/lib/api-football/client';
import {positionName, slugify} from '@/lib/api-football/mappers';
import type {AfPlayerProfileResponse, AfSquadResponse, AfTransferResponse} from '@/lib/api-football/types';
import {fetchAll} from '@/lib/db/paginate';
import {seasonWindowStart, squadChanges} from './transfers';
import {allowance, chunk, failSync, finishRun, footballClient, startRun, type FootballClient, type SyncRun} from './context';

/** Stop starting new clubs after this: the route allows five minutes, the rest waits for the next run. */
const DEADLINE_MS = 230_000;
/** Clubs handled at the same time; the client's gate keeps the minute under the plan. */
const CONCURRENCY = 3;
/** Profiles fetched per club per run for players the database has never seen: bounded, they cost a request each. */
const MAX_PROFILES_PER_TEAM = 6;

interface Club {
    id: number;
    providerId: number;
    name: string;
    squadSyncedAt: string | null;
    transfersSyncedAt: string | null;
    /** Every featured season the club takes part in: league, cup, Europe. */
    seasons: Array<{id: number; year: number; leagueProviderId: number}>;
}

/**
 * The featured clubs with the seasons they play in, from season_teams,
 * the ones that waited longest first (then the featured order, for ties).
 */
async function featuredClubs(db: FootballClient): Promise<Club[]> {
    const rows = await fetchAll(
        (a, b) =>
            db
                .from('season_teams')
                .select('team:teams!inner(id,provider_id,name,squad_synced_at,transfers_synced_at),season:seasons!inner(id,year,is_current,league:leagues!inner(provider_id,tier))')
                .eq('seasons.is_current', true)
                .eq('seasons.leagues.tier', 'featured')
                .order('team_id')
                .range(a, b),
        {max: 5000},
    );
    const rank = new Map(getFeaturedCompetitions().map((c, i) => [c.providerId, i]));
    const clubs = new Map<number, Club>();
    for (const r of rows) {
        const team = r.team as unknown as {id: number; provider_id: number; name: string; squad_synced_at: string | null; transfers_synced_at: string | null};
        const season = r.season as unknown as {id: number; year: number; league: {provider_id: number}};
        const club = clubs.get(team.id) ?? {id: team.id, providerId: team.provider_id, name: team.name, squadSyncedAt: team.squad_synced_at, transfersSyncedAt: team.transfers_synced_at, seasons: []};
        club.seasons.push({id: season.id, year: season.year, leagueProviderId: season.league.provider_id});
        clubs.set(team.id, club);
    }
    const best = (c: Club) => Math.min(...c.seasons.map((s) => rank.get(s.leagueProviderId) ?? 999));
    return [...clubs.values()].sort((a, b) => (a.squadSyncedAt ?? '').localeCompare(b.squadSyncedAt ?? '') || best(a) - best(b));
}

/**
 * sync-squads (Monday and Thursday; archive class, ~2 requests per club)
 *
 * Every featured club: the provider's squad (players and shirt numbers,
 * departures removed) and its transfer feed since the season started
 * (arrivals join at once, departures leave). Clubs are taken in order of
 * the oldest squad first, so a run cut by the deadline is completed by
 * the next one. `limit` caps the clubs per run.
 */
export async function syncSquads(options: {limit?: number} = {}): Promise<SyncRun> {
    const db = footballClient();
    const run = await startRun(db, 'sync-squads');
    const startedAt = Date.now();
    try {
        if (!(await allowance(db, run, 'archive'))) {
            await finishRun(db, run, 'ok');
            return run;
        }
        const clubs = (await featuredClubs(db)).slice(0, options.limit ?? Number.POSITIVE_INFINITY);
        run.bump('clubs', clubs.length);
        let done = 0;
        for (const group of chunk(clubs, CONCURRENCY)) {
            if (Date.now() - startedAt > DEADLINE_MS) {
                run.bump('clubs_deferred', clubs.length - done);
                run.warn(`out of time after ${done} clubs: the rest waits for the next run`);
                break;
            }
            await Promise.all(
                group.map(async (club) => {
                    try {
                        await syncSquad(db, run, club);
                        await syncTransfers(db, run, club);
                    } catch (error) {
                        run.warn(`${club.name} (#${club.providerId}): ${(error as Error).message}`);
                        if (error instanceof ApiFootballError && error.kind === 'quota') throw error;
                    }
                }),
            );
            done += group.length;
        }
        await finishRun(db, run, 'ok');
        return run;
    } catch (error) {
        await finishRun(db, run, 'error', (error as Error).message);
        throw error;
    }
}

/** The provider's squad of a club, stored for every featured season it plays in. One request. */
async function syncSquad(db: FootballClient, run: SyncRun, club: Club) {
    const {response} = await apiFootballGet<AfSquadResponse[]>('players/squads', {team: club.providerId});
    run.requests += 1;
    let members = response[0]?.players ?? [];
    // The provider lists a player twice now and then: one row per id, or Postgres rejects the upsert.
    members = [...new Map(members.map((p) => [p.id, p])).values()];
    if (members.length === 0) {
        run.warn(`${club.name}: empty squad from the provider, kept as is`);
        return;
    }

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

    for (const season of club.seasons) {
        const squadRows = members
            .filter((m) => idOf.has(m.id))
            .map((m) => ({season_id: season.id, team_id: club.id, player_id: idOf.get(m.id)!, jersey_number: m.number ?? null, is_captain: false}));
        if (squadRows.length === 0) continue;
        const {error: squadError} = await db.from('squad_members').upsert(squadRows, {onConflict: 'season_id,team_id,player_id'});
        if (squadError) failSync('squad_members.upsert', squadError);
        run.bump('squad_members', squadRows.length);
        // Whoever the provider no longer lists has left. A short answer is a partial one
        // (a club being rebuilt) and must not empty the squad.
        if (squadRows.length >= 15) {
            const {data: gone, error: goneError} = await db
                .from('squad_members')
                .delete()
                .eq('season_id', season.id)
                .eq('team_id', club.id)
                .not('player_id', 'in', `(${squadRows.map((r) => r.player_id).join(',')})`)
                .select('player_id');
            if (goneError) failSync('squad_members.delete', goneError);
            if (gone && gone.length > 0) run.bump('squad_departures', gone.length);
        }
    }
    const {error: markError} = await db.from('teams').update({squad_synced_at: new Date().toISOString()}).eq('id', club.id);
    if (markError) failSync('teams.update', markError);
}

/**
 * Arrivals and departures from the transfer feed since the season started:
 * arrivals join the squad (a profile is fetched for the unknown ones),
 * departures leave it. One request per club, plus the profiles.
 */
async function syncTransfers(db: FootballClient, run: SyncRun, club: Club) {
    const {response} = await apiFootballGet<AfTransferResponse[]>('transfers', {team: club.providerId});
    run.requests += 1;
    const moves = response.flatMap((entry) =>
        (entry.transfers ?? []).map((t) => ({playerId: entry.player.id, name: entry.player.name, date: t.date, inTeam: t.teams?.in?.id ?? null, outTeam: t.teams?.out?.id ?? null})),
    );
    const until = new Date(Date.now() + 3 * 24 * 3600 * 1000).toISOString().slice(0, 10);
    const year = Math.max(...club.seasons.map((s) => s.year));
    const changes = squadChanges(moves, club.providerId, seasonWindowStart(year), until);
    const mark = async () => {
        const {error} = await db.from('teams').update({transfers_synced_at: new Date().toISOString()}).eq('id', club.id);
        if (error) failSync('teams.update', error);
    };
    if (changes.arrivals.size === 0 && changes.departures.size === 0) {
        await mark();
        return;
    }

    const known = new Map<number, number>();
    const providerIds = [...changes.arrivals.keys(), ...changes.departures];
    for (const ids of chunk(providerIds, 200)) {
        const {data, error} = await db.from('players').select('id,provider_id').in('provider_id', ids);
        if (error) failSync('players.select', error);
        for (const r of data ?? []) known.set(r.provider_id as number, r.id as number);
    }
    const seasonIds = club.seasons.map((s) => s.id);

    // Departures: out of this squad (the feed knows before the squad endpoint does).
    const outIds = [...changes.departures].map((id) => known.get(id)).filter((id): id is number => id !== undefined);
    if (outIds.length > 0) {
        const {data: gone, error} = await db.from('squad_members').delete().in('season_id', seasonIds).eq('team_id', club.id).in('player_id', outIds).select('player_id');
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
        const rows = seasonIds.map((seasonId) => ({season_id: seasonId, team_id: club.id, player_id: playerId, jersey_number: null, is_captain: false}));
        const {error} = await db.from('squad_members').upsert(rows, {onConflict: 'season_id,team_id,player_id'});
        if (error) failSync('squad_members.upsert', error);
        run.bump('transfers_in');
    }
    await mark();
}
