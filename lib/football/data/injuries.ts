import 'server-only';
import {featuredPriority} from '../competitions';
import type {CompetitionSummary, TeamSummary} from '../types';
import {fetchAll} from '@/lib/db/paginate';
import {LEAGUE_SELECT, TEAM_SELECT, footballDb, logReadError, toCompetition, toTeam, type LeagueRow, type TeamRow} from './shared';

export interface SidelinedPlayer {
    player: {id: number; name: string; slug: string; imageUrl: string | null; position: string | null};
    category: string;
    description: string | null;
    since: string | null;
}

export interface SidelinedTeam {
    team: TeamSummary;
    players: SidelinedPlayer[];
}

export interface SidelinedCompetition {
    competition: CompetitionSummary;
    teams: SidelinedTeam[];
    total: number;
}

interface Row {
    category: string;
    description: string | null;
    start_date: string | null;
    player: {id: number; name: string; slug: string; image_url: string | null; position: string | null} | null;
    team: TeamRow | null;
    season: {league: LeagueRow | null} | null;
}

/** Injured and suspended players of the featured competitions, grouped by competition and team. */
export async function getSidelined(): Promise<SidelinedCompetition[]> {
    try {
        const db = footballDb();
        const data = await fetchAll(
            (a, b) =>
                db
                    .from('sidelined')
                    .select(`category,description,start_date,player:players(id,name,slug,image_url,position),team:teams(${TEAM_SELECT}),season:seasons!inner(is_current,league:leagues!inner(${LEAGUE_SELECT}))`)
                    .eq('seasons.is_current', true)
                    .order('start_date', {ascending: false})
                    .order('id')
                    .range(a, b),
            {max: 6000},
        );
        const byLeague = new Map<number, SidelinedCompetition>();
        for (const r of data as unknown as Row[]) {
            const league = r.season?.league;
            if (!league || !r.player || !r.team) continue;
            if (!byLeague.has(league.id)) byLeague.set(league.id, {competition: toCompetition(league), teams: [], total: 0});
            const comp = byLeague.get(league.id)!;
            let entry = comp.teams.find((t) => t.team.id === r.team!.id);
            if (!entry) {
                entry = {team: toTeam(r.team), players: []};
                comp.teams.push(entry);
            }
            if (entry.players.some((p) => p.player.id === r.player!.id)) continue;
            entry.players.push({
                player: {id: r.player.id, name: r.player.name, slug: r.player.slug, imageUrl: r.player.image_url, position: r.player.position},
                category: r.category,
                description: r.description,
                since: r.start_date,
            });
            comp.total += 1;
        }
        return [...byLeague.values()]
            .map((c) => ({...c, teams: c.teams.sort((a, b) => a.team.name.localeCompare(b.team.name))}))
            .sort((a, b) => featuredPriority(a.competition.slug) - featuredPriority(b.competition.slug));
    } catch (error) {
        logReadError('getSidelined', error);
        return [];
    }
}
