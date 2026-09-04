import 'server-only';
import {fetchAll} from '@/lib/db/paginate';
import {featuredPriority} from '../competitions';
import {predictMatch, type MatchPrediction} from '../prediction';
import {LIVE_STATES, type CompetitionSummary, type FixtureSummary} from '../types';
import {getSeasonStudy} from './study';
import {LEAGUE_SELECT, TEAM_SELECT, footballDb, logReadError, toCompetition, toFixture, type FixtureRow, type LeagueRow} from './shared';

export interface PredictedFixture {
    fixture: FixtureSummary;
    prediction: MatchPrediction | null;
}

export interface PredictionBlock {
    competition: CompetitionSummary;
    fixtures: PredictedFixture[];
}

/**
 * Upcoming fixtures of the featured competitions, next `days` days,
 * each with its prediction from the season study. Studies are cached per
 * season, so this costs one fixtures query plus one study per season.
 */
export async function getUpcomingPredictions(days = 3): Promise<PredictionBlock[]> {
    try {
        const db = footballDb();
        const from = new Date(Date.now() - 2 * 3_600_000).toISOString();
        const to = new Date(Date.now() + days * 86_400_000).toISOString();
        const rows = (await fetchAll(
            (a, b) =>
                db
                    .from('fixtures')
                    .select(`id,round,starting_at,state,minute,home_score,away_score,season_id,league:leagues!inner(${LEAGUE_SELECT}),home:teams!fixtures_home_team_id_fkey(${TEAM_SELECT}),away:teams!fixtures_away_team_id_fkey(${TEAM_SELECT})`)
                    .eq('leagues.tier', 'featured')
                    .in('state', ['scheduled', ...LIVE_STATES])
                    .gte('starting_at', from)
                    .lte('starting_at', to)
                    .order('starting_at')
                    .order('id')
                    .range(a, b),
            {max: 1000},
        )) as unknown as Array<FixtureRow & {season_id: number | null; league: LeagueRow | null}>;
        const seasonIds = [...new Set(rows.map((r) => r.season_id).filter((id): id is number => id !== null))];
        const studies = new Map(await Promise.all(seasonIds.map(async (id) => [id, await getSeasonStudy(id)] as const)));
        const blocks = new Map<number, PredictionBlock>();
        for (const row of rows) {
            if (!row.league) continue;
            const fixture = toFixture(row);
            if (!fixture) continue;
            if (!blocks.has(row.league.id)) blocks.set(row.league.id, {competition: toCompetition(row.league), fixtures: []});
            const study = row.season_id ? (studies.get(row.season_id) ?? null) : null;
            blocks.get(row.league.id)!.fixtures.push({fixture, prediction: predictMatch(study, fixture.home.id, fixture.away.id)});
        }
        return [...blocks.values()].sort((a, b) => featuredPriority(a.competition.slug) - featuredPriority(b.competition.slug) || a.competition.name.localeCompare(b.competition.name));
    } catch (error) {
        logReadError('getUpcomingPredictions', error);
        return [];
    }
}
