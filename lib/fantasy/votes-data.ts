import 'server-only';
import {unstable_cache} from 'next/cache';
import {fetchAll} from '@/lib/db/paginate';
import {isBuildPhase} from '@/lib/db/phase';
import {footballDb, logReadError} from '@/lib/football/data/shared';
import {AUCTION_LEAGUES, type AuctionLeague} from './config';
import {roundNumber} from './matchday';
import type {FantaRole} from './scores';

/**
 * The vote book: every round of the season already played, with the
 * players who took the pitch and the vote typed in for each, so the
 * real votes of the fantasy app can be copied in round by round, back
 * to the first, whoever has them in his roster. What is typed feeds the
 * vote scale (calibration-data) that every estimate on the site uses.
 */

export interface BookPlayer {
    id: number;
    name: string;
    slug: string;
    role: FantaRole;
    teamId: number;
    minutes: number;
    /** The provider's rating on its own scale, null when he had none. */
    rating: number | null;
    goals: number;
    assists: number;
    yellow: number;
    red: number;
    conceded: number;
    penaltiesSaved: number;
    penaltiesMissed: number;
    ownGoals: number;
    /** The vote typed in (0 = a typed "no vote"); null when none was typed. */
    typed: number | null;
}

export interface BookMatch {
    home: {id: number; name: string};
    away: {id: number; name: string};
    score: [number, number] | null;
}

export interface BookRound {
    round: string;
    number: number | null;
    /** Matches over, in kick-off order; the players come grouped by these clubs. */
    matches: BookMatch[];
    players: BookPlayer[];
}

export interface VotesBook {
    league: AuctionLeague;
    seasonId: number;
    teams: Array<{id: number; name: string; shortCode: string | null; logoUrl: string | null}>;
    /** Oldest first. */
    rounds: BookRound[];
    generatedAt: string;
}

const ROLE_OF_POSITION: Record<string, FantaRole> = {goalkeeper: 'P', defender: 'D', midfielder: 'C', attacker: 'A'};
const num = (v: unknown): number | null => (v === null || v === undefined || v === '' ? null : Number.isFinite(Number(v)) ? Number(v) : null);

interface StatRow {
    fixture_id: number;
    player_id: number;
    team_id: number | null;
    minutes_played: number | null;
    rating: number | string | null;
    goals: number | null;
    assists: number | null;
    yellow_cards: number | null;
    red_cards: number | null;
    penalty_saved?: unknown;
    penalty_missed?: unknown;
    goals_conceded?: unknown;
}

async function buildVotesBook(league: AuctionLeague): Promise<VotesBook | null> {
    if (isBuildPhase()) return null;
    const slugs = AUCTION_LEAGUES.find((l) => l.key === league)?.slugs ?? [];
    if (slugs.length !== 1) return null;
    const db = footballDb();
    const {data: leagueRows, error: leagueError} = await db.from('leagues').select('id,slug,seasons(id,year,is_current)').eq('slug', slugs[0]).limit(1);
    if (leagueError) throw leagueError;
    const leagueRow = (leagueRows ?? [])[0] as unknown as {id: number; seasons: Array<{id: number; year: number; is_current: boolean}>} | undefined;
    const season = leagueRow?.seasons.find((s) => s.is_current) ?? leagueRow?.seasons.sort((a, b) => b.year - a.year)[0];
    if (!season) return null;

    const fixtures = (await fetchAll((a, b) => db.from('fixtures').select('id,round,starting_at,state,home_team_id,away_team_id,home_score,away_score,home:teams!fixtures_home_team_id_fkey(id,name,short_code,logo_url),away:teams!fixtures_away_team_id_fkey(id,name,short_code,logo_url)').eq('season_id', season.id).eq('state', 'finished').order('starting_at').range(a, b), {max: 500})) as unknown as Array<{id: number; round: string | null; starting_at: string; state: string; home_team_id: number; away_team_id: number; home_score: number | null; away_score: number | null; home: {id: number; name: string; short_code: string | null; logo_url: string | null} | null; away: {id: number; name: string; short_code: string | null; logo_url: string | null} | null}>;
    if (fixtures.length === 0) return {league, seasonId: season.id, teams: [], rounds: [], generatedAt: new Date().toISOString()};
    const fixtureIds = fixtures.map((f) => f.id);

    let stats: StatRow[];
    try {
        stats = (await fetchAll((a, b) => db.from('fixture_player_stats').select('fixture_id,player_id,team_id,minutes_played,rating,goals,assists,yellow_cards,red_cards,penalty_saved:stats->>penalty_saved,penalty_missed:stats->>penalty_missed,goals_conceded:stats->>goals_conceded').in('fixture_id', fixtureIds).order('fixture_id').order('player_id').range(a, b), {max: 40000})) as unknown as StatRow[];
    } catch {
        stats = (await fetchAll((a, b) => db.from('fixture_player_stats').select('fixture_id,player_id,team_id,minutes_played,rating,goals,assists,yellow_cards,red_cards').in('fixture_id', fixtureIds).order('fixture_id').order('player_id').range(a, b), {max: 40000})) as unknown as StatRow[];
    }
    stats = stats.filter((s) => (s.minutes_played ?? 0) > 0);

    const ownGoals = new Map<string, number>();
    const events = (await fetchAll((a, b) => db.from('fixture_events').select('fixture_id,player_id,type').in('fixture_id', fixtureIds).eq('type', 'own_goal').order('id').range(a, b), {max: 2000})) as unknown as Array<{fixture_id: number; player_id: number | null}>;
    for (const e of events) if (e.player_id) ownGoals.set(`${e.fixture_id}:${e.player_id}`, (ownGoals.get(`${e.fixture_id}:${e.player_id}`) ?? 0) + 1);

    const typed = new Map<string, number | null>();
    const typedTeam = new Map<string, number>();
    const {data: typedRows} = await db.rpc('fantasy_round_votes', {p_season: season.id});
    for (const r of (typedRows ?? []) as Array<{round: string; player_id: number; team_id: number; voto: number | string | null}>) {
        typed.set(`${r.round}:${r.player_id}`, r.voto === null ? null : Number(r.voto));
        typedTeam.set(`${r.round}:${r.player_id}`, r.team_id);
    }

    const playerIds = [...new Set(stats.map((s) => s.player_id))];
    const players = new Map<number, {name: string; slug: string; role: FantaRole}>();
    for (let i = 0; i < playerIds.length; i += 300) {
        const {data} = await db.from('players').select('id,name,slug,position').in('id', playerIds.slice(i, i + 300));
        for (const p of (data ?? []) as Array<{id: number; name: string; slug: string; position: string | null}>) players.set(p.id, {name: p.name, slug: p.slug, role: ROLE_OF_POSITION[p.position ?? ''] ?? 'C'});
    }

    const teams = new Map<number, VotesBook['teams'][number]>();
    for (const f of fixtures) for (const t of [f.home, f.away]) if (t) teams.set(t.id, {id: t.id, name: t.name, shortCode: t.short_code, logoUrl: t.logo_url});

    const byRound = new Map<string, typeof fixtures>();
    for (const f of fixtures) {
        const key = f.round ?? '';
        byRound.set(key, [...(byRound.get(key) ?? []), f]);
    }
    const rounds: BookRound[] = [...byRound.entries()]
        .map(([round, list]) => {
            const matches: BookMatch[] = list.map((f) => ({home: {id: f.home_team_id, name: f.home?.name ?? ''}, away: {id: f.away_team_id, name: f.away?.name ?? ''}, score: f.home_score !== null && f.away_score !== null ? [f.home_score, f.away_score] : null}));
            const roundPlayers: BookPlayer[] = [];
            for (const f of list) {
                for (const s of stats.filter((x) => x.fixture_id === f.id)) {
                    const p = players.get(s.player_id);
                    if (!p) continue;
                    const teamId = s.team_id ?? typedTeam.get(`${round}:${s.player_id}`) ?? f.home_team_id;
                    const against = teamId === f.home_team_id ? f.away_score : teamId === f.away_team_id ? f.home_score : null;
                    roundPlayers.push({
                        id: s.player_id,
                        name: p.name,
                        slug: p.slug,
                        role: p.role,
                        teamId,
                        minutes: s.minutes_played ?? 0,
                        rating: num(s.rating),
                        goals: s.goals ?? 0,
                        assists: s.assists ?? 0,
                        yellow: s.yellow_cards ?? 0,
                        red: s.red_cards ?? 0,
                        conceded: num(s.goals_conceded) ?? against ?? 0,
                        penaltiesSaved: num(s.penalty_saved) ?? 0,
                        penaltiesMissed: num(s.penalty_missed) ?? 0,
                        ownGoals: ownGoals.get(`${f.id}:${s.player_id}`) ?? 0,
                        typed: typed.has(`${round}:${s.player_id}`) ? typed.get(`${round}:${s.player_id}`)! : null,
                    });
                }
            }
            return {round, number: roundNumber(round), matches, players: roundPlayers};
        })
        .sort((a, b) => (a.number ?? 0) - (b.number ?? 0) || a.round.localeCompare(b.round));
    return {league, seasonId: season.id, teams: [...teams.values()].sort((a, b) => a.name.localeCompare(b.name)), rounds, generatedAt: new Date().toISOString()};
}

const cachedBook = unstable_cache(buildVotesBook, ['fantasy-votes-book', process.env.VERCEL_GIT_COMMIT_SHA ?? 'local'], {revalidate: 300, tags: ['fantasy-votes', 'fantasy-matchday']});

/** The vote book of the league's season; null when the read fails or the league has no calendar of its own. */
export async function getVotesBook(league: AuctionLeague): Promise<VotesBook | null> {
    try {
        return await cachedBook(league);
    } catch (error) {
        logReadError(`votes book ${league}`, error);
        return null;
    }
}
