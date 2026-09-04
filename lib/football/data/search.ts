import 'server-only';
import type {CompetitionSummary, TeamSummary} from '../types';
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

/** Name search over teams, players and competitions (trigram indexes, case-insensitive). */
export async function search(rawQuery: string): Promise<SearchResults> {
    const query = rawQuery.trim().slice(0, 60);
    const empty: SearchResults = {query, teams: [], players: [], competitions: []};
    if (query.length < 2) return empty;
    const pattern = `%${escapeLike(query)}%`;
    try {
        const db = footballDb();
        const [teamsRes, playersRes, leaguesRes] = await Promise.all([
            db.from('teams').select(`${TEAM_SELECT},country`).ilike('name', pattern).order('name').limit(12),
            db.from('players').select('id,name,slug,image_url,position').ilike('name', pattern).order('name').limit(20),
            db.from('leagues').select(LEAGUE_SELECT).eq('is_active', true).ilike('name', pattern).order('name').limit(12),
        ]);
        for (const res of [teamsRes, playersRes, leaguesRes]) if (res.error) throw res.error;

        const players = (playersRes.data ?? []) as unknown as Array<{id: number; name: string; slug: string; image_url: string | null; position: string | null}>;
        // Current team of each player from this season's squads (one query).
        const teamOf = new Map<number, TeamSummary>();
        if (players.length > 0) {
            const {data} = await db
                .from('squad_members')
                .select(`player_id,season:seasons!inner(is_current),team:teams(${TEAM_SELECT})`)
                .in('player_id', players.map((p) => p.id))
                .eq('seasons.is_current', true)
                .limit(200);
            for (const row of (data ?? []) as unknown as Array<{player_id: number; team: TeamRow | null}>) {
                if (row.team && !teamOf.has(row.player_id)) teamOf.set(row.player_id, toTeam(row.team));
            }
        }

        return {
            query,
            teams: ((teamsRes.data ?? []) as unknown as Array<TeamRow & {country: string | null}>).map((t) => ({...toTeam(t), country: t.country})),
            players: players.map((p) => ({id: p.id, name: p.name, slug: p.slug, imageUrl: p.image_url, position: p.position, team: teamOf.get(p.id) ?? null})),
            competitions: ((leaguesRes.data ?? []) as unknown as LeagueRow[]).map(toCompetition),
        };
    } catch (error) {
        logReadError(`search(${query})`, error);
        return empty;
    }
}
