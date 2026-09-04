import 'server-only';
import {LIVE_STATES, type FixtureSummary, type SquadPlayer, type TeamPage, type TeamPlayerSeason, type TeamSeasonStats, type TeamStandingLine, type TeamSummary} from '../types';
import {normalizePosition} from './matches';
import {loadTeamSidelined} from './sidelined';
import {FIXTURE_SELECT, LEAGUE_SELECT, STANDING_SELECT, TEAM_SELECT, footballDb, logReadError, toCompetition, toFixtures, toStandingRow, toTeam, type LeagueRow, type StandingQueryRow, type TeamRow} from './shared';

const POSITION_ORDER: Record<string, number> = {goalkeeper: 0, defender: 1, midfielder: 2, attacker: 3};

export async function getTeamPage(slug: string): Promise<TeamPage | null> {
    try {
        const db = footballDb();
        const {data: teamRow, error: teamError} = await db
            .from('teams')
            .select(`${TEAM_SELECT},country,venue_name,founded`)
            .eq('slug', slug)
            .maybeSingle();
        if (teamError) throw teamError;
        if (!teamRow) return null;
        const team = teamRow as unknown as TeamRow & {country: string | null; venue_name: string | null; founded: number | null};

        const now = new Date().toISOString();
        const [pastRes, futureRes, standingsRes, squadRes, sidelinedRes, seasonStats, players, calendarRes] = await Promise.all([
            db.from('fixtures').select(FIXTURE_SELECT).or(`home_team_id.eq.${team.id},away_team_id.eq.${team.id}`).lte('starting_at', now).order('starting_at', {ascending: false}).limit(8),
            db.from('fixtures').select(FIXTURE_SELECT).or(`home_team_id.eq.${team.id},away_team_id.eq.${team.id}`).gt('starting_at', now).order('starting_at', {ascending: true}).limit(6),
            db.from('standings').select(`${STANDING_SELECT},season:seasons!inner(id,name,year,is_current,league:leagues(${LEAGUE_SELECT}))`).eq('team_id', team.id).eq('seasons.is_current', true),
            db.from('squad_members').select('jersey_number,season:seasons!inner(is_current),player:players(id,name,slug,position,age,image_url)').eq('team_id', team.id).eq('seasons.is_current', true),
            loadTeamSidelined(db, [team.id]),
            loadSeasonStats(db, team.id),
            loadPlayers(db, team.id),
            db.from('fixtures').select(`${FIXTURE_SELECT},season:seasons!inner(is_current)`).or(`home_team_id.eq.${team.id},away_team_id.eq.${team.id}`).eq('seasons.is_current', true).order('starting_at', {ascending: true}).limit(120),
        ]);
        for (const res of [pastRes, futureRes, standingsRes, squadRes, calendarRes]) if (res.error) throw res.error;

        const past = toFixtures(pastRes.data);
        const live = past.filter((f) => LIVE_STATES.includes(f.state));
        const recent = past.filter((f) => !LIVE_STATES.includes(f.state)).slice(0, 5);

        // Standing line needs the size of the table: one extra count per season.
        const standings: TeamStandingLine[] = [];
        for (const r of (standingsRes.data ?? []) as unknown as Array<StandingQueryRow & {season: {id: number; name: string; year: number; league: LeagueRow | null}}>) {
            const row = toStandingRow(r);
            if (!row || !r.season?.league || r.group !== '') continue;
            const {count} = await db.from('standings').select('team_id', {count: 'exact', head: true}).eq('season_id', r.season.id).eq('group', '');
            standings.push({
                competition: toCompetition(r.season.league),
                season: {id: r.season.id, name: r.season.name, year: r.season.year},
                row,
                totalTeams: count ?? row.position,
            });
        }

        const toSquadPlayer = (p: {id: number; name: string; slug: string; position: string | null; age: number | null; image_url: string | null}, number: number | null): SquadPlayer => ({
            id: p.id,
            name: p.name,
            slug: p.slug,
            number,
            position: normalizePosition(p.position),
            age: p.age,
            imageUrl: p.image_url,
        });

        // The squad is stored once per current competition the team plays
        // (league, cup, Europe): one line per player, whatever the source.
        const byPlayer = new Map<number, ReturnType<typeof toSquadPlayer>>();
        for (const m of (squadRes.data ?? []) as unknown as Array<{jersey_number: number | null; player: Parameters<typeof toSquadPlayer>[0] | null}>) {
            if (!m.player) continue;
            const existing = byPlayer.get(m.player.id);
            if (!existing || (existing.number === null && m.jersey_number !== null)) byPlayer.set(m.player.id, toSquadPlayer(m.player, m.jersey_number));
        }
        const squad = [...byPlayer.values()]
            .sort((a, b) => (POSITION_ORDER[a.position ?? ''] ?? 9) - (POSITION_ORDER[b.position ?? ''] ?? 9) || (a.number ?? 99) - (b.number ?? 99));

        const sidelined = sidelinedRes.get(team.id) ?? [];

        return {
            team: {...toTeam(team), country: team.country, venue: team.venue_name, founded: team.founded},
            standings,
            recent,
            upcoming: toFixtures(futureRes.data),
            live,
            squad,
            sidelined,
            seasonStats,
            players,
            calendar: toFixtures(calendarRes.data),
        };
    } catch (error) {
        logReadError(`getTeamPage(${slug})`, error);
        return null;
    }
}

interface SeasonStatRow {
    possession: number | null;
    shots_total: number | null;
    shots_on_target: number | null;
    corners: number | null;
    xg: number | null;
    fixture: {home_team_id: number; away_team_id: number; home_score: number | null; away_score: number | null} | null;
}

/** Record and per-match averages over the finished matches of the current seasons. */
async function loadSeasonStats(db: ReturnType<typeof footballDb>, teamId: number): Promise<TeamSeasonStats | null> {
    try {
        const [fixturesRes, statsRes] = await Promise.all([
            db
                .from('fixtures')
                .select('id,home_team_id,away_team_id,home_score,away_score,season:seasons!inner(is_current)')
                .or(`home_team_id.eq.${teamId},away_team_id.eq.${teamId}`)
                .eq('state', 'finished')
                .eq('seasons.is_current', true)
                .limit(80),
            db
                .from('fixture_team_stats')
                .select('possession,shots_total,shots_on_target,corners,xg,fixture:fixtures!inner(home_team_id,away_team_id,home_score,away_score,state,season:seasons!inner(is_current))')
                .eq('team_id', teamId)
                .eq('fixtures.state', 'finished')
                .eq('fixtures.seasons.is_current', true)
                .limit(80),
        ]);
        if (fixturesRes.error) throw fixturesRes.error;
        if (statsRes.error) throw statsRes.error;
        const fixtures = (fixturesRes.data ?? []) as unknown as Array<{home_team_id: number; away_team_id: number; home_score: number | null; away_score: number | null}>;
        if (fixtures.length === 0) return null;
        const out: TeamSeasonStats = {played: 0, won: 0, drawn: 0, lost: 0, goalsFor: 0, goalsAgainst: 0, cleanSheets: 0, withStats: 0, avgPossession: null, avgShots: null, avgShotsOnTarget: null, avgCorners: null, avgXg: null};
        for (const f of fixtures) {
            if (f.home_score === null || f.away_score === null) continue;
            const home = f.home_team_id === teamId;
            const mine = home ? f.home_score : f.away_score;
            const theirs = home ? f.away_score : f.home_score;
            out.played += 1;
            out.goalsFor += mine;
            out.goalsAgainst += theirs;
            if (theirs === 0) out.cleanSheets += 1;
            if (mine > theirs) out.won += 1;
            else if (mine < theirs) out.lost += 1;
            else out.drawn += 1;
        }
        const rows = (statsRes.data ?? []) as unknown as SeasonStatRow[];
        const avg = (pick: (r: SeasonStatRow) => number | null) => {
            const values = rows.map(pick).filter((v): v is number => v !== null);
            return values.length ? Math.round((values.reduce((s, v) => s + v, 0) / values.length) * 10) / 10 : null;
        };
        out.withStats = rows.length;
        out.avgPossession = avg((r) => r.possession);
        out.avgShots = avg((r) => r.shots_total);
        out.avgShotsOnTarget = avg((r) => r.shots_on_target);
        out.avgCorners = avg((r) => r.corners);
        out.avgXg = avg((r) => (r.xg === null ? null : Number(r.xg)));
        return out;
    } catch (error) {
        logReadError('loadSeasonStats', error);
        return null;
    }
}

interface PlayerSeasonRow {
    season_year: number;
    position: string | null;
    jersey_number: number | null;
    appearances: number | null;
    lineups: number | null;
    minutes: number | null;
    goals: number | null;
    assists: number | null;
    rating: number | null;
    yellow_cards: number | null;
    yellow_red_cards: number | null;
    red_cards: number | null;
    player: {id: number; name: string; slug: string; image_url: string | null} | null;
    season: {is_current: boolean} | null;
}

/** Season totals of every player who played for the team this season, summed over competitions. */
async function loadPlayers(db: ReturnType<typeof footballDb>, teamId: number): Promise<TeamPlayerSeason[]> {
    try {
        const {data, error} = await db
            .from('player_season_stats')
            .select('season_year,position,jersey_number,appearances,lineups,minutes,goals,assists,rating,yellow_cards,yellow_red_cards,red_cards,player:players(id,name,slug,image_url),season:seasons!inner(is_current)')
            .eq('team_id', teamId)
            .eq('seasons.is_current', true)
            .limit(400);
        if (error) throw error;
        const byPlayer = new Map<number, TeamPlayerSeason & {ratingWeight: number; ratingSum: number}>();
        for (const r of (data ?? []) as unknown as PlayerSeasonRow[]) {
            if (!r.player) continue;
            const apps = r.appearances ?? 0;
            const cur = byPlayer.get(r.player.id) ?? {
                player: {id: r.player.id, name: r.player.name, slug: r.player.slug, imageUrl: r.player.image_url},
                position: normalizePosition(r.position),
                number: r.jersey_number,
                appearances: 0, lineups: 0, minutes: 0, goals: 0, assists: 0, rating: null, yellowCards: 0, redCards: 0,
                ratingWeight: 0, ratingSum: 0,
            };
            cur.appearances += apps;
            cur.lineups += r.lineups ?? 0;
            cur.minutes += r.minutes ?? 0;
            cur.goals += r.goals ?? 0;
            cur.assists += r.assists ?? 0;
            cur.yellowCards += (r.yellow_cards ?? 0) + (r.yellow_red_cards ?? 0);
            cur.redCards += r.red_cards ?? 0;
            if (r.rating !== null && apps > 0) {
                cur.ratingSum += Number(r.rating) * apps;
                cur.ratingWeight += apps;
            }
            if (cur.number === null && r.jersey_number !== null) cur.number = r.jersey_number;
            byPlayer.set(r.player.id, cur);
        }
        const order: Record<string, number> = {goalkeeper: 0, defender: 1, midfielder: 2, attacker: 3};
        return [...byPlayer.values()]
            .map(({ratingSum, ratingWeight, ...p}) => ({...p, rating: ratingWeight > 0 ? Math.round((ratingSum / ratingWeight) * 100) / 100 : null}))
            .sort((a, b) => (order[a.position ?? ''] ?? 9) - (order[b.position ?? ''] ?? 9) || b.minutes - a.minutes);
    } catch (error) {
        logReadError('loadPlayers', error);
        return [];
    }
}

export interface TeamBrief {
    team: TeamSummary;
    /** Match in play, else the next scheduled one. */
    next: FixtureSummary | null;
    last: FixtureSummary | null;
}

/** For the "my teams" rail: the team, its last result and its next (or live) match. */
export async function getTeamBrief(slug: string): Promise<TeamBrief | null> {
    try {
        const db = footballDb();
        const {data: teamRow, error} = await db.from('teams').select(TEAM_SELECT).eq('slug', slug).maybeSingle();
        if (error) throw error;
        if (!teamRow) return null;
        const team = toTeam(teamRow as unknown as TeamRow);
        const now = new Date().toISOString();
        const filter = `home_team_id.eq.${team.id},away_team_id.eq.${team.id}`;
        const [liveRes, nextRes, lastRes] = await Promise.all([
            db.from('fixtures').select(FIXTURE_SELECT).or(filter).in('state', [...LIVE_STATES]).limit(1),
            db.from('fixtures').select(FIXTURE_SELECT).or(filter).gt('starting_at', now).eq('state', 'scheduled').order('starting_at', {ascending: true}).limit(1),
            db.from('fixtures').select(FIXTURE_SELECT).or(filter).eq('state', 'finished').order('starting_at', {ascending: false}).limit(1),
        ]);
        for (const res of [liveRes, nextRes, lastRes]) if (res.error) throw res.error;
        return {
            team,
            next: toFixtures(liveRes.data)[0] ?? toFixtures(nextRes.data)[0] ?? null,
            last: toFixtures(lastRes.data)[0] ?? null,
        };
    } catch (error) {
        logReadError(`getTeamBrief(${slug})`, error);
        return null;
    }
}
