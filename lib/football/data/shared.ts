import 'server-only';
import {createPublicClient} from '@/lib/db/server';
import type {CompetitionSummary, FixtureState, FixtureSummary, StandingRow, StandingZone, TeamSummary} from '../types';

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
    country_code?: string | null;
    logo_url: string | null;
    type: string | null;
    tier?: 'featured' | 'basic' | null;
}

export interface FixtureRow {
    id: number;
    round: string | null;
    starting_at: string;
    state: FixtureState;
    minute: number | null;
    extra_minute?: number | null;
    last_synced_at?: string | null;
    home_score: number | null;
    away_score: number | null;
    league: LeagueRow | null;
    home: TeamRow | null;
    away: TeamRow | null;
    stats: Array<{team_id: number; possession: number | null; shots_total: number | null; xg: number | null}> | null;
}

export const TEAM_SELECT = 'id,name,short_code,logo_url,slug';
export const LEAGUE_SELECT = 'id,name,slug,country,country_code,logo_url,type,tier';

export const FIXTURE_SELECT =
    'id,round,starting_at,state,minute,extra_minute,last_synced_at,home_score,away_score,' +
    `league:leagues(${LEAGUE_SELECT}),` +
    `home:teams!fixtures_home_team_id_fkey(${TEAM_SELECT}),` +
    `away:teams!fixtures_away_team_id_fkey(${TEAM_SELECT}),` +
    'stats:fixture_team_stats(team_id,possession,shots_total,xg)';

/** Lighter select for long lists (live page, day lists): no statistics join. */
export const FIXTURE_LIST_SELECT =
    'id,round,starting_at,state,minute,extra_minute,last_synced_at,home_score,away_score,' +
    `league:leagues(${LEAGUE_SELECT}),` +
    `home:teams!fixtures_home_team_id_fkey(${TEAM_SELECT}),` +
    `away:teams!fixtures_away_team_id_fkey(${TEAM_SELECT})`;

export function toTeam(row: TeamRow): TeamSummary {
    return {id: row.id, name: row.name, shortCode: row.short_code, logoUrl: row.logo_url, slug: row.slug};
}

export function toCompetition(row: LeagueRow): CompetitionSummary {
    return {
        id: row.id,
        name: row.name,
        slug: row.slug,
        country: row.country,
        countryCode: normalizeCountryCode(row.country_code),
        logoUrl: row.logo_url,
        type: row.type,
        featured: row.tier === 'featured',
    };
}

/** Two-letter code or null ("World" and confederations have none). */
export function normalizeCountryCode(code: string | null | undefined): string | null {
    if (!code) return null;
    const c = code.trim().toLowerCase();
    return /^[a-z]{2}$/.test(c) ? c : null;
}

/** Flag of a country as served by the data provider's CDN. */
export function flagUrl(code: string | null | undefined): string | null {
    const c = normalizeCountryCode(code);
    return c ? `https://media.api-sports.io/flags/${c}.svg` : null;
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
        leagueCountry: row.league.country,
        leagueCountryCode: normalizeCountryCode(row.league.country_code),
        leagueLogoUrl: row.league.logo_url,
        leagueFeatured: row.league.tier === 'featured',
        round: row.round,
        startingAt: row.starting_at,
        state: row.state,
        minute: row.minute,
        extraMinute: row.extra_minute ?? null,
        syncedAt: row.last_synced_at ?? null,
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
    description?: string | null;
    group: string;
    team: TeamRow | null;
}

export const STANDING_SELECT = `position,played,won,drawn,lost,goals_for,goals_against,points,form,description,group,team:teams(${TEAM_SELECT})`;

/** "Promotion - Champions League (Group Stage: )" -> 'champions', "Relegation - Serie B" -> 'relegation' ... */
export function standingZone(description: string | null | undefined): StandingZone | null {
    if (!description) return null;
    const d = description.toLowerCase();
    if (d.includes('champions league')) return 'champions';
    if (d.includes('europa league')) return 'europa';
    if (d.includes('conference')) return 'conference';
    if (d.includes('relegation') && d.includes('play')) return 'relegation_playoff';
    if (d.includes('relegation') || d.includes('descent')) return 'relegation';
    if (d.includes('promotion') && d.includes('play')) return 'playoff';
    if (d.includes('promotion')) return 'promotion';
    if (d.includes('play-off') || d.includes('playoff') || d.includes('play off')) return 'playoff';
    return null;
}

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
        description: r.description ?? null,
        zone: standingZone(r.description),
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
