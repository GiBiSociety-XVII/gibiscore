import 'server-only';
import {fantasyScore} from '../fantasy';
import type {PlayerMatchRow, PlayerPage, PlayerSeasonTotals} from '../types';
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
    fixture: FixtureRow | null;
}

function statNumber(stats: Record<string, number | string | null> | null, key: string): number {
    const v = stats?.[key];
    return typeof v === 'number' ? v : Number(v ?? 0) || 0;
}

export async function getPlayerPage(slug: string): Promise<PlayerPage | null> {
    try {
        const db = footballDb();
        const {data: playerRow, error: playerError} = await db
            .from('players')
            .select('id,name,slug,position,age,image_url,nationality,height_cm,weight_kg')
            .eq('slug', slug)
            .maybeSingle();
        if (playerError) throw playerError;
        if (!playerRow) return null;
        const p = playerRow as unknown as {id: number; name: string; slug: string; position: string | null; age: number | null; image_url: string | null; nationality: string | null; height_cm: number | null; weight_kg: number | null};

        const [statsRes, squadRes] = await Promise.all([
            db
                .from('fixture_player_stats')
                .select(`team_id,minutes_played,rating,goals,assists,yellow_cards,red_cards,stats,fixture:fixtures(${FIXTURE_SELECT})`)
                .eq('player_id', p.id)
                .limit(60),
            db
                .from('squad_members')
                .select(`jersey_number,season:seasons!inner(is_current),team:teams(${TEAM_SELECT})`)
                .eq('player_id', p.id)
                .eq('seasons.is_current', true)
                .limit(1),
        ]);
        if (statsRes.error) throw statsRes.error;
        if (squadRes.error) throw squadRes.error;

        const position = normalizePosition(p.position);
        const rows = ((statsRes.data ?? []) as unknown as PlayerStatRow[])
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
        const latestTeamId = rows[0]?.teamId ?? null;
        let team = squad?.team ? toTeam(squad.team) : null;
        if (!team && latestTeamId) {
            const {data: teamRow} = await db.from('teams').select(TEAM_SELECT).eq('id', latestTeamId).maybeSingle();
            if (teamRow) team = toTeam(teamRow as unknown as TeamRow);
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
            },
            team,
            totals,
            matches: rows,
        };
    } catch (error) {
        logReadError(`getPlayerPage(${slug})`, error);
        return null;
    }
}
