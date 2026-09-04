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
import {deriveRole, findRivals, type SlotStart, type SlotUse} from './roles';
import {scorePlayer, type FantaRole, type FantaScores, type SeasonLine} from './scores';

/**
 * Player pool of a fantasy auction: every player in the current squads
 * of the chosen league(s), with three seasons of statistics turned into
 * the auction marks. Cached one hour per league.
 */

export interface AuctionPlayer {
    id: number;
    name: string;
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
    roleSource: 'listone' | 'lineups' | 'profile';
    /** Weighted starts per role from the formations fielded (current season counts three times). */
    roleBreakdown: Partial<Record<FantaRole, number>>;
    /** The official list's own quotation, when he is on it. */
    listQuote: number | null;
    /** Teammates who started in the same slots of the formation: who he competes with for the pitch. */
    rivals: Array<{id: number; name: string; shared: number}>;
    /** Took penalties recently: two or more scored in a season of the last two. */
    penaltyTaker: boolean;
    scores: FantaScores;
    /** Last seasons, newest first, for the detail row. */
    seasons: Array<{year: number; league: string; team: string; apps: number; lineups: number; minutes: number; goals: number; assists: number; rating: number | null}>;
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

/** How much a season in this competition says about the next one in a top league. */
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

        // Current squads, plus anyone with statistics for a club of these
        // leagues this season: the provider's squads lag behind transfers,
        // the season statistics list a player under his new club as soon as
        // he plays. Whichever source was written last decides the club.
        type Member = {player: {id: number; name: string; slug: string; position: string | null; age: number | null; image_url: string | null}; team: TeamRow; league: string; leagueSlug: string; at: string};
        const [squad, played] = await Promise.all([
            fetchAll(
                (a, b) => db.from('squad_members').select(`season_id,team_id,updated_at,player:players(id,name,slug,position,age,image_url),team:teams(${TEAM_SELECT})`).in('season_id', seasons.map((s) => s.season.id)).order('player_id').range(a, b),
                {max: 6000},
            ) as unknown as Promise<Array<{season_id: number; updated_at: string; player: Member['player'] | null; team: TeamRow | null}>>,
            fetchAll(
                (a, b) => db.from('player_season_stats').select(`league_id,synced_at,player:players(id,name,slug,position,age,image_url),team:teams(${TEAM_SELECT})`).in('league_id', seasons.map((s) => s.league.id)).eq('season_year', year).order('id').range(a, b),
                {max: 6000},
            ) as unknown as Promise<Array<{league_id: number; synced_at: string; player: Member['player'] | null; team: TeamRow | null}>>,
        ]);
        const leagueOfSeason = new Map(seasons.map((s) => [s.season.id, s.league]));
        const leagueById = new Map(seasons.map((s) => [s.league.id, s.league]));
        const members = new Map<number, Member>();
        const teams = new Map<number, TeamRow>();
        const consider = (m: Member) => {
            teams.set(m.team.id, m.team);
            const known = members.get(m.player.id);
            if (!known || m.at > known.at) members.set(m.player.id, m);
        };
        for (const m of squad) if (m.player && m.team) consider({player: m.player, team: m.team, league: leagueOfSeason.get(m.season_id)?.name ?? '', leagueSlug: leagueOfSeason.get(m.season_id)?.slug ?? '', at: m.updated_at});
        for (const m of played) if (m.player && m.team) consider({player: m.player, team: m.team, league: leagueById.get(m.league_id)?.name ?? '', leagueSlug: leagueById.get(m.league_id)?.slug ?? '', at: m.synced_at});
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
        const [studies, sidelined] = await Promise.all([
            Promise.all(seasons.map(async (s) => [s.season.id, await getSeasonStudy(s.season.id)] as const)),
            loadTeamSidelined(db, [...teams.keys()]),
        ]);
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
        const currentIds = seasons.map((s) => s.season.id);
        const previousIds = leagues.flatMap((l) => l.seasons.filter((s) => s.year === year - 1).map((s) => s.id));
        const {data: slotRows, error: slotError} = await (db as unknown as {rpc: (fn: string, args: Record<string, unknown>) => PromiseLike<{data: SlotRow[] | null; error: {message: string} | null}>}).rpc('lineup_slots', {p_season_ids: [...currentIds, ...previousIds]});
        if (slotError) throw slotError;
        const currentSet = new Set(currentIds);
        const slotsByPlayer = new Map<number, SlotStart[]>();
        const useByTeam = new Map<number, Map<number, SlotUse>>();
        for (const r of slotRows ?? []) {
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
            const injury = injuryOf.get(player.id) ?? null;
            const shape = teamShape.get(team.id) ?? null;
            const scores = scorePlayer({
                role,
                age: player.age,
                currentYear: year,
                currentTeamId: team.id,
                seasons: lines,
                injury: injury ? {active: true, daysOut: injury.daysOut, longTerm: injury.estimate.longTerm} : null,
                teamAttack: shape?.attack ?? null,
                teamDefence: shape?.defence ?? null,
                teamRounds: shape?.rounds ?? 0,
            });
            players.push({
                id: player.id,
                name: player.name,
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
                rivals: [],
                penaltyTaker: lines.some((l) => l.year >= year - 1 && l.penaltiesScored >= 2),
                scores,
                seasons: lines
                    .filter((l) => l.appearances > 0)
                    .sort((a, b) => b.year - a.year || b.minutes - a.minutes)
                    .slice(0, 6)
                    .map((l) => ({year: l.year, league: l.leagueName, team: l.teamName, apps: l.appearances, lineups: l.lineups, minutes: l.minutes, goals: l.goals, assists: l.assists, rating: l.rating})),
            });
        }
        // Rivals: teammates who started in the same slots, named once everyone has a role.
        const nameOf = new Map(players.map((p) => [p.id, p]));
        for (const p of players) {
            const team = useByTeam.get(p.team.id);
            const use = team?.get(p.id);
            if (!team || !use) continue;
            p.rivals = findRivals(use, [...team.values()], 4)
                .map((r) => ({rival: nameOf.get(r.id), shared: r.shared}))
                .filter((x): x is {rival: AuctionPlayer; shared: number} => !!x.rival && (x.rival.role === p.role || x.shared >= 3))
                .slice(0, 2)
                .map((x) => ({id: x.rival.id, name: x.rival.name, shared: x.shared}));
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

const cachedPool = unstable_cache(buildPool, ['fantasy-auction-pool'], {revalidate: 3600});

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
