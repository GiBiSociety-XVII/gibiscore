import 'server-only';
import {LIVE_STATES, type SquadPlayer, type TeamPage, type TeamStandingLine} from '../types';
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
        const [pastRes, futureRes, standingsRes, squadRes, sidelinedRes] = await Promise.all([
            db.from('fixtures').select(FIXTURE_SELECT).or(`home_team_id.eq.${team.id},away_team_id.eq.${team.id}`).lte('starting_at', now).order('starting_at', {ascending: false}).limit(8),
            db.from('fixtures').select(FIXTURE_SELECT).or(`home_team_id.eq.${team.id},away_team_id.eq.${team.id}`).gt('starting_at', now).order('starting_at', {ascending: true}).limit(6),
            db.from('standings').select(`${STANDING_SELECT},season:seasons!inner(id,name,year,is_current,league:leagues(${LEAGUE_SELECT}))`).eq('team_id', team.id).eq('seasons.is_current', true),
            db.from('squad_members').select('jersey_number,season:seasons!inner(is_current),player:players(id,name,slug,position,age,image_url)').eq('team_id', team.id).eq('seasons.is_current', true),
            db.from('sidelined').select('category,description,player:players(id,name,slug,position,age,image_url)').eq('team_id', team.id).order('start_date', {ascending: false}).limit(30),
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

        const squad = ((squadRes.data ?? []) as unknown as Array<{jersey_number: number | null; player: Parameters<typeof toSquadPlayer>[0] | null}>)
            .filter((m) => m.player)
            .map((m) => toSquadPlayer(m.player!, m.jersey_number))
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
        };
    } catch (error) {
        logReadError(`getTeamPage(${slug})`, error);
        return null;
    }
}
