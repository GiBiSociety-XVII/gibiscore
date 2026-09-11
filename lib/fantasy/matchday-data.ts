import 'server-only';
import {unstable_cache} from 'next/cache';
import {fetchAll} from '@/lib/db/paginate';
import {footballDb, logReadError} from '@/lib/football/data/shared';
import {loadTeamSidelined} from '@/lib/football/data/sidelined';
import {getSeasonStudy} from '@/lib/football/data/study';
import {predictMatch} from '@/lib/football/prediction';
import {AUCTION_LEAGUES, type AuctionLeague} from './config';
import type {MatchdayFixture, PlayerContext, RecentMatch} from './matchday';

/**
 * What a matchday looks like, for the lineup advice: the rounds of the
 * season and the one to play (live or next), its fixtures with the match
 * predictions, and for every player seen this season how his club has
 * used him lately, the official lineup once published, and whether he
 * is out. Cached ten minutes; the lineup sync refreshes it when official
 * lineups arrive.
 */

export interface MatchdayRound {
    round: string;
    from: string;
    to: string;
    state: 'played' | 'live' | 'next' | 'future';
}

export interface MatchdayContext {
    league: AuctionLeague;
    seasonId: number;
    rounds: MatchdayRound[];
    /** The round the advice is for: the one being played, else the next. */
    round: string;
    fixtures: MatchdayFixture[];
    /** Per player id: this season's use and absences (players never seen in a lineup are absent). */
    players: Record<number, Omit<PlayerContext, 'official'>>;
    /** Official lineups of the round, per player id, and the clubs that have published one. */
    official: Record<number, 'starter' | 'bench'>;
    officialTeams: number[];
    generatedAt: string;
}

/** How many of the club's last league matches say how a player is used. */
const RECENT_MATCHES = 8;
const FINISHED = new Set(['finished']);
const LIVE = new Set(['live', 'half_time', 'extra_time', 'penalties']);

interface FixtureRow {
    id: number;
    round: string | null;
    starting_at: string;
    state: string;
    home_team_id: number;
    away_team_id: number;
    home: {id: number; name: string} | null;
    away: {id: number; name: string} | null;
}

async function buildMatchday(league: AuctionLeague): Promise<MatchdayContext | null> {
    const slugs = AUCTION_LEAGUES.find((l) => l.key === league)?.slugs ?? [];
    // One competition, one calendar: a multi-league pool has no matchday of its own.
    if (slugs.length !== 1) return null;
    const db = footballDb();
    const {data: leagueRows, error: leagueError} = await db.from('leagues').select('id,slug,seasons(id,year,is_current)').eq('slug', slugs[0]).limit(1);
    if (leagueError) throw leagueError;
    const leagueRow = (leagueRows ?? [])[0] as unknown as {id: number; seasons: Array<{id: number; year: number; is_current: boolean}>} | undefined;
    const season = leagueRow?.seasons.find((s) => s.is_current) ?? leagueRow?.seasons.sort((a, b) => b.year - a.year)[0];
    if (!leagueRow || !season) return null;

    const rows = (await fetchAll(
        (a, b) => db.from('fixtures').select('id,round,starting_at,state,home_team_id,away_team_id,home:teams!fixtures_home_team_id_fkey(id,name),away:teams!fixtures_away_team_id_fkey(id,name)').eq('season_id', season.id).order('starting_at').order('id').range(a, b),
        {max: 1000},
    )) as unknown as FixtureRow[];
    const fixtures = rows.filter((r) => r.round && r.home && r.away);
    if (fixtures.length === 0) return null;

    // Rounds in calendar order; the next one is the first with a match still to play.
    const byRound = new Map<string, FixtureRow[]>();
    for (const f of fixtures) byRound.set(f.round!, [...(byRound.get(f.round!) ?? []), f]);
    const ordered = [...byRound.entries()].sort((a, b) => a[1][0].starting_at.localeCompare(b[1][0].starting_at));
    let nextFound = false;
    const rounds: MatchdayRound[] = ordered.map(([round, list]) => {
        const live = list.some((f) => LIVE.has(f.state));
        const open = list.some((f) => !FINISHED.has(f.state) && f.state !== 'cancelled');
        let state: MatchdayRound['state'] = 'played';
        if (live) state = 'live';
        else if (open && !nextFound) state = 'next';
        else if (open) state = 'future';
        if (state === 'next' || state === 'live') nextFound = true;
        return {round, from: list[0].starting_at, to: list[list.length - 1].starting_at, state};
    });
    // Only the round to play: a lineup for a later one would pretend to know how clubs and players will be by then.
    const round = rounds.find((r) => r.state === 'live' || r.state === 'next')?.round ?? rounds[rounds.length - 1].round;
    const roundFixtures = byRound.get(round) ?? [];

    // Predictions from the season's numbers.
    const study = await getSeasonStudy(season.id);
    const avgFor = new Map<number, number>();
    const formOf = new Map<number, string>();
    for (const t of study?.teams ?? []) {
        if (t.played > 0) avgFor.set(t.team.id, t.goalsFor / t.played);
        if (t.form.length > 0) formOf.set(t.team.id, t.form.join(''));
    }
    const matchday: MatchdayFixture[] = roundFixtures.map((f) => {
        const p = predictMatch(study, f.home_team_id, f.away_team_id);
        return {
            id: f.id,
            round,
            startingAt: f.starting_at,
            state: f.state,
            home: {id: f.home!.id, name: f.home!.name},
            away: {id: f.away!.id, name: f.away!.name},
            prediction: p ? {lambdaHome: p.lambda.home, lambdaAway: p.lambda.away, home: p.home, draw: p.draw, away: p.away} : null,
            avgFor: {home: avgFor.get(f.home_team_id) ?? null, away: avgFor.get(f.away_team_id) ?? null},
            form: {home: formOf.get(f.home_team_id) ?? null, away: formOf.get(f.away_team_id) ?? null},
        };
    });

    // How every club has used its players: the last matches of each, most recent first.
    const played = fixtures.filter((f) => FINISHED.has(f.state)).sort((a, b) => b.starting_at.localeCompare(a.starting_at));
    const teamIds = [...new Set(fixtures.flatMap((f) => [f.home_team_id, f.away_team_id]))];
    const recentOf = new Map<number, FixtureRow[]>();
    for (const teamId of teamIds) recentOf.set(teamId, played.filter((f) => f.home_team_id === teamId || f.away_team_id === teamId).slice(0, RECENT_MATCHES));
    const recentIds = [...new Set([...recentOf.values()].flat().map((f) => f.id))];
    const [lineupRows, statRows, officialRows, sidelined] = await Promise.all([
        recentIds.length > 0
            ? (fetchAll((a, b) => db.from('lineups').select('fixture_id,team_id,player_id,is_starter').in('fixture_id', recentIds).eq('is_expected', false).order('fixture_id').order('player_id').range(a, b), {max: 20000}) as Promise<Array<{fixture_id: number; team_id: number; player_id: number; is_starter: boolean}>>)
            : Promise.resolve([]),
        recentIds.length > 0
            ? (fetchAll((a, b) => db.from('fixture_player_stats').select('fixture_id,player_id,minutes_played,rating,goals,assists').in('fixture_id', recentIds).order('fixture_id').order('player_id').range(a, b), {max: 20000}) as Promise<Array<{fixture_id: number; player_id: number; minutes_played: number | null; rating: number | string | null; goals: number; assists: number}>>)
            : Promise.resolve([]),
        roundFixtures.length > 0
            ? (fetchAll((a, b) => db.from('lineups').select('fixture_id,team_id,player_id,is_starter').in('fixture_id', roundFixtures.map((f) => f.id)).eq('is_expected', true).order('fixture_id').order('player_id').range(a, b), {max: 2000}) as Promise<Array<{fixture_id: number; team_id: number; player_id: number; is_starter: boolean}>>)
            : Promise.resolve([]),
        loadTeamSidelined(db, teamIds),
    ]);
    const stats = new Map(statRows.map((s) => [`${s.fixture_id}:${s.player_id}`, s]));
    // A player's club this season: the team of his most recent lineup row.
    const inLineup = new Map<string, {team: number; starter: boolean}>();
    const teamOf = new Map<number, {team: number; at: string}>();
    const dateOf = new Map(fixtures.map((f) => [f.id, f.starting_at]));
    for (const l of lineupRows) {
        inLineup.set(`${l.fixture_id}:${l.player_id}`, {team: l.team_id, starter: l.is_starter});
        const at = dateOf.get(l.fixture_id) ?? '';
        const known = teamOf.get(l.player_id);
        if (!known || at > known.at) teamOf.set(l.player_id, {team: l.team_id, at});
    }
    const players: MatchdayContext['players'] = {};
    for (const [playerId, {team}] of teamOf) {
        const recent: RecentMatch[] = (recentOf.get(team) ?? []).map((f) => {
            const row = inLineup.get(`${f.id}:${playerId}`);
            const stat = stats.get(`${f.id}:${playerId}`);
            const minutes = stat?.minutes_played ?? 0;
            const status: RecentMatch['status'] = !row ? 'out' : row.starter ? 'started' : minutes > 0 ? 'sub' : 'bench';
            return {fixtureId: f.id, status, minutes, rating: stat?.rating !== null && stat?.rating !== undefined ? Number(stat.rating) : null, goals: stat?.goals ?? 0, assists: stat?.assists ?? 0};
        });
        players[playerId] = {teamId: team, recent, sidelined: null};
    }
    for (const entries of sidelined.values()) {
        for (const e of entries) {
            const current = players[e.player.id];
            const note = {category: e.category, description: e.description, longTerm: e.longTerm};
            if (current) current.sidelined = note;
            else players[e.player.id] = {teamId: 0, recent: [], sidelined: note};
        }
    }
    const official: MatchdayContext['official'] = {};
    const officialTeams = new Set<number>();
    for (const l of officialRows) {
        official[l.player_id] = l.is_starter ? 'starter' : 'bench';
        officialTeams.add(l.team_id);
    }
    return {league, seasonId: season.id, rounds, round, fixtures: matchday, players, official, officialTeams: [...officialTeams], generatedAt: new Date().toISOString()};
}

const cachedMatchday = unstable_cache(buildMatchday, ['fantasy-matchday', process.env.VERCEL_GIT_COMMIT_SHA ?? 'local'], {revalidate: 600, tags: ['fantasy-matchday']});

export async function getMatchday(league: AuctionLeague): Promise<MatchdayContext | null> {
    try {
        return await cachedMatchday(league);
    } catch (error) {
        logReadError(`getMatchday(${league})`, error);
        return null;
    }
}
