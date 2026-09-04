import 'server-only';
import {LIVE_STATES, type SquadPlayer, type TeamPage, type TeamSeasonStats, type TeamStandingLine} from '../types';
import {normalizePosition} from './matches';
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
        const [pastRes, futureRes, standingsRes, squadRes, sidelinedRes, seasonStats] = await Promise.all([
            db.from('fixtures').select(FIXTURE_SELECT).or(`home_team_id.eq.${team.id},away_team_id.eq.${team.id}`).lte('starting_at', now).order('starting_at', {ascending: false}).limit(8),
            db.from('fixtures').select(FIXTURE_SELECT).or(`home_team_id.eq.${team.id},away_team_id.eq.${team.id}`).gt('starting_at', now).order('starting_at', {ascending: true}).limit(6),
            db.from('standings').select(`${STANDING_SELECT},season:seasons!inner(id,name,year,is_current,league:leagues(${LEAGUE_SELECT}))`).eq('team_id', team.id).eq('seasons.is_current', true),
            db.from('squad_members').select('jersey_number,season:seasons!inner(is_current),player:players(id,name,slug,position,age,image_url)').eq('team_id', team.id).eq('seasons.is_current', true),
            db.from('sidelined').select('category,description,player:players(id,name,slug,position,age,image_url)').eq('team_id', team.id).order('start_date', {ascending: false}).limit(30),
            loadSeasonStats(db, team.id),
        ]);
        for (const res of [pastRes, futureRes, standingsRes, squadRes, sidelinedRes]) if (res.error) throw res.error;

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

        const seen = new Set<number>();
        const sidelined = ((sidelinedRes.data ?? []) as unknown as Array<{category: string; description: string | null; player: Parameters<typeof toSquadPlayer>[0] | null}>)
            .filter((s) => s.player && !seen.has(s.player.id) && seen.add(s.player.id))
            .map((s) => ({player: toSquadPlayer(s.player!, null), category: s.category, description: s.description}));

        return {
            team: {...toTeam(team), country: team.country, venue: team.venue_name, founded: team.founded},
            standings,
            recent,
            upcoming: toFixtures(futureRes.data),
            live,
            squad,
            sidelined,
            seasonStats,
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
