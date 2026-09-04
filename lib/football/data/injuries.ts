import 'server-only';
import {featuredPriority} from '../competitions';
import {buildSpells, type SidelinedRow} from '../spells';
import type {CompetitionSummary, SidelinedEntry, TeamSummary} from '../types';
import {fetchAll} from '@/lib/db/paginate';
import {LEAGUE_SELECT, TEAM_SELECT, footballDb, logReadError, toCompetition, toTeam, type LeagueRow, type TeamRow} from './shared';
import {romeDate} from './scores';
import {loadRecentFixtureDates, playedAfter, sortEntries, toEntry, type SidelinedPlayerRow} from './sidelined';

export interface SidelinedTeam {
    team: TeamSummary;
    players: SidelinedEntry[];
}

export interface SidelinedCompetition {
    competition: CompetitionSummary;
    teams: SidelinedTeam[];
    total: number;
}

interface Row {
    player_id: number;
    team_id: number | null;
    category: string;
    description: string | null;
    start_date: string | null;
    player: SidelinedPlayerRow | null;
    team: TeamRow | null;
    season: {league: LeagueRow | null} | null;
}

/**
 * Players currently out in the featured competitions, grouped by
 * competition and team, with how long they have been out and an
 * indicative return.
 */
export async function getSidelined(): Promise<SidelinedCompetition[]> {
    try {
        const db = footballDb();
        const today = romeDate(new Date());
        const data = (await fetchAll(
            (a, b) =>
                db
                    .from('sidelined')
                    .select(`player_id,team_id,category,description,start_date,player:players(id,name,slug,image_url,position),team:teams(${TEAM_SELECT}),season:seasons!inner(is_current,league:leagues!inner(${LEAGUE_SELECT}))`)
                    .eq('seasons.is_current', true)
                    .order('id')
                    .range(a, b),
            {max: 8000},
        )) as unknown as Row[];

        // Spells are per player and team, whatever the competition; the
        // competition shown is the one of the latest listing.
        const input: SidelinedRow[] = [];
        const players = new Map<number, SidelinedPlayerRow>();
        const teams = new Map<number, TeamRow>();
        const leagueOf = new Map<string, {date: string; league: LeagueRow}>();
        for (const r of data) {
            const league = r.season?.league;
            if (!league || !r.player || !r.team || r.team_id === null || !r.start_date) continue;
            players.set(r.player_id, r.player);
            teams.set(r.team_id, r.team);
            input.push({playerId: r.player_id, teamId: r.team_id, date: r.start_date, category: r.category, description: r.description});
            const key = `${r.player_id}:${r.team_id}`;
            const known = leagueOf.get(key);
            if (!known || r.start_date > known.date) leagueOf.set(key, {date: r.start_date, league});
        }
        const dates = await loadRecentFixtureDates(db, [...teams.keys()], today);

        const byLeague = new Map<number, SidelinedCompetition>();
        for (const spell of buildSpells(input, {today, teamPlayedAfter: playedAfter(dates)})) {
            if (!spell.active) continue;
            const league = leagueOf.get(`${spell.playerId}:${spell.teamId}`)?.league;
            const player = players.get(spell.playerId);
            const team = teams.get(spell.teamId);
            if (!league || !player || !team) continue;
            if (!byLeague.has(league.id)) byLeague.set(league.id, {competition: toCompetition(league), teams: [], total: 0});
            const comp = byLeague.get(league.id)!;
            let entry = comp.teams.find((t) => t.team.id === spell.teamId);
            if (!entry) {
                entry = {team: toTeam(team), players: []};
                comp.teams.push(entry);
            }
            entry.players.push(toEntry(spell, player, today));
            comp.total += 1;
        }
        return [...byLeague.values()]
            .map((c) => ({...c, teams: c.teams.map((t) => ({...t, players: sortEntries(t.players)})).sort((a, b) => a.team.name.localeCompare(b.team.name))}))
            .sort((a, b) => featuredPriority(a.competition.slug) - featuredPriority(b.competition.slug));
    } catch (error) {
        logReadError('getSidelined', error);
        return [];
    }
}
