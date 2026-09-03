import 'server-only';
import {featuredPriority} from '../competitions';
import {LIVE_STATES, type CompetitionPage, type CompetitionSummary, type FixtureSummary, type RoundFixtures, type StandingGroup} from '../types';
import {
    FIXTURE_SELECT,
    LEAGUE_SELECT,
    STANDING_SELECT,
    footballDb,
    logReadError,
    roundNumber,
    toCompetition,
    toFixtures,
    toStandingRow,
    type LeagueRow,
    type StandingQueryRow,
} from './shared';

export interface CompetitionListItem extends CompetitionSummary {
    season: {id: number; name: string; year: number} | null;
}

export interface CompetitionList {
    featured: CompetitionListItem[];
    countries: Array<{country: string; competitions: CompetitionListItem[]}>;
    total: number;
}

/** Every active competition: featured first, the rest grouped by country. */
export async function listCompetitions(): Promise<CompetitionList> {
    try {
        const db = footballDb();
        const {data, error} = await db
            .from('leagues')
            .select(`${LEAGUE_SELECT},seasons(id,name,year,is_current)`)
            .eq('is_active', true)
            .limit(3000);
        if (error) throw error;
        const items = ((data ?? []) as unknown as Array<LeagueRow & {seasons: Array<{id: number; name: string; year: number; is_current: boolean}>}>).map((row) => {
            const season = row.seasons?.find((s) => s.is_current) ?? null;
            return {...toCompetition(row), season: season ? {id: season.id, name: season.name, year: season.year} : null};
        });

        const featured = items.filter((c) => c.featured).sort((a, b) => featuredPriority(a.slug) - featuredPriority(b.slug));
        const byCountry = new Map<string, CompetitionListItem[]>();
        for (const c of items) {
            if (c.featured) continue;
            const country = c.country ?? 'World';
            if (!byCountry.has(country)) byCountry.set(country, []);
            byCountry.get(country)!.push(c);
        }
        const countries = [...byCountry.entries()]
            .map(([country, competitions]) => ({country, competitions: competitions.sort((a, b) => a.name.localeCompare(b.name))}))
            .sort((a, b) => (a.country === 'World' ? -1 : b.country === 'World' ? 1 : a.country.localeCompare(b.country)));

        return {featured, countries, total: items.length};
    } catch (error) {
        logReadError('listCompetitions', error);
        return {featured: [], countries: [], total: 0};
    }
}

function groupByRound(fixtures: FixtureSummary[]): RoundFixtures[] {
    const map = new Map<string, FixtureSummary[]>();
    for (const f of fixtures) {
        const key = f.round ?? '';
        if (!map.has(key)) map.set(key, []);
        map.get(key)!.push(f);
    }
    return [...map.entries()].map(([round, list]) => ({round, fixtures: list}));
}

export async function getCompetitionPage(slug: string): Promise<CompetitionPage | null> {
    try {
        const db = footballDb();
        const {data: leagueRow, error: leagueError} = await db
            .from('leagues')
            .select(`${LEAGUE_SELECT},seasons(id,name,year,is_current)`)
            .eq('slug', slug)
            .maybeSingle();
        if (leagueError) throw leagueError;
        if (!leagueRow) return null;
        const league = leagueRow as unknown as LeagueRow & {seasons: Array<{id: number; name: string; year: number; is_current: boolean}>};
        const current = league.seasons?.find((s) => s.is_current) ?? null;
        const competition = toCompetition(league);
        if (!current) {
            return {competition, season: null, standings: [], results: [], upcoming: [], live: []};
        }

        const [standingsRes, fixturesRes] = await Promise.all([
            db.from('standings').select(STANDING_SELECT).eq('season_id', current.id).order('group').order('position'),
            db.from('fixtures').select(FIXTURE_SELECT).eq('season_id', current.id).order('starting_at', {ascending: true}).limit(600),
        ]);
        if (standingsRes.error) throw standingsRes.error;
        if (fixturesRes.error) throw fixturesRes.error;

        const groups = new Map<string, StandingGroup>();
        for (const r of (standingsRes.data ?? []) as unknown as StandingQueryRow[]) {
            const row = toStandingRow(r);
            if (!row) continue;
            if (!groups.has(r.group)) groups.set(r.group, {name: r.group, rows: []});
            groups.get(r.group)!.rows.push(row);
        }

        const fixtures = toFixtures(fixturesRes.data);
        const now = Date.now();
        const live = fixtures.filter((f) => LIVE_STATES.includes(f.state));
        const finished = fixtures.filter((f) => f.state === 'finished' || (f.state !== 'scheduled' && !LIVE_STATES.includes(f.state) && new Date(f.startingAt).getTime() < now));
        const scheduled = fixtures.filter((f) => f.state === 'scheduled' || (f.state === 'postponed' && new Date(f.startingAt).getTime() >= now));

        const results = groupByRound(finished).sort((a, b) => (roundNumber(b.round) ?? 0) - (roundNumber(a.round) ?? 0)).slice(0, 3);
        for (const r of results) r.fixtures.sort((a, b) => b.startingAt.localeCompare(a.startingAt));
        const upcoming = groupByRound(scheduled).slice(0, 3);

        return {
            competition,
            season: {id: current.id, name: current.name, year: current.year},
            standings: [...groups.values()].sort((a, b) => a.name.localeCompare(b.name)),
            results,
            upcoming,
            live,
        };
    } catch (error) {
        logReadError(`getCompetitionPage(${slug})`, error);
        return null;
    }
}
