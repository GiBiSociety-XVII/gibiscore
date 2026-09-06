import 'server-only';
import {basicScope, getFeaturedCompetitions, historySeasonCount} from '@/lib/football/competitions';
import {apiFootballGet, ApiFootballError} from '@/lib/api-football/client';
import {currentSeason, seasonName, slugify} from '@/lib/api-football/mappers';
import type {AfLeagueResponse, AfTeamResponse} from '@/lib/api-football/types';
import {fetchAll} from '@/lib/db/paginate';
import {chunk, ensureTeams, failSync, finishRun, footballClient, startRun, SyncError, type SyncRun} from './context';

/**
 * sync-competitions (daily, ~15 requests)
 *
 * 1. GET /leagues once: every competition API-Football publishes, with its
 *    seasons and coverage. Upsert them all (tier basic) or only the featured
 *    ones when API_FOOTBALL_SCOPE=featured.
 * 2. Mark the current season of each league; featured leagues also get
 *    their past seasons (history archive), not current.
 * 3. Featured leagues only: the teams of the current season (one request
 *    per league), stored in season_teams for the squads job; asked again
 *    only when the list is a week old, it changes once a season.
 *
 * Squads and transfers are not here any more: see squads.ts.
 */
/** The teams of a season change once a season: the list is asked again after this. */
const TEAMS_REFRESH_MS = 7 * 24 * 3_600_000;

export async function syncCompetitions(): Promise<SyncRun> {
    const db = footballClient();
    const run = await startRun(db, 'sync-competitions');

    try {
        const featured = getFeaturedCompetitions();
        const featuredIds = new Set(featured.map((c) => c.providerId));
        const scope = basicScope();

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
        for (const r of seasonRows) {
            await db.from('seasons').update({is_current: false}).eq('league_id', r.league_id).neq('year', r.year).eq('is_current', true);
        }

        // Featured leagues: the teams of the season.
        const {data: featuredSeasons, error: fsError} = await db
            .from('seasons')
            .select('id,year,league:leagues!inner(id,provider_id,name,tier)')
            .eq('is_current', true)
            .eq('leagues.tier', 'featured');
        if (fsError) failSync('seasons.select', fsError);

        const {data: listed, error: listedError} = await db
            .from('season_teams')
            .select('season_id,updated_at')
            .in('season_id', (featuredSeasons ?? []).map((s) => s.id as number))
            .gt('updated_at', new Date(Date.now() - TEAMS_REFRESH_MS).toISOString())
            .limit(5000);
        if (listedError) failSync('season_teams.select', listedError);
        const fresh = new Set((listed ?? []).map((r) => r.season_id as number));

        for (const s of featuredSeasons ?? []) {
            if (fresh.has(s.id as number)) {
                run.bump('teams_fresh');
                continue;
            }
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
            const rows = [...new Set([...teamIds.values()])].map((teamId) => ({season_id: s.id as number, team_id: teamId, updated_at: new Date().toISOString()}));
            if (rows.length > 0) {
                const {error} = await db.from('season_teams').upsert(rows, {onConflict: 'season_id,team_id'});
                if (error) failSync('season_teams.upsert', error);
                // A club relegated or out of a cup is no longer in the season.
                const {error: pruneError} = await db.from('season_teams').delete().eq('season_id', s.id as number).not('team_id', 'in', `(${rows.map((r) => r.team_id).join(',')})`);
                if (pruneError) failSync('season_teams.delete', pruneError);
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
