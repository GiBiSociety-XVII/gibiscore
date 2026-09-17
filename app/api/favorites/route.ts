import {NextResponse, type NextRequest} from 'next/server';
import {footballDb, LEAGUE_SELECT, TEAM_SELECT, toCompetition, toTeam, type LeagueRow, type TeamRow} from '@/lib/football/data/shared';
import type {CompetitionSummary, TeamSummary} from '@/lib/football/types';

// Names and logos of favourite competitions and teams, by slug, for the profile page. Public data, cached a few minutes.
export const revalidate = 300;

const slugs = (raw: string | null, limit: number): string[] => (raw ?? '').split(',').map((s) => s.trim()).filter((s) => /^[a-z0-9-]{1,80}$/.test(s)).slice(0, limit);

export async function GET(request: NextRequest) {
    const competitions = slugs(request.nextUrl.searchParams.get('competitions'), 20);
    const teams = slugs(request.nextUrl.searchParams.get('teams'), 30);
    const db = footballDb();
    const [leagueRes, teamRes] = await Promise.all([
        competitions.length > 0 ? db.from('leagues').select(LEAGUE_SELECT).in('slug', competitions) : Promise.resolve({data: [], error: null}),
        teams.length > 0 ? db.from('teams').select(TEAM_SELECT).in('slug', teams) : Promise.resolve({data: [], error: null}),
    ]);
    if (leagueRes.error || teamRes.error) return NextResponse.json({error: 'read failed'}, {status: 500});
    const byLeague = new Map(((leagueRes.data ?? []) as unknown as LeagueRow[]).map((r) => [r.slug, toCompetition(r)]));
    const byTeam = new Map(((teamRes.data ?? []) as unknown as TeamRow[]).map((r) => [r.slug, toTeam(r)]));
    // In the order the user starred them.
    const body: {competitions: CompetitionSummary[]; teams: TeamSummary[]} = {
        competitions: competitions.map((s) => byLeague.get(s)).filter((c): c is CompetitionSummary => !!c),
        teams: teams.map((s) => byTeam.get(s)).filter((t): t is TeamSummary => !!t),
    };
    return NextResponse.json(body, {headers: {'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600'}});
}
