import 'server-only';
import {featuredPriority} from '../competitions';
import {LIVE_STATES, type CompetitionPage, type CompetitionSummary, type FixtureSummary, type RankedPlayer, type RoundFixtures, type StandingGroup, type TeamSummary} from '../types';
import {
    FIXTURE_LIST_SELECT,
    LEAGUE_SELECT,
    STANDING_SELECT,
    TEAM_SELECT,
    footballDb,
    logReadError,
    roundNumber,
    toCompetition,
    toFixtures,
    toStandingRow,
    toTeam,
    type LeagueRow,
    type StandingQueryRow,
    type TeamRow,
} from './shared';
import {normalizePosition} from './matches';
import {fetchAll} from '@/lib/db/paginate';

export interface CompetitionListItem extends CompetitionSummary {
    season: {id: number; name: string; year: number} | null;
}

export interface CompetitionList {
    featured: CompetitionListItem[];
    countries: Array<{country: string; code: string | null; competitions: CompetitionListItem[]}>;
    total: number;
}

/** Every active competition: featured first, the rest grouped by country. */
export async function listCompetitions(): Promise<CompetitionList> {
    try {
        const db = footballDb();
        const data = await fetchAll((a, b) => db.from('leagues').select(`${LEAGUE_SELECT},seasons(id,name,year,is_current)`).eq('is_active', true).order('id').range(a, b), {max: 5000});
        const items = (data as unknown as Array<LeagueRow & {seasons: Array<{id: number; name: string; year: number; is_current: boolean}>}>).map((row) => {
            const season = row.seasons?.find((s) => s.is_current) ?? null;
            return {...toCompetition(row), season: season ? {id: season.id, name: season.name, year: season.year} : null};
        });

        const featured = items.filter((c) => c.featured).sort((a, b) => featuredPriority(a.slug) - featuredPriority(b.slug));
        const byCountry = new Map<string, {country: string; code: string | null; competitions: CompetitionListItem[]}>();
        for (const c of items) {
            const country = c.country ?? 'World';
            if (!byCountry.has(country)) byCountry.set(country, {country, code: c.countryCode, competitions: []});
            byCountry.get(country)!.competitions.push(c);
        }
        const countries = [...byCountry.values()]
            .map((b) => ({...b, competitions: b.competitions.sort((a, c) => a.name.localeCompare(c.name))}))
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

interface RankingRow {
    position: string | null;
    appearances: number | null;
    minutes: number | null;
    goals: number | null;
    assists: number | null;
    penalties_scored: number | null;
    rating: number | null;
    yellow_cards: number | null;
    red_cards: number | null;
    player: {id: number; name: string; slug: string; image_url: string | null} | null;
    team: TeamRow | null;
}

const RANKING_SELECT = `position,appearances,minutes,goals,assists,penalties_scored,rating,yellow_cards,red_cards,player:players(id,name,slug,image_url),team:teams(${TEAM_SELECT})`;

function toRanked(r: RankingRow): RankedPlayer | null {
    if (!r.player || !r.team) return null;
    return {
        player: {id: r.player.id, name: r.player.name, slug: r.player.slug, imageUrl: r.player.image_url},
        team: toTeam(r.team),
        position: normalizePosition(r.position),
        appearances: r.appearances ?? 0,
        minutes: r.minutes ?? 0,
        goals: r.goals ?? 0,
        assists: r.assists ?? 0,
        penaltiesScored: r.penalties_scored ?? 0,
        rating: r.rating,
        yellowCards: r.yellow_cards ?? 0,
        redCards: r.red_cards ?? 0,
    };
}

/** Season rankings from player_season_stats: scorers and assists. */
export async function getRankings(leagueId: number, seasonYear: number): Promise<CompetitionPage['rankings']> {
    const db = footballDb();
    const base = () => db.from('player_season_stats').select(RANKING_SELECT).eq('league_id', leagueId).eq('season_year', seasonYear);
    const [scorersRes, assistsRes] = await Promise.all([
        base().gt('goals', 0).order('goals', {ascending: false}).order('assists', {ascending: false}).order('minutes', {ascending: true}).limit(20),
        base().gt('assists', 0).order('assists', {ascending: false}).order('goals', {ascending: false}).order('minutes', {ascending: true}).limit(20),
    ]);
    for (const res of [scorersRes, assistsRes]) if (res.error) throw res.error;
    const map = (rows: unknown) => ((rows ?? []) as RankingRow[]).map(toRanked).filter((r): r is RankedPlayer => r !== null);
    return {scorers: map(scorersRes.data), assists: map(assistsRes.data)};
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
        const emptyRankings = {scorers: [], assists: []};
        if (!current) {
            return {competition, season: null, standings: [], rounds: [], teams: [], currentRound: null, results: [], upcoming: [], live: [], rankings: emptyRankings, pastRankings: []};
        }

        const [standingsRes, fixturesRes, rankings, statSeasons] = await Promise.all([
            db.from('standings').select(STANDING_SELECT).eq('season_id', current.id).order('group').order('position'),
            db.from('fixtures').select(FIXTURE_LIST_SELECT).eq('season_id', current.id).order('starting_at', {ascending: true}).limit(1000),
            getRankings(competition.id, current.year).catch((error) => {
                logReadError(`getRankings(${slug})`, error);
                return emptyRankings;
            }),
            getStatSeasons(competition.id),
        ]);
        const pastRankings = await Promise.all(
            statSeasons
                .filter((s) => s.year !== current.year)
                .slice(0, 5)
                .map(async (s) => ({year: s.year, name: s.name, rankings: await getRankings(competition.id, s.year).catch(() => emptyRankings)})),
        );
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

        // Every round, ordered by its first kick-off (newest first); the round
        // to open is the last one with a match played or in play, else the first.
        const rounds = groupByRound(fixtures)
            .map((r) => ({...r, first: r.fixtures[0]?.startingAt ?? ''}))
            .sort((a, b) => b.first.localeCompare(a.first) || (roundNumber(b.round) ?? 0) - (roundNumber(a.round) ?? 0))
            .map(({round, fixtures: list}) => ({round, fixtures: list}));
        const teamMap = new Map<number, TeamSummary>();
        for (const g of groups.values()) for (const r of g.rows) teamMap.set(r.team.id, r.team);
        if (teamMap.size === 0) for (const f of fixtures) {
            teamMap.set(f.home.id, f.home);
            teamMap.set(f.away.id, f.away);
        }
        const teams = [...teamMap.values()].sort((a, b) => a.name.localeCompare(b.name));
        const played = rounds.find((r) => r.fixtures.some((f) => LIVE_STATES.includes(f.state) || f.state === 'finished'));
        const currentRound = played?.round ?? rounds[rounds.length - 1]?.round ?? null;

        const results = groupByRound(finished).sort((a, b) => (roundNumber(b.round) ?? 0) - (roundNumber(a.round) ?? 0)).slice(0, 3);
        for (const r of results) r.fixtures.sort((a, b) => b.startingAt.localeCompare(a.startingAt));
        const upcoming = groupByRound(scheduled).slice(0, 3);

        return {
            competition,
            season: {id: current.id, name: current.name, year: current.year},
            standings: [...groups.values()].sort((a, b) => a.name.localeCompare(b.name)),
            rounds,
            teams,
            currentRound,
            results,
            upcoming,
            live,
            rankings,
            pastRankings,
        };
    } catch (error) {
        logReadError(`getCompetitionPage(${slug})`, error);
        return null;
    }
}

/** Compact table of a competition's current season for side rails (main group only). */
export async function getStandingsBySlug(slug: string): Promise<{competition: CompetitionSummary; groups: StandingGroup[]} | null> {
    try {
        const db = footballDb();
        const {data: leagueRow, error} = await db.from('leagues').select(`${LEAGUE_SELECT},seasons!inner(id,is_current)`).eq('slug', slug).eq('seasons.is_current', true).maybeSingle();
        if (error) throw error;
        if (!leagueRow) return null;
        const league = leagueRow as unknown as LeagueRow & {seasons: Array<{id: number}>};
        const seasonId = league.seasons?.[0]?.id;
        if (!seasonId) return null;
        const {data, error: standingsError} = await db.from('standings').select(STANDING_SELECT).eq('season_id', seasonId).order('group').order('position').limit(120);
        if (standingsError) throw standingsError;
        const groups = new Map<string, StandingGroup>();
        for (const r of (data ?? []) as unknown as StandingQueryRow[]) {
            const row = toStandingRow(r);
            if (!row) continue;
            if (!groups.has(r.group)) groups.set(r.group, {name: r.group, rows: []});
            groups.get(r.group)!.rows.push(row);
        }
        const list = [...groups.values()].sort((a, b) => a.name.localeCompare(b.name));
        return {competition: toCompetition(league), groups: list.slice(0, 1)};
    } catch (error) {
        logReadError(`getStandingsBySlug(${slug})`, error);
        return null;
    }
}

export interface StatSeason {
    id: number;
    year: number;
    name: string;
    isCurrent: boolean;
}

/** Seasons of a league whose player statistics have been imported, newest first. */
export async function getStatSeasons(leagueId: number): Promise<StatSeason[]> {
    try {
        const db = footballDb();
        const {data, error} = await db.from('seasons').select('id,year,name,is_current').eq('league_id', leagueId).not('players_synced_at', 'is', null).order('year', {ascending: false}).limit(8);
        if (error) throw error;
        return ((data ?? []) as Array<{id: number; year: number; name: string; is_current: boolean}>).map((s) => ({id: s.id, year: s.year, name: s.name, isCurrent: s.is_current}));
    } catch (error) {
        logReadError(`getStatSeasons(${leagueId})`, error);
        return [];
    }
}
