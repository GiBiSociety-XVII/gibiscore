import 'server-only';
import {unstable_cache} from 'next/cache';
import {fetchAll} from '@/lib/db/paginate';
import {isBuildPhase} from '@/lib/db/phase';
import {footballDb, logReadError} from '@/lib/football/data/shared';
import {AUCTION_LEAGUES, type AuctionLeague} from './config';
import {readRoundVotes, type RoundVoteRow} from './round-votes';
import type {FantaRole} from './scores';
import {DEFAULT_CALIBRATION, fitCalibration, type VotoCalibration, type VotoPair} from './voto';

/**
 * The vote scale learnt from the votes users type in: every typed vote
 * against the provider's rating of the same match, over this season
 * and the last, so the scale carries over the winter market and into
 * the next auction. Shared by the matchday (which adds the official
 * workbooks' pairs on top) and the auction pool.
 */

const ROLE_OF_POSITION: Record<string, FantaRole> = {goalkeeper: 'P', defender: 'D', midfielder: 'C', attacker: 'A'};
/** Seasons whose typed votes count: the current one and the one before. */
const SEASONS = 2;

async function buildTypedPairs(league: AuctionLeague): Promise<VotoPair[]> {
    const db = footballDb();
    const slugs = AUCTION_LEAGUES.find((l) => l.key === league)?.slugs ?? [];
    const {data: leagueRows, error} = await db.from('leagues').select('id,slug,seasons(id,year)').in('slug', slugs);
    if (error) throw error;
    const seasonIds = ((leagueRows ?? []) as unknown as Array<{seasons: Array<{id: number; year: number}>}>)
        .flatMap((l) => [...l.seasons].sort((a, b) => b.year - a.year).slice(0, SEASONS))
        .map((s) => s.id);
    if (seasonIds.length === 0) return [];

    // Every typed vote (0 is a typed "no vote": no pair), on its club's match of that round.
    const typed: Array<{seasonId: number; row: RoundVoteRow}> = [];
    for (const seasonId of seasonIds) {
        for (const row of await readRoundVotes(db, seasonId)) if (row.voto !== null && Number(row.voto) > 0) typed.push({seasonId, row});
    }
    if (typed.length === 0) return [];
    const fixtures = (await fetchAll((a, b) => db.from('fixtures').select('id,season_id,round,home_team_id,away_team_id').in('season_id', seasonIds).order('id').range(a, b), {max: 2000})) as Array<{id: number; season_id: number; round: string | null; home_team_id: number; away_team_id: number}>;
    const votes: Array<{fixtureId: number; playerId: number; voto: number}> = [];
    for (const {seasonId, row} of typed) {
        const f = fixtures.find((x) => x.season_id === seasonId && x.round === row.round && (x.home_team_id === row.team_id || x.away_team_id === row.team_id));
        if (f) votes.push({fixtureId: f.id, playerId: row.player_id, voto: Number(row.voto)});
    }
    const fixtureIds = [...new Set(votes.map((v) => v.fixtureId))];
    const playerIds = [...new Set(votes.map((v) => v.playerId))];
    const rating = new Map<string, number>();
    for (let i = 0; i < fixtureIds.length; i += 100) {
        const {data} = await db.from('fixture_player_stats').select('fixture_id,player_id,rating').in('fixture_id', fixtureIds.slice(i, i + 100)).in('player_id', playerIds);
        for (const s of (data ?? []) as Array<{fixture_id: number; player_id: number; rating: number | string | null}>) if (s.rating !== null) rating.set(`${s.fixture_id}:${s.player_id}`, Number(s.rating));
    }
    const role = new Map<number, FantaRole>();
    for (let i = 0; i < playerIds.length; i += 300) {
        const {data} = await db.from('players').select('id,position').in('id', playerIds.slice(i, i + 300));
        for (const p of (data ?? []) as Array<{id: number; position: string | null}>) {
            const r = ROLE_OF_POSITION[p.position ?? ''];
            if (r) role.set(p.id, r);
        }
    }
    const pairs: VotoPair[] = [];
    for (const v of votes) {
        const r = rating.get(`${v.fixtureId}:${v.playerId}`);
        const fantaRole = role.get(v.playerId);
        if (r !== undefined && fantaRole) pairs.push({rating: r, voto: v.voto, role: fantaRole});
    }
    return pairs;
}

const cachedTypedPairs = unstable_cache(buildTypedPairs, ['fantasy-typed-pairs', process.env.VERCEL_GIT_COMMIT_SHA ?? 'local'], {revalidate: 600, tags: ['fantasy-votes']});

/** The typed votes against the provider's ratings, this season and the last; empty when the read fails, and at build time (not cached then). */
export async function getTypedPairs(league: AuctionLeague): Promise<VotoPair[]> {
    if (isBuildPhase()) return [];
    try {
        return await cachedTypedPairs(league);
    } catch (error) {
        logReadError(`typed votes ${league}`, error);
        return [];
    }
}

/** The vote scale for the auction: the defaults moved by the typed votes (see fitCalibration). */
export async function getTypedCalibration(league: AuctionLeague): Promise<VotoCalibration> {
    const pairs = await getTypedPairs(league);
    return pairs.length > 0 ? fitCalibration(pairs) : DEFAULT_CALIBRATION;
}

/**
 * The scale every rating on the site is shown on: the provider rates on
 * its own scale, the readers know the newspapers' votes, so a rating is
 * shown as the vote it stands for. Serie A's fitted scale (the votes are
 * typed for it), applied to every competition: the provider's scale is
 * the same everywhere.
 */
export function getVoteScale(): Promise<VotoCalibration> {
    return getTypedCalibration('serie-a');
}
