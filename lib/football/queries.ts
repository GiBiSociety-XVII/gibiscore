import 'server-only';
import {createPublicClient} from '@/lib/db/server';
import {COMPETITIONS} from './competitions';
import {SAMPLE_HOME_DATA} from './sample';
import type {FixtureState, FixtureSummary, HomeData, StandingRow, TeamSummary} from './types';

/**
 * Data access for pages. Pages call these functions and never touch
 * Sportmonks directly. Reads go through the public anon client (RLS: public
 * read, no cookies so pages stay cacheable), which requires the `football`
 * schema to be exposed in the Supabase Data API settings.
 *
 * While the database is empty (or unreachable) the home page falls back to
 * sample data, clearly flagged with `isSample`.
 */

interface TeamRow {
    id: number;
    name: string;
    short_code: string | null;
    logo_url: string | null;
}

interface FixtureRow {
    id: number;
    round: string | null;
    starting_at: string;
    state: FixtureState;
    minute: number | null;
    home_score: number | null;
    away_score: number | null;
    league: {name: string; slug: string} | null;
    home: TeamRow | null;
    away: TeamRow | null;
    stats: Array<{team_id: number; possession: number | null; shots_total: number | null; xg: number | null}> | null;
}

const LIVE: FixtureState[] = ['live', 'half_time', 'extra_time', 'penalties'];

function team(row: TeamRow): TeamSummary {
    return {id: row.id, name: row.name, shortCode: row.short_code, logoUrl: row.logo_url};
}

function toFixtureSummary(row: FixtureRow): FixtureSummary | null {
    if (!row.home || !row.away || !row.league) return null;
    const homeStats = row.stats?.find((s) => s.team_id === row.home!.id) ?? null;
    const awayStats = row.stats?.find((s) => s.team_id === row.away!.id) ?? null;
    const hasStats = homeStats !== null || awayStats !== null;
    return {
        id: row.id,
        leagueName: row.league.name,
        round: row.round,
        startingAt: row.starting_at,
        state: row.state,
        minute: row.minute,
        home: team(row.home),
        away: team(row.away),
        homeScore: row.home_score,
        awayScore: row.away_score,
        stats: hasStats
            ? {
                  homePossession: homeStats?.possession ?? null,
                  homeShots: homeStats?.shots_total ?? null,
                  awayShots: awayStats?.shots_total ?? null,
                  homeXg: homeStats?.xg ?? null,
                  awayXg: awayStats?.xg ?? null,
              }
            : null,
        form: null,
    };
}

const FIXTURE_SELECT =
    'id,round,starting_at,state,minute,home_score,away_score,' +
    'league:leagues(name,slug),' +
    'home:teams!fixtures_home_team_id_fkey(id,name,short_code,logo_url),' +
    'away:teams!fixtures_away_team_id_fkey(id,name,short_code,logo_url),' +
    'stats:fixture_team_stats(team_id,possession,shots_total,xg)';

export async function getHomeData(): Promise<HomeData> {
    try {
        const db = createPublicClient().schema('football');

        const now = Date.now();
        const from = new Date(now - 12 * 3_600_000).toISOString();
        const to = new Date(now + 36 * 3_600_000).toISOString();

        const {data, error: fixturesError} = await db
            .from('fixtures')
            .select(FIXTURE_SELECT)
            .gte('starting_at', from)
            .lte('starting_at', to)
            .order('starting_at', {ascending: true})
            .limit(60);
        if (fixturesError) throw fixturesError;
        const fixtureRows = (data ?? []) as unknown as FixtureRow[];

        const summaries = fixtureRows.map(toFixtureSummary).filter((f): f is FixtureSummary => f !== null);
        if (summaries.length === 0) {
            // Empty database: keep showing the sample until the sync jobs run.
            return SAMPLE_HOME_DATA;
        }

        const priority = new Map(COMPETITIONS.map((c) => [c.name, c.priority]));
        const rank = (f: FixtureSummary) => (LIVE.includes(f.state) ? 0 : f.state === 'scheduled' ? 1 : 2);
        summaries.sort((a, b) => rank(a) - rank(b) || (priority.get(a.leagueName) ?? 99) - (priority.get(b.leagueName) ?? 99) || a.startingAt.localeCompare(b.startingAt));

        // Serie A first; while it is not in the subscription (validation mode)
        // fall back to whatever current season has a table.
        const standings = (await getStandings(db, 'serie-a', 6)) ?? (await getStandings(db, null, 6));

        return {
            isSample: false,
            liveCount: summaries.filter((f) => LIVE.includes(f.state)).length,
            fixtures: summaries.slice(0, 6),
            standings: standings ?? {leagueName: 'Serie A', rows: []},
            spotlight: null,
        };
    } catch (error) {
        console.error('[queries] getHomeData fell back to sample data:', (error as Error).message);
        return SAMPLE_HOME_DATA;
    }
}

interface StandingQueryRow {
    position: number;
    played: number;
    won: number;
    drawn: number;
    lost: number;
    goals_for: number;
    goals_against: number;
    points: number;
    team: TeamRow | null;
}

type SchemaClient = ReturnType<ReturnType<typeof createPublicClient>['schema']>;

async function getStandings(
    db: SchemaClient,
    leagueSlug: string | null,
    limit: number,
): Promise<{leagueName: string; rows: StandingRow[]} | null> {
    let seasonQuery = db
        .from('seasons')
        .select('id,league:leagues!inner(name,slug)')
        .eq('is_current', true);
    if (leagueSlug) seasonQuery = seasonQuery.eq('leagues.slug', leagueSlug);
    const {data: seasonRows, error: seasonError} = await seasonQuery.limit(10);
    if (seasonError || !seasonRows || seasonRows.length === 0) return null;
    const seasons = seasonRows as unknown as Array<{id: number; league: {name: string; slug: string}}>;

    for (const season of seasons) {
        const {data, error} = await db
            .from('standings')
            .select('position,played,won,drawn,lost,goals_for,goals_against,points,team:teams(id,name,short_code,logo_url)')
            .eq('season_id', season.id)
            .eq('group', '')
            .order('position', {ascending: true})
            .limit(limit);
        if (error || !data || data.length === 0) continue;
        return buildStandings(season.league.name, data as unknown as StandingQueryRow[]);
    }
    return null;
}

function buildStandings(leagueName: string, rows: StandingQueryRow[]): {leagueName: string; rows: StandingRow[]} {
    return {
        leagueName,
        rows: rows
            .filter((r) => r.team)
            .map((r) => ({
                position: r.position,
                team: team(r.team!),
                played: r.played,
                won: r.won,
                drawn: r.drawn,
                lost: r.lost,
                goalDifference: r.goals_for - r.goals_against,
                points: r.points,
            })),
    };
}
