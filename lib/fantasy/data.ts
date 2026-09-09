import 'server-only';
import {unstable_cache} from 'next/cache';
import {fetchAll} from '@/lib/db/paginate';
import {normalizePosition} from '@/lib/football/data/matches';
import {romeDate} from '@/lib/football/data/scores';
import {TEAM_SELECT, footballDb, logReadError, toTeam, type TeamRow} from '@/lib/football/data/shared';
import {loadTeamSidelined} from '@/lib/football/data/sidelined';
import {getSeasonStudy} from '@/lib/football/data/study';
import type {ReturnEstimate} from '@/lib/football/spells';
import type {SidelinedEntry, TeamSummary} from '@/lib/football/types';
import serieAListone from '@/core/fantasy/listone/serie-a.json';
import {AUCTION_LEAGUES, type AuctionLeague} from './config';
import {matchListone, parseListone, type ListoneMatch, type ListoneRow} from './listone';
import {lastWindowClose, resolveClub, type ClubEvidence} from './membership';
import {deriveRole, findRivals, isContested, type Availability, type SlotStart, type SlotUse} from './roles';
import {scorePlayer, type FantaRole, type FantaScores, type SeasonLine} from './scores';

/**
 * Player pool of a fantasy auction: every player in the current squads
 * of the chosen league(s), with three seasons of statistics turned into
 * the auction marks. Cached one hour per league.
 */

export interface AuctionPlayer {
    id: number;
    name: string;
    /** First and last name, when the provider gives them: "Pote" is Pedro Gonçalves. */
    fullName: string | null;
    slug: string;
    role: FantaRole;
    age: number | null;
    imageUrl: string | null;
    team: TeamSummary;
    league: string;
    injury: {category: string; description: string | null; since: string; daysOut: number; longTerm: boolean; estimate: ReturnEstimate} | null;
    /** Club he played for last season, when it is not the current one. */
    newSigning: string | null;
    /** European cup the club plays this season, when someone in the squad already has a line in it. */
    europe: string | null;
    /** Where the fantasy role comes from: the official list, the formations fielded, or the provider's profile. */
    roleSource: 'listone' | 'lineups' | 'profile' | 'manual';
    /** Weighted starts per role from the formations fielded (current season counts three times). */
    roleBreakdown: Partial<Record<FantaRole, number>>;
    /** The official list's own quotation, when he is on it. */
    listQuote: number | null;
    /** The official list's market value (FVM), when it gives one. */
    listFvm: number | null;
    /** Mantra roles from the official list ("E;W"), when it gives them. */
    mantraRoles: string | null;
    /** Starts and benches at the current club, this season counting three times. */
    availability: Availability;
    /** His place is contested: on the bench in at least a fifth of the matches he was available for. */
    contested: boolean;
    /** Who took his place: teammates who started in his usual slots while he sat on the bench (matches, weighted). */
    rivals: Array<{id: number; name: string; shared: number}>;
    /** Took penalties recently: two or more scored in a season of the last two. */
    penaltyTaker: boolean;
    scores: FantaScores;
    /** The same marks with only the main leagues, for leagues that ignore the cups. */
    scoresLeagueOnly: FantaScores;
    /** Last seasons, newest first, for the detail row. */
    seasons: Array<{year: number; league: string; cup: boolean; team: string; apps: number; lineups: number; minutes: number; goals: number; assists: number; rating: number | null}>;
}

export interface AuctionPool {
    league: AuctionLeague;
    year: number;
    leagues: Array<{slug: string; name: string}>;
    teams: TeamSummary[];
    players: AuctionPlayer[];
    generatedAt: string;
}

interface StatRow {
    player_id: number;
    team_id: number;
    league_id: number;
    season_year: number;
    position: string | null;
    appearances: number | null;
    lineups: number | null;
    bench: number | null;
    minutes: number | null;
    rating: number | string | null;
    goals: number | null;
    assists: number | null;
    penalties_scored: number | null;
    penalties_missed: number | null;
    penalties_saved: number | null;
    yellow_cards: number | null;
    yellow_red_cards: number | null;
    red_cards: number | null;
    goals_conceded: number | null;
    saves: number | null;
    team: {name: string} | null;
    league: {id: number; name: string; slug: string; tier: string | null; type: string | null} | null;
}

const ROLE_OF: Record<string, FantaRole> = {goalkeeper: 'P', defender: 'D', midfielder: 'C', attacker: 'A'};

/** Official fantasy lists by league slug (core/fantasy/listone). */
const LISTONE: Partial<Record<string, ListoneRow[]>> = {'serie-a': serieAListone as ListoneRow[]};

interface SlotRow {
    player_id: number;
    team_id: number;
    season_id: number;
    formation: string | null;
    formation_position: number;
    starts: number;
}

interface BenchRow {
    player_id: number;
    team_id: number;
    season_id: number;
    starts: number;
    benches: number;
}

interface ReplacementRow {
    player_id: number;
    team_id: number;
    season_id: number;
    starter_id: number;
    matches: number;
}

type Rpc = {rpc: <T>(fn: string, args: Record<string, unknown>) => PromiseLike<{data: T[] | null; error: {message: string} | null}>};

/** How much a season in this competition says about the next one in a top league. */
/** The second tier under each auction league: last season's table there is the prior for the promoted clubs. */
const SECOND_TIER: Record<string, string> = {'serie-a': 'serie-b'};
/** The top of a second tier is worth about this much of the top league's scale. */
const SECOND_TIER_SCALE = 0.4;
/** A promoted club nobody has a table for. */
const PROMOTED_STRENGTH = 0.2;

/**
 * Strength of each club of a table, by points per match: 0.9 for the top,
 * 0.1 for the bottom, times the scale of the league. Empty when the study
 * is missing or the season has not started.
 */
function rankStrength(study: {teams: Array<{team: {id: number}; played: number; points: number}>} | null, scale: number): Map<number, number> {
    const rows = (study?.teams ?? []).filter((t) => t.played > 0);
    const sorted = [...rows].sort((a, b) => b.points / b.played - a.points / a.played);
    return new Map(sorted.map((t, i) => [t.team.id, scale * (0.1 + 0.8 * (1 - i / Math.max(1, sorted.length - 1)))]));
}

function leagueLevel(slug: string, tier: string | null, type: string | null): number {
    if (['serie-a', 'premier-league', 'la-liga', 'bundesliga', 'ligue-1', 'champions-league', 'europa-league'].includes(slug)) return 1;
    if (['eredivisie', 'primeira-liga', 'conference-league'].includes(slug)) return 0.85;
    if (slug === 'serie-b') return 0.7;
    if (tier === 'featured') return 0.8;
    return type === 'cup' ? 0.7 : 0.6;
}

function chunk<T>(items: T[], size: number): T[][] {
    const out: T[][] = [];
    for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
    return out;
}

/** Builds the pool, or throws: a failure must never be cached as an empty list. */
async function buildPool(league: AuctionLeague): Promise<AuctionPool> {
    {
        const db = footballDb();
        const slugs = AUCTION_LEAGUES.find((l) => l.key === league)?.slugs ?? [];
        const {data: leagueRows, error: leagueError} = await db.from('leagues').select('id,name,slug,seasons(id,year,is_current)').in('slug', slugs);
        if (leagueError) throw leagueError;
        const leagues = (leagueRows ?? []) as unknown as Array<{id: number; name: string; slug: string; seasons: Array<{id: number; year: number; is_current: boolean}>}>;
        const seasons = leagues
            .map((l) => ({league: l, season: l.seasons.filter((s) => s.is_current).sort((a, b) => b.year - a.year)[0] ?? null}))
            .filter((x): x is {league: (typeof leagues)[number]; season: {id: number; year: number; is_current: boolean}} => x.season !== null);
        if (seasons.length === 0) throw new Error(`no current season for ${league}`);
        const year = Math.max(...seasons.map((s) => s.season.year));
        const currentIds = seasons.map((s) => s.season.id);
        const previousIds = leagues.flatMap((l) => l.seasons.filter((s) => s.year === year - 1).map((s) => s.id));
        // Last season of the leagues' second tiers: where the promoted clubs come from, for their strength prior.
        const feederSlugs = slugs.map((slug) => SECOND_TIER[slug]).filter((slug): slug is string => !!slug);
        const {data: feederRows} = feederSlugs.length > 0 ? await db.from('leagues').select('id,slug,seasons(id,year)').in('slug', feederSlugs) : {data: []};
        const feederIds = ((feederRows ?? []) as unknown as Array<{id: number; slug: string; seasons: Array<{id: number; year: number}>}>).flatMap((l) => l.seasons.filter((s) => s.year === year - 1).map((s) => ({id: s.id, slug: l.slug})));

        // Who plays for these clubs now: the provider's squad lists, the season statistics
        // (a line under a club as soon as he plays there), the injury lists. None is enough
        // alone (see membership.ts): every player's evidence is weighed, dated matches and
        // injury reports first.
        type PoolPlayer = {id: number; name: string; slug: string; position: string | null; age: number | null; image_url: string | null; first_name: string | null; last_name: string | null};
        type Member = {player: PoolPlayer; team: TeamRow; league: string; leagueSlug: string};
        const PLAYER_SELECT = 'id,name,slug,position,age,image_url,first_name,last_name';
        const seasonStart = `${year}-07-01`;
        const [squad, played, listedOut] = await Promise.all([
            fetchAll(
                (a, b) => db.from('squad_members').select(`season_id,player:players(${PLAYER_SELECT}),team:teams(${TEAM_SELECT})`).in('season_id', currentIds).order('player_id').range(a, b),
                {max: 6000},
            ) as unknown as Promise<Array<{season_id: number; player: PoolPlayer | null; team: TeamRow | null}>>,
            fetchAll(
                (a, b) => db.from('player_season_stats').select(`league_id,appearances,player:players(${PLAYER_SELECT}),team:teams(${TEAM_SELECT})`).in('league_id', seasons.map((s) => s.league.id)).eq('season_year', year).order('id').range(a, b),
                {max: 6000},
            ) as unknown as Promise<Array<{league_id: number; appearances: number | null; player: PoolPlayer | null; team: TeamRow | null}>>,
            fetchAll(
                (a, b) => db.from('sidelined').select(`season_id,start_date,player:players(${PLAYER_SELECT}),team:teams(${TEAM_SELECT})`).in('season_id', currentIds).order('player_id').range(a, b),
                {max: 4000},
            ) as unknown as Promise<Array<{season_id: number; start_date: string | null; player: PoolPlayer | null; team: TeamRow | null}>>,
        ]);
        const leagueOfSeason = new Map(seasons.map((s) => [s.season.id, s.league]));
        const leagueById = new Map(seasons.map((s) => [s.league.id, s.league]));
        const teams = new Map<number, TeamRow>();
        const leagueOfTeam = new Map<number, {name: string; slug: string}>();
        const playersById = new Map<number, PoolPlayer>();
        const evidenceOf = new Map<number, ClubEvidence[]>();
        const note = (player: PoolPlayer | null, team: TeamRow | null, league: {name: string; slug: string} | undefined, evidence: (teamId: number) => ClubEvidence) => {
            if (!player || !team) return;
            teams.set(team.id, team);
            if (league) leagueOfTeam.set(team.id, league);
            playersById.set(player.id, player);
            evidenceOf.set(player.id, [...(evidenceOf.get(player.id) ?? []), evidence(team.id)]);
        };
        for (const m of squad) note(m.player, m.team, leagueOfSeason.get(m.season_id), (teamId) => ({kind: 'squad', teamId}));
        for (const m of played) note(m.player, m.team, leagueById.get(m.league_id), (teamId) => ({kind: 'line', teamId, appearances: m.appearances ?? 0}));
        for (const m of listedOut) if (m.start_date) note(m.player, m.team, leagueOfSeason.get(m.season_id), (teamId) => ({kind: 'sidelined', teamId, date: m.start_date!}));
        // The squad lists of every other club we follow: whoever sits in one may have left.
        const candidateIds = [...evidenceOf.keys()];
        for (const ids of chunk(candidateIds, 300)) {
            const rows = (await fetchAll(
                (a, b) => db.from('squad_members').select('player_id,team_id,season:seasons!inner(is_current)').in('player_id', ids).eq('seasons.is_current', true).order('player_id').range(a, b),
                {max: 4000},
            )) as unknown as Array<{player_id: number; team_id: number}>;
            for (const r of rows) if (!teams.has(r.team_id)) evidenceOf.get(r.player_id)?.push({kind: 'squad', teamId: r.team_id});
        }
        // Whoever the sources disagree about, or nobody lists: his matchday squads this season, dated.
        const uncertain = candidateIds.filter((id) => {
            const evidence = evidenceOf.get(id)!;
            return new Set(evidence.map((e) => e.teamId)).size > 1 || !evidence.some((e) => e.kind === 'squad');
        });
        for (const ids of chunk(uncertain, 150)) {
            const rows = (await fetchAll(
                (a, b) => db.from('lineups').select('player_id,team_id,fixture:fixtures!inner(starting_at)').in('player_id', ids).eq('is_expected', false).gte('fixtures.starting_at', seasonStart).order('player_id').range(a, b),
                {max: 6000},
            )) as unknown as Array<{player_id: number; team_id: number; fixture: {starting_at: string} | null}>;
            for (const r of rows) if (r.fixture) evidenceOf.get(r.player_id)?.push({kind: 'played', teamId: r.team_id, date: r.fixture.starting_at.slice(0, 10)});
        }
        const windowClosedAt = lastWindowClose(romeDate(new Date()));
        const members = new Map<number, Member>();
        for (const [id, evidence] of evidenceOf) {
            const teamId = resolveClub(evidence, windowClosedAt);
            const team = teamId === null ? undefined : teams.get(teamId);
            if (!team) continue;
            const league = leagueOfTeam.get(team.id);
            members.set(id, {player: playersById.get(id)!, team, league: league?.name ?? '', leagueSlug: league?.slug ?? ''});
        }
        const playerIds = [...members.keys()];
        if (playerIds.length === 0) throw new Error(`no squad members for ${league}`);

        // Three seasons of statistics, every competition.
        const stats: StatRow[] = [];
        for (const ids of chunk(playerIds, 150)) {
            const rows = (await fetchAll(
                (a, b) =>
                    db
                        .from('player_season_stats')
                        .select('player_id,team_id,league_id,season_year,position,appearances,lineups,bench,minutes,rating,goals,assists,penalties_scored,penalties_missed,penalties_saved,yellow_cards,yellow_red_cards,red_cards,goals_conceded,saves,team:teams(name),league:leagues(id,name,slug,tier,type)')
                        .in('player_id', ids)
                        .gte('season_year', year - 2)
                        .lte('season_year', year)
                        .order('id')
                        .range(a, b),
                {max: 4000},
            )) as unknown as StatRow[];
            stats.push(...rows);
        }

        // Matches a competition had in a season: the most appearances anyone made in it.
        const games = new Map<string, number>();
        for (const r of stats) {
            const key = `${r.league_id}:${r.season_year}`;
            games.set(key, Math.max(games.get(key) ?? 0, r.appearances ?? 0));
        }

        // Team shape this season and current absences.
        const [studies, previousStudies, feederStudies, sidelined] = await Promise.all([
            Promise.all(seasons.map(async (s) => [s.season.id, await getSeasonStudy(s.season.id)] as const)),
            Promise.all(previousIds.map(async (id) => [id, await getSeasonStudy(id)] as const)),
            Promise.all(feederIds.map(async (f) => [f.slug, await getSeasonStudy(f.id)] as const)),
            loadTeamSidelined(db, [...teams.keys()]),
        ]);
        // Club strength, 0..1 on the top league's scale: last season's table (a promoted club on the
        // second tier's scale), moved towards this season's table as the rounds come in.
        const mainSlug = slugs[0];
        const mainLeagueId = leagues.find((l) => l.slug === mainSlug)?.id ?? null;
        const mainPreviousId = leagues.find((l) => l.slug === mainSlug)?.seasons.find((s) => s.year === year - 1)?.id ?? null;
        const mainCurrentId = seasons.find((s) => s.league.slug === mainSlug)?.season.id ?? null;
        const prevStrength = rankStrength(previousStudies.find(([id]) => id === mainPreviousId)?.[1] ?? null, 1);
        const feederStrength = rankStrength(feederStudies.find(([slug]) => slug === SECOND_TIER[mainSlug])?.[1] ?? null, SECOND_TIER_SCALE);
        const mainCurrent = studies.find(([id]) => id === mainCurrentId)?.[1] ?? null;
        const curStrength = rankStrength(mainCurrent, 1);
        const clubStrengthOf = (teamId: number): number => {
            const prev = prevStrength.get(teamId) ?? feederStrength.get(teamId) ?? PROMOTED_STRENGTH;
            const rounds = mainCurrent?.teams.find((t) => t.team.id === teamId)?.played ?? 0;
            const w = Math.min(1, rounds / 8);
            return prev * (1 - w) + (curStrength.get(teamId) ?? prev) * w;
        };
        const feederLeagueSlug = SECOND_TIER[mainSlug];
        const lineStrengthOf = (teamId: number, leagueId: number, leagueSlug: string, seasonYear: number): number | null => {
            if (leagueId === mainLeagueId && seasonYear === year - 1) return prevStrength.get(teamId) ?? null;
            if (leagueId === mainLeagueId && seasonYear === year) return clubStrengthOf(teamId);
            if (feederLeagueSlug && leagueSlug === feederLeagueSlug && seasonYear === year - 1) return feederStrength.get(teamId) ?? null;
            return null;
        };
        // What each club concedes per match: last season and this one (counting double).
        const conceded = new Map<number, {goals: number; played: number}>();
        for (const [list, weight] of [[previousStudies, 1], [studies, 2]] as const) {
            for (const [, study] of list) {
                if (!study) continue;
                for (const t of study.teams) {
                    if (t.played === 0) continue;
                    const c = conceded.get(t.team.id) ?? {goals: 0, played: 0};
                    c.goals += t.goalsAgainst * weight;
                    c.played += t.played * weight;
                    conceded.set(t.team.id, c);
                }
            }
        }
        const clubConcededOf = (teamId: number): number | null => {
            const c = conceded.get(teamId);
            return c && c.played >= 5 ? c.goals / c.played : null;
        };
        // Club shape from the first round: the scoring uses it softly as
        // "form" at once and as "team" strength only from the fifth round.
        const teamShape = new Map<number, {attack: number; defence: number; rounds: number}>();
        for (const [, study] of studies) {
            if (!study || study.played === 0) continue;
            const perTeam = study.goalsPerMatch / 2;
            const logistic = (ratio: number) => 1 / (1 + Math.exp(-(ratio - 1) * 3));
            for (const t of study.teams) {
                if (t.played === 0) continue;
                teamShape.set(t.team.id, {attack: logistic(t.goalsFor / t.played / perTeam), defence: logistic(perTeam / Math.max(0.2, t.goalsAgainst / t.played)), rounds: t.played});
            }
        }
        // Clubs in Europe this season: any squad member with a line in a European cup this year.
        const europeByTeam = new Map<number, string>();
        for (const r of stats) if (r.season_year === year && /champions|europa|conference/i.test(r.league?.slug ?? '')) europeByTeam.set(r.team_id, r.league?.name ?? '');
        const injuryOf = new Map<number, SidelinedEntry>();
        for (const entries of sidelined.values()) for (const e of entries) injuryOf.set(e.player.id, e);

        const byPlayer = new Map<number, StatRow[]>();
        for (const r of stats) {
            if (!byPlayer.has(r.player_id)) byPlayer.set(r.player_id, []);
            byPlayer.get(r.player_id)!.push(r);
        }

        // Formations fielded this season and last: the slots every player started in, for the
        // role he really plays and for who competes with him for a spot at his current club.
        const rpc = db as unknown as Rpc;
        const seasonIds = [...currentIds, ...previousIds];
        const [slotRes, benchRes, replacementRes] = await Promise.all([
            rpc.rpc<SlotRow>('lineup_slots', {p_season_ids: seasonIds}),
            rpc.rpc<BenchRow>('lineup_bench', {p_season_ids: seasonIds}),
            rpc.rpc<ReplacementRow>('lineup_replacements', {p_season_ids: seasonIds}),
        ]);
        for (const res of [slotRes, benchRes, replacementRes]) if (res.error) throw res.error;
        const slotRows = slotRes.data ?? [];
        const currentSet = new Set(currentIds);
        // Availability at the current club: matches started and matches on the bench.
        const availabilityOf = new Map<number, Availability>();
        // This season only, unweighted: what the coach has done so far, for the starter mark.
        const thisSeasonOf = new Map<number, Availability>();
        for (const r of benchRes.data ?? []) {
            if (members.get(r.player_id)?.team.id !== r.team_id) continue;
            const weight = currentSet.has(r.season_id) ? 3 : 1;
            const a = availabilityOf.get(r.player_id) ?? {starts: 0, benches: 0};
            a.starts += r.starts * weight;
            a.benches += r.benches * weight;
            availabilityOf.set(r.player_id, a);
            if (currentSet.has(r.season_id)) {
                const c = thisSeasonOf.get(r.player_id) ?? {starts: 0, benches: 0};
                c.starts += r.starts;
                c.benches += r.benches;
                thisSeasonOf.set(r.player_id, c);
            }
        }
        // Who started in his slots while he sat: the concrete rivals.
        const replacedBy = new Map<number, Map<number, number>>();
        for (const r of replacementRes.data ?? []) {
            if (members.get(r.player_id)?.team.id !== r.team_id) continue;
            const weight = currentSet.has(r.season_id) ? 3 : 1;
            const m = replacedBy.get(r.player_id) ?? new Map<number, number>();
            m.set(r.starter_id, (m.get(r.starter_id) ?? 0) + r.matches * weight);
            replacedBy.set(r.player_id, m);
        }
        const slotsByPlayer = new Map<number, SlotStart[]>();
        const useByTeam = new Map<number, Map<number, SlotUse>>();
        for (const r of slotRows) {
            const weight = currentSet.has(r.season_id) ? 3 : 1;
            slotsByPlayer.set(r.player_id, [...(slotsByPlayer.get(r.player_id) ?? []), {formation: r.formation, position: r.formation_position, starts: r.starts, weight}]);
            // Only the starts at his current club say who he competes with today.
            if (members.get(r.player_id)?.team.id !== r.team_id) continue;
            const team = useByTeam.get(r.team_id) ?? new Map<number, SlotUse>();
            const use = team.get(r.player_id) ?? {playerId: r.player_id, slots: new Map<number, number>(), total: 0};
            use.slots.set(r.formation_position, (use.slots.get(r.formation_position) ?? 0) + r.starts * weight);
            use.total += r.starts * weight;
            team.set(r.player_id, use);
            useByTeam.set(r.team_id, team);
        }

        // The official list, league by league: the role it gives wins over everything else.
        const listoneOf = new Map<number, ListoneMatch>();
        for (const slug of new Set([...members.values()].map((m) => m.leagueSlug))) {
            const rows = LISTONE[slug];
            if (!rows) continue;
            const pool = [...members.values()].filter((m) => m.leagueSlug === slug).map((m) => ({id: m.player.id, name: m.player.name, team: m.team.name}));
            for (const [id, match] of matchListone(parseListone(rows), pool).byPlayer) listoneOf.set(id, match);
        }

        const players: AuctionPlayer[] = [];
        for (const {player, team, league: leagueName} of members.values()) {
            // The role: the official list, else the formations fielded, else the provider's profile
            // (or, failing that, the position of his latest statistics line).
            const statsPosition = (byPlayer.get(player.id) ?? []).sort((a, b) => b.season_year - a.season_year).find((r) => r.position)?.position ?? null;
            const profileRole = ROLE_OF[normalizePosition(player.position) ?? ''] ?? ROLE_OF[normalizePosition(statsPosition) ?? ''] ?? null;
            const call = deriveRole(slotsByPlayer.get(player.id) ?? [], profileRole);
            const listed = listoneOf.get(player.id) ?? null;
            const role = listed?.role ?? call?.role ?? null;
            if (!role) continue;
            const lines: SeasonLine[] = (byPlayer.get(player.id) ?? []).map((r) => ({
                year: r.season_year,
                leagueId: r.league_id,
                leagueName: r.league?.name ?? '',
                teamId: r.team_id,
                teamName: r.team?.name ?? '',
                games: Math.max(games.get(`${r.league_id}:${r.season_year}`) ?? 0, r.appearances ?? 0, 1),
                level: leagueLevel(r.league?.slug ?? '', r.league?.tier ?? null, r.league?.type ?? null),
                cup: r.league?.type === 'cup',
                clubStrength: lineStrengthOf(r.team_id, r.league_id, r.league?.slug ?? '', r.season_year),
                appearances: r.appearances ?? 0,
                lineups: r.lineups ?? 0,
                bench: r.bench ?? 0,
                minutes: r.minutes ?? 0,
                rating: r.rating === null ? null : Number(r.rating),
                goals: r.goals ?? 0,
                assists: r.assists ?? 0,
                penaltiesScored: r.penalties_scored ?? 0,
                penaltiesMissed: r.penalties_missed ?? 0,
                penaltiesSaved: r.penalties_saved ?? 0,
                yellow: r.yellow_cards ?? 0,
                yellowRed: r.yellow_red_cards ?? 0,
                red: r.red_cards ?? 0,
                goalsConceded: r.goals_conceded ?? 0,
                saves: r.saves ?? 0,
            }));
            // Listed among the players who left the league: out, unless he has actually played for his club this season.
            if (listed?.gone && !lines.some((l) => l.year === year && l.teamId === team.id && l.appearances > 0)) continue;
            const injury = injuryOf.get(player.id) ?? null;
            const shape = teamShape.get(team.id) ?? null;
            const inputBase = {
                role,
                age: player.age,
                currentYear: year,
                currentTeamId: team.id,
                seasons: lines,
                injury: injury ? {active: true, daysOut: injury.daysOut, longTerm: injury.estimate.longTerm} : null,
                teamAttack: shape?.attack ?? null,
                teamDefence: shape?.defence ?? null,
                teamRounds: shape?.rounds ?? 0,
                thisSeason: thisSeasonOf.get(player.id) ?? null,
                clubConcededPer90: clubConcededOf(team.id),
                clubStrength: clubStrengthOf(team.id),
            };
            const scores = scorePlayer(inputBase);
            const scoresLeagueOnly = scorePlayer({...inputBase, seasons: lines.filter((l) => !l.cup)});
            players.push({
                id: player.id,
                name: player.name,
                fullName: [player.first_name, player.last_name].filter((n): n is string => !!n && n.trim() !== '').join(' ') || null,
                slug: player.slug,
                role,
                age: player.age,
                imageUrl: player.image_url,
                team: toTeam(team),
                league: leagueName,
                injury: injury ? {category: injury.category, description: injury.description, since: injury.since, daysOut: injury.daysOut, longTerm: injury.estimate.longTerm, estimate: injury.estimate} : null,
                newSigning: (() => {
                    const prev = lines.filter((l) => l.year === year - 1 && l.appearances > 0).sort((a, b) => b.minutes - a.minutes);
                    return prev.length > 0 && !prev.some((l) => l.teamId === team.id) ? prev[0].teamName : null;
                })(),
                europe: europeByTeam.get(team.id) ?? null,
                roleSource: listed ? 'listone' : call?.source === 'lineups' ? 'lineups' : 'profile',
                roleBreakdown: call?.breakdown ?? {},
                listQuote: listed?.quote ?? null,
                listFvm: listed && listed.fvm > 0 ? listed.fvm : null,
                mantraRoles: listed && listed.mantra ? listed.mantra : null,
                availability: availabilityOf.get(player.id) ?? {starts: 0, benches: 0},
                contested: isContested(availabilityOf.get(player.id) ?? {starts: 0, benches: 0}),
                rivals: [],
                penaltyTaker: lines.some((l) => l.year >= year - 1 && l.penaltiesScored >= 2),
                scores,
                scoresLeagueOnly,
                seasons: lines
                    .filter((l) => l.appearances > 0)
                    .sort((a, b) => b.year - a.year || b.minutes - a.minutes)
                    .slice(0, 6)
                    .map((l) => ({year: l.year, league: l.leagueName, cup: l.cup === true, team: l.teamName, apps: l.appearances, lineups: l.lineups, minutes: l.minutes, goals: l.goals, assists: l.assists, rating: l.rating})),
            });
        }
        // Rivals, named once everyone has a role: who started in his slots while he sat on the
        // bench; for a player never benched at the club, the teammates who share his slots.
        const nameOf = new Map(players.map((p) => [p.id, p]));
        for (const p of players) {
            const replaced = replacedBy.get(p.id);
            if (replaced && replaced.size > 0) {
                p.rivals = [...replaced.entries()]
                    .map(([id, shared]) => ({rival: nameOf.get(id), shared}))
                    .filter((x): x is {rival: AuctionPlayer; shared: number} => !!x.rival)
                    .sort((a, b) => b.shared - a.shared)
                    .slice(0, 2)
                    .map((x) => ({id: x.rival.id, name: x.rival.name, shared: Math.round(x.shared)}));
                continue;
            }
            const team = useByTeam.get(p.team.id);
            const use = team?.get(p.id);
            if (!team || !use) continue;
            p.rivals = findRivals(use, [...team.values()], 4)
                .map((r) => ({rival: nameOf.get(r.id), shared: r.shared}))
                .filter((x): x is {rival: AuctionPlayer; shared: number} => !!x.rival && x.rival.role === p.role)
                .slice(0, 2)
                .map((x) => ({id: x.rival.id, name: x.rival.name, shared: Math.round(x.shared)}));
        }
        players.sort((a, b) => b.scores.overall - a.scores.overall || a.name.localeCompare(b.name));

        return {
            league,
            year,
            leagues: seasons.map((s) => ({slug: s.league.slug, name: s.league.name})),
            teams: [...teams.values()].map(toTeam).sort((a, b) => a.name.localeCompare(b.name)),
            players,
            generatedAt: `${romeDate(new Date())}T${new Date().toISOString().slice(11, 16)}Z`,
        };
    }
}

const cachedPool = unstable_cache(buildPool, ['fantasy-auction-pool'], {revalidate: 3600, tags: ['fantasy-pool']});

/**
 * The auction pool for a league, cached for an hour once built. A build
 * that fails (a statement timeout while the database is busy, a sync in
 * progress) is retried once and then reported as null without being
 * cached, so the next request builds it again instead of serving an
 * empty list for an hour.
 */
export async function getAuctionPool(league: AuctionLeague): Promise<AuctionPool | null> {
    for (let attempt = 0; attempt < 2; attempt += 1) {
        try {
            return await cachedPool(league);
        } catch (error) {
            logReadError(`getAuctionPool(${league}) attempt ${attempt + 1}`, error);
        }
    }
    return null;
}
