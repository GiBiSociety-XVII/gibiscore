import 'server-only';
import {fetchAll} from '@/lib/db/paginate';
import {buildSpells, daysBetween, estimateReturn, type SidelinedRow, type Spell} from '../spells';
import type {SidelinedEntry} from '../types';
import {footballDb, logReadError} from './shared';
import {romeDate} from './scores';

/**
 * Current absences per team, rebuilt from the fixtures each player
 * missed (see lib/football/spells.ts). Shared by the team page, the
 * match page and the injuries page.
 */

export interface SidelinedPlayerRow {
    id: number;
    name: string;
    slug: string;
    image_url: string | null;
    position: string | null;
}

interface StoredRow {
    player_id: number;
    team_id: number | null;
    category: string;
    description: string | null;
    start_date: string | null;
    player: SidelinedPlayerRow | null;
}

/** Days of finished fixtures to look at when deciding whether a listing is stale. */
const LOOKBACK_DAYS = 40;

/** Finished fixture dates (YYYY-MM-DD, UTC) of the last weeks, per team. */
export async function loadRecentFixtureDates(db: ReturnType<typeof footballDb>, teamIds: number[], today: string): Promise<Map<number, string[]>> {
    const dates = new Map<number, string[]>();
    if (teamIds.length === 0) return dates;
    const since = new Date(Date.parse(`${today}T00:00:00Z`) - LOOKBACK_DAYS * 86_400_000).toISOString();
    const ids = teamIds.join(',');
    const rows = (await fetchAll(
        (a, b) => db.from('fixtures').select('home_team_id,away_team_id,starting_at').eq('state', 'finished').gte('starting_at', since).or(`home_team_id.in.(${ids}),away_team_id.in.(${ids})`).order('starting_at').order('id').range(a, b),
        {max: 5000},
    )) as unknown as Array<{home_team_id: number; away_team_id: number; starting_at: string}>;
    for (const r of rows) {
        const day = r.starting_at.slice(0, 10);
        for (const id of [r.home_team_id, r.away_team_id]) {
            if (!dates.has(id)) dates.set(id, []);
            dates.get(id)!.push(day);
        }
    }
    return dates;
}

export function playedAfter(dates: Map<number, string[]>): (teamId: number, date: string) => boolean {
    return (teamId, date) => (dates.get(teamId) ?? []).some((d) => d > date);
}

export function toEntry(spell: Spell, player: SidelinedPlayerRow, today: string): SidelinedEntry {
    return {
        player: {id: player.id, name: player.name, slug: player.slug, imageUrl: player.image_url, position: player.position},
        category: spell.category,
        description: spell.description,
        since: spell.since,
        daysOut: Math.max(0, daysBetween(spell.since, today)),
        missed: spell.missed,
        estimate: estimateReturn(spell, today),
    };
}

/** Longest absences first, suspensions and doubts at the end. */
export function sortEntries(entries: SidelinedEntry[]): SidelinedEntry[] {
    const rank = (e: SidelinedEntry) => (e.category === 'injury' ? 0 : e.category === 'other' ? 1 : e.category === 'suspension' ? 2 : 3);
    return entries.sort((a, b) => rank(a) - rank(b) || a.since.localeCompare(b.since) || a.player.name.localeCompare(b.player.name));
}

/** Active spells of the given teams in their current seasons, keyed by team. */
export async function loadTeamSidelined(db: ReturnType<typeof footballDb>, teamIds: number[]): Promise<Map<number, SidelinedEntry[]>> {
    const result = new Map<number, SidelinedEntry[]>();
    if (teamIds.length === 0) return result;
    try {
        const today = romeDate(new Date());
        const [rows, dates] = await Promise.all([
            fetchAll(
                (a, b) =>
                    db
                        .from('sidelined')
                        .select('player_id,team_id,category,description,start_date,player:players(id,name,slug,image_url,position),season:seasons!inner(is_current)')
                        .in('team_id', teamIds)
                        .eq('seasons.is_current', true)
                        .order('id')
                        .range(a, b),
                {max: 4000},
            ) as unknown as Promise<StoredRow[]>,
            loadRecentFixtureDates(db, teamIds, today),
        ]);
        const players = new Map<number, SidelinedPlayerRow>();
        const input: SidelinedRow[] = [];
        for (const r of rows) {
            if (!r.player || r.team_id === null || !r.start_date) continue;
            players.set(r.player_id, r.player);
            input.push({playerId: r.player_id, teamId: r.team_id, date: r.start_date, category: r.category, description: r.description});
        }
        for (const spell of buildSpells(input, {today, teamPlayedAfter: playedAfter(dates)})) {
            if (!spell.active) continue;
            const player = players.get(spell.playerId);
            if (!player) continue;
            if (!result.has(spell.teamId)) result.set(spell.teamId, []);
            result.get(spell.teamId)!.push(toEntry(spell, player, today));
        }
        for (const [id, entries] of result) result.set(id, sortEntries(entries));
        return result;
    } catch (error) {
        logReadError('loadTeamSidelined', error);
        return result;
    }
}
