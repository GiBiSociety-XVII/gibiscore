import 'server-only';
import type {CompetitionSummary, TeamSummary} from '../types';
import {featuredPriority} from '../competitions';
import {foldName, playerScore, rankBy, teamScore} from '../search-rank';
import {LEAGUE_SELECT, TEAM_SELECT, footballDb, logReadError, toCompetition, toTeam, type LeagueRow, type TeamRow} from './shared';

export interface SearchResults {
    query: string;
    teams: Array<TeamSummary & {country: string | null}>;
    players: Array<{id: number; name: string; slug: string; imageUrl: string | null; position: string | null; team: TeamSummary | null}>;
    competitions: CompetitionSummary[];
}

function escapeLike(value: string): string {
    return value.replace(/[%_\\]/g, (c) => `\\${c}`);
}

type SquadRow = {player_id: number; team: TeamRow | null; season: {league: {slug: string; tier: string} | null} | null};
type SeasonTeamRow = {team_id: number; season: {league: {slug: string; tier: string} | null} | null};

/**
 * Name search over teams, players and competitions. Accents and case do
 * not count ("hojlund" finds Højlund): the folded `search_name` columns
 * carry trigram indexes. Hits are ranked by how much they matter: a
 * player with a team this season before a namesake without one, the
 * big competitions before the small, the ones who play more first, and
 * a name that starts with the query before one that only contains it.
 */
export async function search(rawQuery: string): Promise<SearchResults> {
    const query = rawQuery.trim().slice(0, 60);
    const empty: SearchResults = {query, teams: [], players: [], competitions: []};
    if (query.length < 2) return empty;
    const pattern = `%${escapeLike(foldName(query))}%`;
    try {
        const db = footballDb();
        const [teamsRes, playersRes, leaguesRes] = await Promise.all([
            db.from('teams').select(`${TEAM_SELECT},country`).ilike('search_name', pattern).order('name').limit(24),
            db.from('players').select('id,name,slug,image_url,position').ilike('search_name', pattern).order('name').limit(40),
            db.from('leagues').select(LEAGUE_SELECT).eq('is_active', true).ilike('search_name', pattern).order('name').limit(12),
        ]);
        for (const res of [teamsRes, playersRes, leaguesRes]) if (res.error) throw res.error;

        const players = (playersRes.data ?? []) as unknown as Array<{id: number; name: string; slug: string; image_url: string | null; position: string | null}>;
        const teamRows = (teamsRes.data ?? []) as unknown as Array<TeamRow & {country: string | null}>;
        // This season's squad of each player (team and competition), the competition of each team, and how much each player has played lately.
        const teamOf = new Map<number, TeamSummary>();
        const leagueOfPlayer = new Map<number, {slug: string; tier: string}>();
        const leagueOfTeam = new Map<number, {slug: string; tier: string}>();
        const minutesOf = new Map<number, number>();
        const thisYear = new Date().getFullYear();
        await Promise.all([
            players.length > 0
                ? db
                      .from('squad_members')
                      .select(`player_id,season:seasons!inner(is_current,league:leagues(slug,tier)),team:teams(${TEAM_SELECT})`)
                      .in('player_id', players.map((p) => p.id))
                      .eq('seasons.is_current', true)
                      .limit(200)
                      .then(({data}) => {
                          for (const row of (data ?? []) as unknown as SquadRow[]) {
                              if (!row.team) continue;
                              const league = row.season?.league ?? null;
                              // A player in two current squads (a cup and a league, a transfer): the bigger competition names his team.
                              const known = leagueOfPlayer.get(row.player_id);
                              if (!teamOf.has(row.player_id) || (league && (!known || featuredPriority(league.slug) < featuredPriority(known.slug)))) {
                                  teamOf.set(row.player_id, toTeam(row.team));
                                  if (league) leagueOfPlayer.set(row.player_id, league);
                              }
                          }
                      })
                : Promise.resolve(),
            players.length > 0
                ? db
                      .from('player_season_stats')
                      .select('player_id,minutes')
                      .in('player_id', players.map((p) => p.id))
                      .gte('season_year', thisYear - 2)
                      .limit(400)
                      .then(({data}) => {
                          for (const row of (data ?? []) as Array<{player_id: number; minutes: number | null}>) minutesOf.set(row.player_id, (minutesOf.get(row.player_id) ?? 0) + (row.minutes ?? 0));
                      })
                : Promise.resolve(),
            teamRows.length > 0
                ? db
                      .from('season_teams')
                      .select('team_id,season:seasons!inner(is_current,league:leagues(slug,tier))')
                      .in('team_id', teamRows.map((t) => t.id))
                      .eq('seasons.is_current', true)
                      .limit(200)
                      .then(({data}) => {
                          for (const row of (data ?? []) as unknown as SeasonTeamRow[]) {
                              const league = row.season?.league ?? null;
                              if (!league) continue;
                              const known = leagueOfTeam.get(row.team_id);
                              if (!known || featuredPriority(league.slug) < featuredPriority(known.slug)) leagueOfTeam.set(row.team_id, league);
                          }
                      })
                : Promise.resolve(),
        ]);

        const rankedPlayers = rankBy(
            players.map((p) => ({id: p.id, name: p.name, slug: p.slug, imageUrl: p.image_url, position: p.position, team: teamOf.get(p.id) ?? null})),
            (p) => playerScore({name: p.name, hasTeam: p.team !== null, leagueSlug: leagueOfPlayer.get(p.id)?.slug, leagueTier: leagueOfPlayer.get(p.id)?.tier, minutes: minutesOf.get(p.id)}, query),
        );
        const rankedTeams = rankBy(
            teamRows.map((t) => ({...toTeam(t), country: t.country})),
            (t) => teamScore({name: t.name, leagueSlug: leagueOfTeam.get(t.id)?.slug, leagueTier: leagueOfTeam.get(t.id)?.tier}, query),
        );
        const competitions = ((leaguesRes.data ?? []) as unknown as LeagueRow[]).map(toCompetition).sort((a, b) => featuredPriority(a.slug) - featuredPriority(b.slug) || a.name.localeCompare(b.name));
        return {query, teams: rankedTeams.slice(0, 12), players: rankedPlayers.slice(0, 20), competitions};
    } catch (error) {
        logReadError(`search(${query})`, error);
        return empty;
    }
}
