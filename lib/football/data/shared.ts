import 'server-only';
import {createPublicClient} from '@/lib/db/server';
import type {CompetitionSummary, FixtureState, FixtureSummary, StandingRow, TeamSummary} from '../types';

/**
 * Shared pieces of the read layer: the public client bound to the football
 * schema, the fixture select string and row-to-model converters. Every page
 * query module builds on these.
 */

export type SchemaClient = ReturnType<ReturnType<typeof createPublicClient>['schema']>;

export function footballDb(): SchemaClient {
    return createPublicClient().schema('football');
}

export interface TeamRow {
    id: number;
    name: string;
    short_code: string | null;
    logo_url: string | null;
    slug: string;
}

export interface LeagueRow {
    id: number;
    name: string;
    slug: string;
    country: string | null;
    logo_url: string | null;
    type: string | null;
}

export interface FixtureRow {
    id: number;
    round: string | null;
    starting_at: string;
    state: FixtureState;
    minute: number | null;
    home_score: number | null;
    away_score: number | null;
    league: LeagueRow | null;
    home: TeamRow | null;
    away: TeamRow | null;
    stats: Array<{team_id: number; possession: number | null; shots_total: number | null; xg: number | null}> | null;
}

export const TEAM_SELECT = 'id,name,short_code,logo_url,slug';
export const LEAGUE_SELECT = 'id,name,slug,country,logo_url,type';

export const FIXTURE_SELECT =
    'id,round,starting_at,state,minute,home_score,away_score,' +
    `league:leagues(${LEAGUE_SELECT}),` +
    `home:teams!fixtures_home_team_id_fkey(${TEAM_SELECT}),` +
    `away:teams!fixtures_away_team_id_fkey(${TEAM_SELECT}),` +
    'stats:fixture_team_stats(team_id,possession,shots_total,xg)';

export function toTeam(row: TeamRow): TeamSummary {
    return {id: row.id, name: row.name, shortCode: row.short_code, logoUrl: row.logo_url, slug: row.slug};
}

export function toCompetition(row: LeagueRow): CompetitionSummary {
    return {id: row.id, name: row.name, slug: row.slug, country: row.country, logoUrl: row.logo_url, type: row.type};
}

export function toFixture(row: FixtureRow): FixtureSummary | null {
    if (!row.home || !row.away || !row.league) return null;
    const homeStats = row.stats?.find((s) => s.team_id === row.home!.id) ?? null;
    const awayStats = row.stats?.find((s) => s.team_id === row.away!.id) ?? null;
    const hasStats = homeStats !== null || awayStats !== null;
    return {
        id: row.id,
        leagueName: row.league.name,
        leagueSlug: row.league.slug,
        round: row.round,
        startingAt: row.starting_at,
        state: row.state,
        minute: row.minute,
        home: toTeam(row.home),
        away: toTeam(row.away),
        homeScore: row.home_score,
        awayScore: row.away_score,
        stats: hasStats
            ? {
                  homePossession: homeStats?.possession ?? null,
                  homeShots: homeStats?.shots_total ?? null,
                  awayShots: awayStats?.shots_total ?? null,
                  homeXg: homeStats?.xg ?? null,
                  awayXg: awayStats?.xg ?? null,
              }
            : null,
        form: null,
    };
}

export function toFixtures(rows: unknown): FixtureSummary[] {
    return ((rows ?? []) as FixtureRow[]).map(toFixture).filter((f): f is FixtureSummary => f !== null);
}

export interface StandingQueryRow {
    position: number;
    played: number;
    won: number;
    drawn: number;
    lost: number;
    goals_for: number;
    goals_against: number;
    points: number;
    form: string | null;
    group: string;
    team: TeamRow | null;
}

export const STANDING_SELECT = `position,played,won,drawn,lost,goals_for,goals_against,points,form,group,team:teams(${TEAM_SELECT})`;

export function toStandingRow(r: StandingQueryRow): StandingRow | null {
    if (!r.team) return null;
    return {
        position: r.position,
        team: toTeam(r.team),
        played: r.played,
        won: r.won,
        drawn: r.drawn,
        lost: r.lost,
        goalDifference: r.goals_for - r.goals_against,
        goalsFor: r.goals_for,
        goalsAgainst: r.goals_against,
        points: r.points,
        form: r.form,
    };
}

/** "Regular Season - 3" -> "Giornata 3"; other round names pass through. */
export function roundLabel(round: string | null): string {
    if (!round) return '';
    const m = round.match(/^Regular Season\s*-\s*(\d+)$/i);
    if (m) return `Giornata ${m[1]}`;
    return round.replace(/^League Stage\s*-\s*/i, 'Fase campionato ').replace(/^Group Stage\s*-\s*/i, 'Fase a gironi ');
}

/** Numeric round when the name follows "Regular Season - N", else null. */
export function roundNumber(round: string | null): number | null {
    const m = round?.match(/(\d+)\s*$/);
    return m ? Number(m[1]) : null;
}

/** Log and swallow read errors: pages degrade to empty states, never crash. */
export function logReadError(where: string, error: unknown) {
    console.error(`[football/data] ${where}:`, (error as Error)?.message ?? error);
}
