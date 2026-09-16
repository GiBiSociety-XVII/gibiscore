import 'server-only';
import {unstable_cache} from 'next/cache';
import {fetchAll} from '@/lib/db/paginate';
import {expectedTotals, teamMarketProfile, type TeamMarketProfile, type TeamMatchFacts} from '../markets';
import {footballDb, logReadError} from './shared';
import {previousSeasonId} from './study';

/**
 * The two sides of a match read the markets' way: every finished match
 * of each in this competition, this season and the last, with the
 * minutes of the goals, the corners and the cards, folded into a profile
 * (markets.ts). Only our own tables: the events and statistics the sync
 * already stores for every match.
 */

export interface MatchMarketData {
    home: TeamMarketProfile | null;
    away: TeamMarketProfile | null;
    expected: {corners: number | null; yellows: number | null};
    /** Seasons the matches come from, oldest first (years of the competition). */
    seasons: number[];
}

interface Row {
    id: number;
    season_id: number;
    home_team_id: number;
    away_team_id: number;
    home_score: number | null;
    away_score: number | null;
    events: Array<{team_id: number | null; type: string; minute: number | null}> | null;
    stats: Array<{team_id: number; corners: number | null; yellow_cards: number | null}> | null;
}

const GOAL_TYPES = ['goal', 'penalty', 'own_goal'];

async function loadMatchMarkets(fixtureId: number, seasonId: number, homeId: number, awayId: number): Promise<MatchMarketData | null> {
    try {
        const db = footballDb();
        const previous = await previousSeasonId(seasonId);
        const seasonIds = previous ? [previous, seasonId] : [seasonId];
        const {data: seasonRows} = await db.from('seasons').select('id,year').in('id', seasonIds);
        const years = ((seasonRows ?? []) as Array<{id: number; year: number}>).sort((a, b) => a.year - b.year).map((s) => s.year);
        const rows = (await fetchAll(
            (a, b) =>
                db
                    .from('fixtures')
                    .select('id,season_id,home_team_id,away_team_id,home_score,away_score,events:fixture_events(team_id,type,minute),stats:fixture_team_stats(team_id,corners,yellow_cards)')
                    .in('season_id', seasonIds)
                    .eq('state', 'finished')
                    .neq('id', fixtureId)
                    .or(`home_team_id.in.(${homeId},${awayId}),away_team_id.in.(${homeId},${awayId})`)
                    .in('events.type', GOAL_TYPES)
                    .order('starting_at')
                    .order('id')
                    .range(a, b),
            {max: 500},
        )) as unknown as Row[];
        const factsOf = (teamId: number): TeamMatchFacts[] =>
            rows
                .filter((r) => (r.home_team_id === teamId || r.away_team_id === teamId) && r.home_score !== null && r.away_score !== null)
                .map((r) => {
                    const home = r.home_team_id === teamId;
                    const goals = (r.events ?? []).filter((e) => e.minute !== null);
                    // An own goal is stored on the team it counts for, like any goal.
                    const mine = r.stats?.find((s) => s.team_id === teamId) ?? null;
                    const theirs = r.stats?.find((s) => s.team_id !== teamId) ?? null;
                    return {
                        home,
                        goalsFor: home ? r.home_score! : r.away_score!,
                        goalsAgainst: home ? r.away_score! : r.home_score!,
                        minutesFor: goals.filter((e) => e.team_id === teamId).map((e) => e.minute!),
                        minutesAgainst: goals.filter((e) => e.team_id !== teamId).map((e) => e.minute!),
                        // A goalless match has no goal event to prove its events are stored: trusted when the score says none.
                        withEvents: goals.length > 0 || r.home_score! + r.away_score! === 0,
                        cornersFor: mine?.corners ?? null,
                        cornersAgainst: theirs?.corners ?? null,
                        yellowFor: mine?.yellow_cards ?? null,
                        yellowAgainst: theirs?.yellow_cards ?? null,
                    };
                });
        const home = teamMarketProfile(factsOf(homeId), 'home');
        const away = teamMarketProfile(factsOf(awayId), 'away');
        if (!home && !away) return null;
        return {home, away, expected: expectedTotals(home, away), seasons: years};
    } catch (error) {
        logReadError(`getMatchMarkets(${fixtureId})`, error);
        return null;
    }
}

/** The markets' reading of a match; null without finished matches of either side. Refreshed every ten minutes. */
export const getMatchMarkets = unstable_cache(loadMatchMarkets, ['match-markets'], {revalidate: 600});
