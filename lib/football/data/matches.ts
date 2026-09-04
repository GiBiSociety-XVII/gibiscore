import 'server-only';
import type {EventKind, LineupPlayer, MatchEvent, MatchPage, PlayerMatchLine, SidelinedEntry, TeamLineup, TeamMatchStats} from '../types';
import type {FormEntry, StandingGroup} from '../types';
import {loadTeamSidelined} from './sidelined';
import {FIXTURE_LIST_SELECT, FIXTURE_SELECT, LEAGUE_SELECT, STANDING_SELECT, TEAM_SELECT, footballDb, logReadError, toCompetition, toFixture, toFixtures, toTeam, toStandingRow, type FixtureRow, type LeagueRow, type StandingQueryRow, type TeamRow} from './shared';

interface EventRow {
    id: number;
    team_id: number | null;
    type: EventKind;
    minute: number | null;
    extra_minute: number | null;
    info: string | null;
    sort_order: number | null;
    player_name: string | null;
    related_player_name: string | null;
    player: {id: number; name: string; slug: string} | null;
    related: {id: number; name: string; slug: string} | null;
}

interface LineupRow {
    team_id: number;
    is_starter: boolean;
    formation: string | null;
    formation_position: number | null;
    jersey_number: number | null;
    player: {id: number; name: string; slug: string; position: string | null} | null;
}

interface TeamStatRow {
    team_id: number;
    possession: number | null;
    shots_total: number | null;
    shots_on_target: number | null;
    corners: number | null;
    fouls: number | null;
    yellow_cards: number | null;
    red_cards: number | null;
    passes_total: number | null;
    pass_accuracy: number | null;
    xg: number | null;
}

interface PlayerStatRow {
    team_id: number;
    minutes_played: number | null;
    rating: number | null;
    goals: number;
    assists: number;
    shots_total: number | null;
    shots_on_target: number | null;
    key_passes: number | null;
    yellow_cards: number;
    red_cards: number;
    stats: Record<string, number | string | null> | null;
    player: {id: number; name: string; slug: string; image_url: string | null; position: string | null} | null;
}

function toTeamStats(r: TeamStatRow | undefined): TeamMatchStats | null {
    if (!r) return null;
    return {
        possession: r.possession,
        shotsTotal: r.shots_total,
        shotsOnTarget: r.shots_on_target,
        corners: r.corners,
        fouls: r.fouls,
        yellowCards: r.yellow_cards,
        redCards: r.red_cards,
        passesTotal: r.passes_total,
        passAccuracy: r.pass_accuracy,
        xg: r.xg,
    };
}

export async function getMatchPage(id: number): Promise<MatchPage | null> {
    try {
        const db = footballDb();
        const {data, error} = await db
            .from('fixtures')
            .select(
                `${FIXTURE_SELECT},season_id,venue_name,referee,home_score_ht,away_score_ht,` +
                    'events:fixture_events(id,team_id,type,minute,extra_minute,info,sort_order,player_name,related_player_name,' +
                    'player:players!fixture_events_player_id_fkey(id,name,slug),related:players!fixture_events_related_player_id_fkey(id,name,slug)),' +
                    'lineups(team_id,is_starter,formation,formation_position,jersey_number,player:players(id,name,slug,position)),' +
                    'team_stats:fixture_team_stats(team_id,possession,shots_total,shots_on_target,corners,fouls,yellow_cards,red_cards,passes_total,pass_accuracy,xg),' +
                    'player_stats:fixture_player_stats(team_id,minutes_played,rating,goals,assists,shots_total,shots_on_target,key_passes,yellow_cards,red_cards,stats,' +
                    'player:players(id,name,slug,image_url,position))',
            )
            .eq('id', id)
            .maybeSingle();
        if (error) throw error;
        if (!data) return null;

        const row = data as unknown as FixtureRow & {
            season_id: number | null;
            venue_name: string | null;
            referee: string | null;
            home_score_ht: number | null;
            away_score_ht: number | null;
            league: LeagueRow | null;
            home: TeamRow | null;
            away: TeamRow | null;
            events: EventRow[];
            lineups: LineupRow[];
            team_stats: TeamStatRow[];
            player_stats: PlayerStatRow[];
        };
        const base = toFixture(row);
        if (!base || !row.league || !row.home || !row.away) return null;
        const homeId = row.home.id;
        const awayId = row.away.id;
        const side = (teamId: number | null): 'home' | 'away' | null => (teamId === homeId ? 'home' : teamId === awayId ? 'away' : null);

        const events: MatchEvent[] = [...(row.events ?? [])]
            .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || (a.minute ?? 0) - (b.minute ?? 0))
            .map((e) => {
                return {
                    id: e.id,
                    teamId: e.team_id,
                    side: side(e.team_id),
                    type: e.type,
                    minute: e.minute,
                    extraMinute: e.extra_minute,
                    player: {id: e.player?.id ?? null, name: e.player?.name ?? e.player_name, slug: e.player?.slug ?? null},
                    related: {id: e.related?.id ?? null, name: e.related?.name ?? e.related_player_name, slug: e.related?.slug ?? null},
                    info: e.info,
                };
            });

        const ratingOf = new Map<number, number | null>();
        const playerLines = (teamId: number): PlayerMatchLine[] =>
            (row.player_stats ?? [])
                .filter((p) => p.team_id === teamId && p.player)
                .map((p) => {
                    ratingOf.set(p.player!.id, p.rating);
                    const position = (p.stats?.position as string | null) ?? p.player!.position;
                    const normalizedPosition = normalizePosition(position);
                    return {
                        player: {id: p.player!.id, name: p.player!.name, slug: p.player!.slug, imageUrl: p.player!.image_url},
                        teamId,
                        position: normalizedPosition,
                        minutes: p.minutes_played,
                        rating: p.rating,
                        goals: p.goals,
                        assists: p.assists,
                        shots: p.shots_total,
                        shotsOnTarget: p.shots_on_target,
                        keyPasses: p.key_passes,
                        yellowCards: p.yellow_cards,
                        redCards: p.red_cards,
                    };
                })
                .sort((a, b) => Number(b.minutes !== null) - Number(a.minutes !== null) || (b.rating ?? 0) - (a.rating ?? 0));

        const lineupFor = (teamId: number, team: TeamRow): TeamLineup | null => {
            const entries = (row.lineups ?? []).filter((l) => l.team_id === teamId && l.player);
            if (entries.length === 0) return null;
            const toPlayer = (l: LineupRow): LineupPlayer => ({
                id: l.player!.id,
                name: l.player!.name,
                slug: l.player!.slug,
                number: l.jersey_number,
                position: normalizePosition(l.player!.position),
                formationPosition: l.formation_position,
                rating: ratingOf.get(l.player!.id) ?? null,
            });
            return {
                team: toTeam(team),
                formation: entries.find((l) => l.formation)?.formation ?? null,
                starters: entries.filter((l) => l.is_starter).map(toPlayer).sort((a, b) => (a.formationPosition ?? 99) - (b.formationPosition ?? 99)),
                bench: entries.filter((l) => !l.is_starter).map(toPlayer),
            };
        };

        const home = playerLines(homeId);
        const away = playerLines(awayId);

        // Side rail: table of the competition (group of the two teams) and last meetings.
        const upcoming = row.state === 'scheduled' || row.state === 'postponed';
        const [standings, headToHead, homeForm, awayForm, absences] = await Promise.all([
            row.season_id ? loadStandings(db, row.season_id, homeId, awayId) : Promise.resolve([]),
            loadHeadToHead(db, homeId, awayId, row.id),
            loadForm(db, homeId, row.starting_at, row.id),
            loadForm(db, awayId, row.starting_at, row.id),
            upcoming ? loadTeamSidelined(db, [homeId, awayId]) : Promise.resolve(new Map<number, SidelinedEntry[]>()),
        ]);
        const rated = [...home, ...away].filter((p) => p.rating !== null && (p.minutes ?? 0) > 0);
        const bestPlayer = rated.length > 0 ? rated.reduce((best, p) => ((p.rating ?? 0) > (best.rating ?? 0) ? p : best)) : null;

        return {
            standings,
            headToHead,
            form: {home: homeForm, away: awayForm},
            bestPlayer,
            absences: {home: absences.get(homeId) ?? [], away: absences.get(awayId) ?? []},
            fixture: {
                ...base,
                competition: toCompetition(row.league),
                seasonId: row.season_id,
                venue: row.venue_name,
                referee: row.referee,
                homeScoreHt: row.home_score_ht,
                awayScoreHt: row.away_score_ht,
            },
            events,
            lineups: {home: lineupFor(homeId, row.home), away: lineupFor(awayId, row.away)},
            stats: {
                home: toTeamStats((row.team_stats ?? []).find((s) => s.team_id === homeId)),
                away: toTeamStats((row.team_stats ?? []).find((s) => s.team_id === awayId)),
            },
            players: {home, away},
        };
    } catch (error) {
        logReadError(`getMatchPage(${id})`, error);
        return null;
    }
}

export function normalizePosition(position: string | null | undefined): string | null {
    switch ((position ?? '').toLowerCase()) {
        case 'g':
        case 'goalkeeper':
            return 'goalkeeper';
        case 'd':
        case 'defender':
            return 'defender';
        case 'm':
        case 'midfielder':
            return 'midfielder';
        case 'f':
        case 'attacker':
            return 'attacker';
        default:
            return position ? position.toLowerCase() : null;
    }
}

export {LEAGUE_SELECT, TEAM_SELECT};

async function loadStandings(db: ReturnType<typeof footballDb>, seasonId: number, homeId: number, awayId: number): Promise<StandingGroup[]> {
    try {
        const {data, error} = await db.from('standings').select(STANDING_SELECT).eq('season_id', seasonId).order('group').order('position').limit(200);
        if (error) throw error;
        const groups = new Map<string, StandingGroup>();
        for (const r of (data ?? []) as unknown as StandingQueryRow[]) {
            const row = toStandingRow(r);
            if (!row) continue;
            if (!groups.has(r.group)) groups.set(r.group, {name: r.group, rows: []});
            groups.get(r.group)!.rows.push(row);
        }
        const all = [...groups.values()];
        const withTeams = all.filter((g) => g.rows.some((r) => r.team.id === homeId || r.team.id === awayId));
        return withTeams.length > 0 ? withTeams : all.slice(0, 1);
    } catch (error) {
        logReadError('loadStandings', error);
        return [];
    }
}

async function loadHeadToHead(db: ReturnType<typeof footballDb>, homeId: number, awayId: number, excludeId: number) {
    try {
        const {data, error} = await db
            .from('fixtures')
            .select(FIXTURE_LIST_SELECT)
            .or(`and(home_team_id.eq.${homeId},away_team_id.eq.${awayId}),and(home_team_id.eq.${awayId},away_team_id.eq.${homeId})`)
            .eq('state', 'finished')
            .neq('id', excludeId)
            .order('starting_at', {ascending: false})
            .limit(6);
        if (error) throw error;
        return toFixtures(data);
    } catch (error) {
        logReadError('loadHeadToHead', error);
        return [];
    }
}

/** Last five finished matches of a team before `beforeIso`, newest first. */
async function loadForm(db: ReturnType<typeof footballDb>, teamId: number, beforeIso: string, excludeId: number): Promise<FormEntry[]> {
    try {
        const {data, error} = await db
            .from('fixtures')
            .select(FIXTURE_LIST_SELECT)
            .or(`home_team_id.eq.${teamId},away_team_id.eq.${teamId}`)
            .eq('state', 'finished')
            .lt('starting_at', beforeIso)
            .neq('id', excludeId)
            .order('starting_at', {ascending: false})
            .limit(5);
        if (error) throw error;
        return toFixtures(data)
            .filter((f) => f.homeScore !== null && f.awayScore !== null)
            .map((f) => {
                const isHome = f.home.id === teamId;
                const mine = isHome ? f.homeScore! : f.awayScore!;
                const theirs = isHome ? f.awayScore! : f.homeScore!;
                return {
                    fixtureId: f.id,
                    result: mine > theirs ? 'W' : mine < theirs ? 'L' : 'D',
                    score: `${f.homeScore}-${f.awayScore}`,
                    opponent: isHome ? f.away : f.home,
                    home: isHome,
                    startingAt: f.startingAt,
                };
            });
    } catch (error) {
        logReadError('loadForm', error);
        return [];
    }
}
