import 'server-only';
import {fantasyScore} from '../fantasy';
import type {PlayerMatchRow, PlayerPage, PlayerSeasonStat, PlayerSeasonTotals} from '../types';
import {normalizePosition} from './matches';
import {FIXTURE_SELECT, TEAM_SELECT, footballDb, logReadError, toFixture, toTeam, type FixtureRow, type TeamRow} from './shared';

interface PlayerStatRow {
    team_id: number;
    minutes_played: number | null;
    rating: number | null;
    goals: number;
    assists: number;
    yellow_cards: number;
    red_cards: number;
    stats: Record<string, number | string | null> | null;
    fixture: (FixtureRow & {season: {year: number; name: string} | null}) | null;
}

interface SeasonStatRow {
    season_year: number;
    position: string | null;
    appearances: number | null;
    lineups: number | null;
    minutes: number | null;
    rating: number | null;
    goals: number | null;
    assists: number | null;
    goals_conceded: number | null;
    saves: number | null;
    shots_total: number | null;
    shots_on: number | null;
    passes_key: number | null;
    passes_accuracy: number | null;
    yellow_cards: number | null;
    yellow_red_cards: number | null;
    red_cards: number | null;
    penalties_scored: number | null;
    penalties_missed: number | null;
    penalties_saved: number | null;
    team: TeamRow | null;
    league: {id: number; name: string; slug: string} | null;
    season: {name: string} | null;
}

function statNumber(stats: Record<string, number | string | null> | null, key: string): number {
    const v = stats?.[key];
    return typeof v === 'number' ? v : Number(v ?? 0) || 0;
}

const MATCH_LINE_SELECT = `team_id,minutes_played,rating,goals,assists,yellow_cards,red_cards,stats,fixture:fixtures!inner(${FIXTURE_SELECT},season:seasons!inner(year,name))`;

/**
 * Player page. `seasonYear` selects the season of the totals and match list
 * (default: the most recent season with data); the per-season table always
 * shows every season stored.
 */
export async function getPlayerPage(slug: string, seasonYear?: number): Promise<PlayerPage | null> {
    try {
        const db = footballDb();
        const {data: playerRow, error: playerError} = await db
            .from('players')
            .select('id,name,slug,position,age,image_url,nationality,height_cm,weight_kg,injured')
            .eq('slug', slug)
            .maybeSingle();
        if (playerError) throw playerError;
        if (!playerRow) return null;
        const p = playerRow as unknown as {id: number; name: string; slug: string; position: string | null; age: number | null; image_url: string | null; nationality: string | null; height_cm: number | null; weight_kg: number | null; injured: boolean | null};

        const [seasonsRes, squadRes, yearsRes] = await Promise.all([
            db
                .from('player_season_stats')
                .select(
                    'season_year,position,appearances,lineups,minutes,rating,goals,assists,goals_conceded,saves,shots_total,shots_on,passes_key,passes_accuracy,' +
                        `yellow_cards,yellow_red_cards,red_cards,penalties_scored,penalties_missed,penalties_saved,team:teams(${TEAM_SELECT}),league:leagues(id,name,slug),season:seasons(name)`,
                )
                .eq('player_id', p.id)
                .order('season_year', {ascending: false})
                .limit(100),
            db
                .from('squad_members')
                .select(`jersey_number,season:seasons!inner(is_current),team:teams(${TEAM_SELECT})`)
                .eq('player_id', p.id)
                .eq('seasons.is_current', true)
                .limit(1),
            // Seasons in which the player has at least one stored match line.
            db
                .from('fixture_player_stats')
                .select('fixture:fixtures!inner(season:seasons!inner(year,name))')
                .eq('player_id', p.id)
                .limit(1000),
        ]);
        if (seasonsRes.error) throw seasonsRes.error;
        if (squadRes.error) throw squadRes.error;
        if (yearsRes.error) throw yearsRes.error;

        const seasons = ((seasonsRes.data ?? []) as unknown as SeasonStatRow[])
            .filter((r) => r.team && r.league)
            .map((r): PlayerSeasonStat => ({
                seasonYear: r.season_year,
                seasonName: r.season?.name ?? String(r.season_year),
                team: toTeam(r.team!),
                competition: {id: r.league!.id, name: r.league!.name, slug: r.league!.slug},
                position: normalizePosition(r.position),
                appearances: r.appearances ?? 0,
                lineups: r.lineups ?? 0,
                minutes: r.minutes ?? 0,
                rating: r.rating,
                goals: r.goals ?? 0,
                assists: r.assists ?? 0,
                goalsConceded: r.goals_conceded,
                saves: r.saves,
                shots: r.shots_total,
                shotsOn: r.shots_on,
                keyPasses: r.passes_key,
                passAccuracy: r.passes_accuracy,
                yellowCards: (r.yellow_cards ?? 0) + (r.yellow_red_cards ?? 0),
                redCards: r.red_cards ?? 0,
                penaltiesScored: r.penalties_scored ?? 0,
                penaltiesMissed: r.penalties_missed ?? 0,
                penaltiesSaved: r.penalties_saved ?? 0,
            }));

        // Seasons with data of either kind, newest first.
        const available = new Map<number, string>();
        for (const s of seasons) available.set(s.seasonYear, s.seasonName);
        for (const row of (yearsRes.data ?? []) as unknown as Array<{fixture: {season: {year: number; name: string} | null} | null}>) {
            const season = row.fixture?.season;
            if (season) available.set(season.year, season.name);
        }
        const availableSeasons = [...available.entries()].map(([year, name]) => ({year, name})).sort((a, b) => b.year - a.year);
        const selectedSeason = seasonYear !== undefined && available.has(seasonYear) ? seasonYear : (availableSeasons[0]?.year ?? new Date().getFullYear());
        const selectedSeasonName = available.get(selectedSeason) ?? String(selectedSeason);

        const {data: statsData, error: statsError} = await db
            .from('fixture_player_stats')
            .select(MATCH_LINE_SELECT)
            .eq('player_id', p.id)
            .eq('fixture.season.year', selectedSeason)
            .limit(80);
        if (statsError) throw statsError;

        const position = normalizePosition(p.position);
        const rows = ((statsData ?? []) as unknown as PlayerStatRow[])
            .filter((r) => r.fixture)
            .map((r): PlayerMatchRow | null => {
                const fixture = toFixture(r.fixture!);
                if (!fixture) return null;
                return {
                    fixture,
                    teamId: r.team_id,
                    minutes: r.minutes_played,
                    rating: r.rating,
                    goals: r.goals,
                    assists: r.assists,
                    yellowCards: r.yellow_cards,
                    redCards: r.red_cards,
                    fantasy: fantasyScore({
                        rating: r.rating,
                        position,
                        minutes: r.minutes_played,
                        goals: r.goals,
                        assists: r.assists,
                        yellowCards: r.yellow_cards,
                        redCards: r.red_cards,
                        penaltiesMissed: statNumber(r.stats, 'penalty_missed'),
                        penaltiesSaved: statNumber(r.stats, 'penalty_saved'),
                        goalsConceded: statNumber(r.stats, 'goals_conceded'),
                    }),
                };
            })
            .filter((r): r is PlayerMatchRow => r !== null)
            .sort((a, b) => b.fixture.startingAt.localeCompare(a.fixture.startingAt));

        const played = rows.filter((r) => (r.minutes ?? 0) > 0);
        const rated = played.filter((r) => r.rating !== null);
        const withFantasy = played.filter((r) => r.fantasy !== null);
        const totals: PlayerSeasonTotals = {
            matches: played.length,
            minutes: played.reduce((s, r) => s + (r.minutes ?? 0), 0),
            goals: rows.reduce((s, r) => s + r.goals, 0),
            assists: rows.reduce((s, r) => s + r.assists, 0),
            yellowCards: rows.reduce((s, r) => s + r.yellowCards, 0),
            redCards: rows.reduce((s, r) => s + r.redCards, 0),
            averageRating: rated.length ? Math.round((rated.reduce((s, r) => s + (r.rating ?? 0), 0) / rated.length) * 100) / 100 : null,
            averageFantasy: withFantasy.length ? Math.round((withFantasy.reduce((s, r) => s + (r.fantasy ?? 0), 0) / withFantasy.length) * 100) / 100 : null,
        };

        const squad = (squadRes.data?.[0] ?? null) as unknown as {jersey_number: number | null; team: TeamRow | null} | null;
        let team = squad?.team ? toTeam(squad.team) : null;
        if (!team) {
            // Newest season aggregate, then the latest match line, tell the current team.
            const latest = seasons[0]?.team ?? null;
            const latestTeamId = latest ? null : (rows[0]?.teamId ?? null);
            team = latest;
            if (!team && latestTeamId) {
                const {data: teamRow} = await db.from('teams').select(TEAM_SELECT).eq('id', latestTeamId).maybeSingle();
                if (teamRow) team = toTeam(teamRow as unknown as TeamRow);
            }
        }

        return {
            player: {
                id: p.id,
                name: p.name,
                slug: p.slug,
                number: squad?.jersey_number ?? null,
                position,
                age: p.age,
                imageUrl: p.image_url,
                nationality: p.nationality,
                height: p.height_cm,
                weight: p.weight_kg,
                injured: p.injured === true,
            },
            team,
            selectedSeason,
            selectedSeasonName,
            availableSeasons,
            totals,
            matches: rows,
            seasons,
        };
    } catch (error) {
        logReadError(`getPlayerPage(${slug})`, error);
        return null;
    }
}
