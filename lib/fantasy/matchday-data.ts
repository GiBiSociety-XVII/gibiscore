import 'server-only';
import {unstable_cache} from 'next/cache';
import {fetchAll} from '@/lib/db/paginate';
import {isBuildPhase} from '@/lib/db/phase';
import {footballDb, logReadError} from '@/lib/football/data/shared';
import {loadTeamSidelined} from '@/lib/football/data/sidelined';
import {getPriorStudy, getSeasonStudy} from '@/lib/football/data/study';
import {attackBaseline, predictMatch} from '@/lib/football/prediction';
import {VOTI as SERIE_A_VOTI} from '@/core/fantasy/voti/serie-a';
import {AUCTION_LEAGUES, type AuctionLeague} from './config';
import {roundNumber, roundStates, type MatchdayFixture, type PlayerContext, type RecentMatch, type RoundState} from './matchday';
import type {FantaRole} from './scores';
import {DEFAULT_CALIBRATION, fitCalibration, type VotoCalibration, type VotoPair} from './voto';
import {matchVoti, parseVoti, type VotoEntry, type VotoRow} from './voti';
import type {RoundResults, RoundStat} from './recap';
import {getTypedPairs} from './calibration-data';

/** The official votes on disk, by league (core/fantasy/voti). */
const OFFICIAL_VOTES: Partial<Record<AuctionLeague, Array<{round: number; rows: VotoRow[]}>>> = {'serie-a': SERIE_A_VOTI};

const ROLE_OF_POSITION: Record<string, FantaRole> = {goalkeeper: 'P', defender: 'D', midfielder: 'C', attacker: 'A'};

/**
 * What a matchday looks like, for the lineup advice: the rounds of the
 * season and the one to play (live or next), its fixtures with the match
 * predictions, and for every player seen this season how his club has
 * used him lately, the official lineup once published, and whether he
 * is out. Cached two minutes; the lineup and absence syncs refresh it
 * when something new arrives.
 */

export interface MatchdayRound {
    round: string;
    from: string;
    to: string;
    state: RoundState;
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
    /** Per team id: its last league matches (fixture ids, most recent first), for the players never seen in a lineup. */
    teamRecent: Record<number, number[]>;
    /** Official lineups of the round, per player id, and the clubs that have published one. */
    official: Record<number, 'starter' | 'bench'>;
    officialTeams: number[];
    /** How the provider's ratings map to fantasy votes: fitted on the official votes when enough are in, else the defaults. */
    calibration: VotoCalibration;
    /** Rounds whose official votes are in, and how many players they matched. */
    votes: Array<{round: number; matched: number; total: number}>;
    /** The round of the recap (the one begun, else the last played): what every player in a squad did. */
    results: RoundResults[];
    /**
     * The rounds played before, oldest first, for the history of the recaps. Heavy: the lineup page
     * strips it before the client.
     */
    history: RoundResults[];
    generatedAt: string;
}

/** How many of the club's last league matches say how a player is used. */
const RECENT_MATCHES = 8;
/** Rounds played kept for the history of the recaps (within the matches loaded). */
const HISTORY_RESULTS = 6;
const FINISHED = new Set(['finished']);

interface StatRow {
    fixture_id: number;
    player_id: number;
    minutes_played: number | null;
    rating: number | string | null;
    goals: number;
    assists: number;
    yellow_cards: number | null;
    red_cards: number | null;
    /** From the provider's json: penalties he saved (keepers) or missed, goals conceded while he was on. */
    penalty_saved: number | null;
    penalty_missed: number | null;
    goals_conceded: number | null;
}

const STAT_SELECT = 'fixture_id,player_id,minutes_played,rating,goals,assists,yellow_cards,red_cards';
const STAT_JSON = 'penalty_saved:stats->>penalty_saved,penalty_missed:stats->>penalty_missed,goals_conceded:stats->>goals_conceded';

/** The players' lines of some fixtures, the penalties and goals conceded read out of the provider's json; without them if that read fails. */
async function loadStats(db: ReturnType<typeof footballDb>, fixtureIds: number[]): Promise<StatRow[]> {
    const num = (v: unknown) => (v === null || v === undefined || v === '' ? null : Number(v));
    try {
        const rows = (await fetchAll((a, b) => db.from('fixture_player_stats').select(`${STAT_SELECT},${STAT_JSON}`).in('fixture_id', fixtureIds).order('fixture_id').order('player_id').range(a, b), {max: 20000})) as unknown as Array<Record<string, unknown>>;
        return rows.map((r) => ({...(r as unknown as StatRow), penalty_saved: num(r.penalty_saved), penalty_missed: num(r.penalty_missed), goals_conceded: num(r.goals_conceded)}));
    } catch (error) {
        logReadError('fixture stats with penalties', error);
        const rows = (await fetchAll((a, b) => db.from('fixture_player_stats').select(STAT_SELECT).in('fixture_id', fixtureIds).order('fixture_id').order('player_id').range(a, b), {max: 20000})) as unknown as Array<Omit<StatRow, 'penalty_saved' | 'penalty_missed' | 'goals_conceded'>>;
        return rows.map((r) => ({...r, penalty_saved: null, penalty_missed: null, goals_conceded: null}));
    }
}

interface TypedVoteRow {
    round: string;
    player_id: number;
    team_id: number;
    voto: number | string | null;
    goals: number;
    assists: number;
    yellow: number;
    red: number;
    conceded: number;
    penalties_saved: number;
    penalties_missed: number;
    own_goals: number;
}

interface FixtureRow {
    id: number;
    round: string | null;
    starting_at: string;
    state: string;
    home_team_id: number;
    away_team_id: number;
    home_score: number | null;
    away_score: number | null;
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
        (a, b) => db.from('fixtures').select('id,round,starting_at,state,home_team_id,away_team_id,home_score,away_score,home:teams!fixtures_home_team_id_fkey(id,name),away:teams!fixtures_away_team_id_fkey(id,name)').eq('season_id', season.id).order('starting_at').order('id').range(a, b),
        {max: 1000},
    )) as unknown as FixtureRow[];
    const fixtures = rows.filter((r) => r.round && r.home && r.away);
    if (fixtures.length === 0) return null;

    // Rounds in order; the next one is the first with most of its matches still to play.
    const byRound = new Map<string, FixtureRow[]>();
    for (const f of fixtures) byRound.set(f.round!, [...(byRound.get(f.round!) ?? []), f]);
    const rounds: MatchdayRound[] = roundStates(fixtures.map((f) => ({round: f.round!, startingAt: f.starting_at, state: f.state})));
    // Only the round to play: a lineup for a later one would pretend to know how clubs and players will be by then.
    const round = rounds.find((r) => r.state === 'live' || r.state === 'next')?.round ?? rounds[rounds.length - 1].round;
    const roundFixtures = byRound.get(round) ?? [];

    // Predictions from the season's numbers.
    const [study, prior] = await Promise.all([getSeasonStudy(season.id), getPriorStudy(season.id)]);
    // What each club scores in an ordinary match (shrunk on a small sample): the yardstick for the fixture's expected goals.
    const avgFor = new Map<number, number>();
    const formOf = new Map<number, string>();
    for (const t of study?.teams ?? []) {
        const baseline = attackBaseline(study, t.team.id, prior);
        if (baseline !== null) avgFor.set(t.team.id, baseline);
        if (t.form.length > 0) formOf.set(t.team.id, t.form.join(''));
    }
    const matchday: MatchdayFixture[] = roundFixtures.map((f) => {
        const p = predictMatch(study, f.home_team_id, f.away_team_id, prior);
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
    // The votes users typed in, the latest per player and round: each on its club's match of that round.
    const {data: typedRows} = await db.rpc('fantasy_round_votes', {p_season: season.id});
    // A typed vote (0 = "no vote") counts like an official one; a row with no vote typed corrects the events only.
    const typed = new Map<string, VotoEntry>();
    const typedEvents = new Map<string, VotoEntry>();
    for (const r of (typedRows ?? []) as TypedVoteRow[]) {
        const f = (byRound.get(r.round) ?? []).find((x) => x.home_team_id === r.team_id || x.away_team_id === r.team_id);
        if (!f) continue;
        const voto = r.voto === null ? null : Number(r.voto);
        const entry: VotoEntry = {team: '', role: 'C', name: '', voto: voto === 0 ? null : voto, goals: r.goals, conceded: r.conceded, penaltiesScored: 0, penaltiesSaved: r.penalties_saved, penaltiesMissed: r.penalties_missed, ownGoals: r.own_goals, yellow: r.yellow, red: r.red, assists: r.assists};
        (voto === null ? typedEvents : typed).set(`${f.id}:${r.player_id}`, entry);
    }
    const typedFixtureIds = [...new Set([...typed.keys(), ...typedEvents.keys()].map((k) => Number(k.split(':')[0])))];
    const statIds = [...new Set([...recentIds, ...typedFixtureIds])];
    const [lineupRows, statRows, officialRows, sidelined] = await Promise.all([
        recentIds.length > 0
            ? (fetchAll((a, b) => db.from('lineups').select('fixture_id,team_id,player_id,is_starter').in('fixture_id', recentIds).eq('is_expected', false).order('fixture_id').order('player_id').range(a, b), {max: 20000}) as Promise<Array<{fixture_id: number; team_id: number; player_id: number; is_starter: boolean}>>)
            : Promise.resolve([]),
        statIds.length > 0 ? loadStats(db, statIds) : Promise.resolve([]),
        roundFixtures.length > 0
            ? (fetchAll((a, b) => db.from('lineups').select('fixture_id,team_id,player_id,is_starter').in('fixture_id', roundFixtures.map((f) => f.id)).eq('is_expected', true).order('fixture_id').order('player_id').range(a, b), {max: 2000}) as Promise<Array<{fixture_id: number; team_id: number; player_id: number; is_starter: boolean}>>)
            : Promise.resolve([]),
        loadTeamSidelined(db, teamIds),
    ]);
    const stats = new Map(statRows.map((s) => [`${s.fixture_id}:${s.player_id}`, s]));
    // Own goals are events, not statistics.
    const ownGoals = new Map<string, number>();
    if (statIds.length > 0) {
        const {data: ownRows} = await db.from('fixture_events').select('fixture_id,player_id').eq('type', 'own_goal').in('fixture_id', statIds).limit(2000);
        for (const e of (ownRows ?? []) as Array<{fixture_id: number; player_id: number | null}>) if (e.player_id !== null) ownGoals.set(`${e.fixture_id}:${e.player_id}`, (ownGoals.get(`${e.fixture_id}:${e.player_id}`) ?? 0) + 1);
    }
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
    // The official votes of the recent rounds, matched to the players by club and surname; with enough
    // of them, the provider's ratings are put on the vote scale by the line through the pairs.
    const votesByRound = new Map<number, VotoEntry[]>();
    for (const {round: n, rows: votesRows} of OFFICIAL_VOTES[league] ?? []) votesByRound.set(n, parseVoti(votesRows));
    const teamName = new Map<number, string>();
    for (const f of fixtures) {
        teamName.set(f.home_team_id, f.home!.name);
        teamName.set(f.away_team_id, f.away!.name);
    }
    const roundOfFixture = new Map(fixtures.map((f) => [f.id, roundNumber(f.round ?? '')]));
    const votedRounds = [...new Set(recentIds.map((id) => roundOfFixture.get(id)).filter((n): n is number => typeof n === 'number' && votesByRound.has(n)))];
    const votoOf = new Map<string, VotoEntry>();
    const votes: MatchdayContext['votes'] = [];
    const pairs: VotoPair[] = [];
    const typedPlayerIds = [...new Set([...typed.keys()].map((k) => Number(k.split(':')[1])))];
    const roleOf = new Map<number, FantaRole | null>();
    if ((votedRounds.length > 0 && teamOf.size > 0) || typedPlayerIds.length > 0) {
        const ids = [...new Set([...(votedRounds.length > 0 ? teamOf.keys() : []), ...typedPlayerIds])];
        const named: Array<{id: number; name: string; position: string | null}> = [];
        for (let i = 0; i < ids.length; i += 300) {
            const {data} = await db.from('players').select('id,name,position').in('id', ids.slice(i, i + 300));
            named.push(...((data ?? []) as Array<{id: number; name: string; position: string | null}>));
        }
        for (const p of named) roleOf.set(p.id, ROLE_OF_POSITION[p.position ?? ''] ?? null);
        const matchable = named.map((p) => ({id: p.id, name: p.name, team: teamName.get(teamOf.get(p.id)?.team ?? -1) ?? ''}));
        for (const n of votedRounds) {
            const entries = votesByRound.get(n)!;
            const {byPlayer} = matchVoti(entries, matchable);
            votes.push({round: n, matched: byPlayer.size, total: entries.length});
            for (const f of fixtures.filter((x) => roundOfFixture.get(x.id) === n)) {
                for (const [playerId, entry] of byPlayer) {
                    const team = teamOf.get(playerId)?.team;
                    if (team !== f.home_team_id && team !== f.away_team_id) continue;
                    votoOf.set(`${f.id}:${playerId}`, entry);
                    const stat = stats.get(`${f.id}:${playerId}`);
                    const role = roleOf.get(playerId);
                    if (entry.voto !== null && stat?.rating !== null && stat?.rating !== undefined && role) pairs.push({rating: Number(stat.rating), voto: entry.voto, role});
                }
            }
        }
    }
    // Typed votes fill in where no official workbook covers the match; their pairs (this season and
    // the last) come from the shared loader, the same the auction pool tunes its scale with.
    for (const [key, entry] of typed) if (!votoOf.has(key)) votoOf.set(key, entry);
    pairs.push(...(await getTypedPairs(league)));
    const calibration = pairs.length > 0 ? fitCalibration(pairs) : DEFAULT_CALIBRATION;
    const players: MatchdayContext['players'] = {};
    for (const [playerId, {team}] of teamOf) {
        const recent: RecentMatch[] = (recentOf.get(team) ?? []).map((f) => {
            const row = inLineup.get(`${f.id}:${playerId}`);
            const stat = stats.get(`${f.id}:${playerId}`);
            const minutes = stat?.minutes_played ?? 0;
            const status: RecentMatch['status'] = !row ? 'out' : row.starter ? 'started' : minutes > 0 ? 'sub' : 'bench';
            const official = votoOf.get(`${f.id}:${playerId}`);
            return {fixtureId: f.id, status, minutes, rating: stat?.rating !== null && stat?.rating !== undefined ? Number(stat.rating) : null, ...(official ? {voto: official.voto} : {}), goals: stat?.goals ?? 0, assists: stat?.assists ?? 0};
        });
        players[playerId] = {teamId: team, recent, sidelined: null};
    }
    for (const entries of sidelined.values()) {
        for (const e of entries) {
            // Suspended in another competition (a red card in Europe): free to play here.
            if (e.category === 'suspension' && e.competition && e.competition.id !== leagueRow.id) continue;
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
    const teamRecent: MatchdayContext['teamRecent'] = {};
    for (const [teamId, list] of recentOf) teamRecent[teamId] = list.map((f) => f.id);
    // The recap: the round begun (its matches already over) or, before the next one starts, the last one
    // played. Everyone in a squad, with the official vote when the workbook is in, else the vote typed in,
    // else the provider's numbers (a player typed in without a squad row counts too).
    const results: RoundResults[] = [];
    const lastPlayed = [...rounds].reverse().find((r) => r.state === 'played') ?? null;
    // The current round counts as begun from its first match over, whether or not one is on the pitch right now.
    const current = rounds.find((r) => r.state === 'live' || r.state === 'next') ?? null;
    const begun = current !== null && (byRound.get(current.round) ?? []).some((f) => FINISHED.has(f.state));
    const recap: Array<[MatchdayRound | null, RoundResults['state']]> = begun ? [[current, 'live']] : [[lastPlayed, 'played']];
    const resultsFor = (info: MatchdayRound, state: RoundResults['state']): RoundResults => {
        const officialRound = votesByRound.has(roundNumber(info.round) ?? -1);
        const statsOf: Record<number, RoundStat> = {};
        const finishedTeams: number[] = [];
        const matches: RoundResults['matches'] = [];
        for (const f of byRound.get(info.round) ?? []) {
            const finished = FINISHED.has(f.state);
            matches.push({home: {id: f.home!.id, name: f.home!.name}, away: {id: f.away!.id, name: f.away!.name}, finished, score: f.home_score !== null && f.away_score !== null ? [f.home_score, f.away_score] : null});
            if (!finished) continue;
            finishedTeams.push(f.home_team_id, f.away_team_id);
            const inSquad = lineupRows.filter((l) => l.fixture_id === f.id);
            const typedHere = [...typed.keys(), ...typedEvents.keys()].filter((k) => k.startsWith(`${f.id}:`)).map((k) => Number(k.split(':')[1]));
            const ids = [...new Set([...inSquad.map((l) => l.player_id), ...typedHere])];
            for (const playerId of ids) {
                const key = `${f.id}:${playerId}`;
                const l = inSquad.find((x) => x.player_id === playerId);
                const stat = stats.get(key);
                const voted = votoOf.get(key);
                const entry = voted ?? typedEvents.get(key);
                const source: RoundStat['source'] | undefined = voted ? (officialRound && !typed.has(key) ? 'official' : 'manual') : undefined;
                const teamId = l?.team_id ?? teamOf.get(playerId)?.team ?? null;
                const against = teamId === f.home_team_id ? f.away_score : teamId === f.away_team_id ? f.home_score : null;
                const minutes = stat?.minutes_played ?? (voted && voted.voto !== null ? 90 : 0);
                statsOf[playerId] = {
                    minutes,
                    rating: stat?.rating !== null && stat?.rating !== undefined ? Number(stat.rating) : null,
                    ...(voted ? {voto: voted.voto, source} : {}),
                    goals: entry?.goals ?? stat?.goals ?? 0,
                    assists: entry?.assists ?? stat?.assists ?? 0,
                    yellow: entry?.yellow ?? stat?.yellow_cards ?? 0,
                    red: entry?.red ?? stat?.red_cards ?? 0,
                    conceded: entry?.conceded ?? stat?.goals_conceded ?? against ?? 0,
                    penaltiesSaved: entry?.penaltiesSaved ?? stat?.penalty_saved ?? 0,
                    penaltiesMissed: entry?.penaltiesMissed ?? stat?.penalty_missed ?? 0,
                    ownGoals: entry?.ownGoals ?? ownGoals.get(key) ?? 0,
                };
            }
        }
        return {round: info.round, state, official: officialRound, finishedTeams, matches, stats: statsOf};
    };
    for (const [info, state] of recap) if (info) results.push(resultsFor(info, state));
    // The rounds played before, for the history: the last few, oldest first (their lines are loaded: eight matches per club).
    const history = rounds.filter((r) => r.state === 'played').slice(-HISTORY_RESULTS).map((r) => resultsFor(r, 'played'));
    return {league, seasonId: season.id, rounds, round, fixtures: matchday, players, teamRecent, official, officialTeams: [...officialTeams], calibration, votes, results, history, generatedAt: new Date().toISOString()};
}

const cachedMatchday = unstable_cache(buildMatchday, ['fantasy-matchday', process.env.VERCEL_GIT_COMMIT_SHA ?? 'local'], {revalidate: 120, tags: ['fantasy-matchday']});

/** The last matchday each league produced in this process: what a failed rebuild falls back to. */
const lastGoodMatchday = new Map<AuctionLeague, MatchdayContext>();

export async function getMatchday(league: AuctionLeague): Promise<MatchdayContext | null> {
    const attempts = isBuildPhase() ? 1 : 3;
    for (let attempt = 0; attempt < attempts; attempt += 1) {
        try {
            const context = await cachedMatchday(league);
            if (context) lastGoodMatchday.set(league, context);
            return context;
        } catch (error) {
            logReadError(`getMatchday(${league}) attempt ${attempt + 1}`, error);
        }
    }
    return lastGoodMatchday.get(league) ?? null;
}
