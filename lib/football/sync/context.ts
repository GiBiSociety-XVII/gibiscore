import 'server-only';
import type {SupabaseClient} from '@supabase/supabase-js';
import {createServiceClient} from '@/lib/db/server';
import {slugify} from '@/lib/api-football/mappers';

/**
 * Shared plumbing for sync jobs: a service-role client bound to the
 * `football` schema, id maps between provider ids and our ids, and a
 * sync_runs logger.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type FootballClient = SupabaseClient<any, 'football', any>;

export type LeagueTier = 'featured' | 'basic';

export class SyncError extends Error {
    constructor(message: string, public readonly details?: unknown) {
        super(message);
        this.name = 'SyncError';
    }
}

export function footballClient(): FootballClient {
    return createServiceClient() as unknown as FootballClient;
}

function fail(step: string, error: {message: string; details?: string | null; hint?: string | null; code?: string} | null): never {
    throw new SyncError(`${step}: ${error?.message ?? 'unknown error'}`, error);
}

// ---------------------------------------------------------------------------
// sync_runs
// ---------------------------------------------------------------------------

export interface SyncRun {
    id: number;
    job: string;
    requests: number;
    counters: Record<string, number>;
    warnings: string[];
    bump(counter: string, by?: number): void;
    warn(message: string): void;
}

export async function startRun(db: FootballClient, job: string): Promise<SyncRun> {
    const {data, error} = await db.from('sync_runs').insert({job}).select('id').single();
    if (error) fail('sync_runs.insert', error);
    if (!data || typeof data.id !== 'number') {
        throw new SyncError('sync_runs.insert returned no row: is the `football` schema exposed in Supabase Data API settings?');
    }
    const run: SyncRun = {
        id: data.id as number,
        job,
        requests: 0,
        counters: {},
        warnings: [],
        bump(counter, by = 1) {
            run.counters[counter] = (run.counters[counter] ?? 0) + by;
        },
        warn(message) {
            if (run.warnings.length < 50) run.warnings.push(message);
            console.warn(`[${job}] ${message}`);
        },
    };
    return run;
}

export async function finishRun(db: FootballClient, run: SyncRun, status: 'ok' | 'error', errorMessage?: string) {
    await db
        .from('sync_runs')
        .update({
            finished_at: new Date().toISOString(),
            status,
            requests_used: run.requests,
            details: {counters: run.counters, warnings: run.warnings, error: errorMessage ?? null},
        })
        .eq('id', run.id);
}

// ---------------------------------------------------------------------------
// Id maps
// ---------------------------------------------------------------------------

export type IdMap = Map<number, number>; // provider_id -> our id

export async function idMap(db: FootballClient, table: string, providerIds: number[]): Promise<IdMap> {
    const map: IdMap = new Map();
    for (let i = 0; i < providerIds.length; i += 500) {
        const chunk = providerIds.slice(i, i + 500);
        const {data, error} = await db.from(table).select('id,provider_id').in('provider_id', chunk);
        if (error) fail(`${table}.select`, error);
        for (const row of data ?? []) map.set(row.provider_id as number, row.id as number);
    }
    return map;
}

export interface LeagueRef {
    id: number;
    providerId: number;
    tier: LeagueTier;
}

/** Leagues by provider id, with tier. */
export async function leagueMap(db: FootballClient, providerIds: number[]): Promise<Map<number, LeagueRef>> {
    const map = new Map<number, LeagueRef>();
    for (let i = 0; i < providerIds.length; i += 500) {
        const chunk = providerIds.slice(i, i + 500);
        const {data, error} = await db.from('leagues').select('id,provider_id,tier').in('provider_id', chunk);
        if (error) fail('leagues.select', error);
        for (const row of data ?? []) map.set(row.provider_id as number, {id: row.id as number, providerId: row.provider_id as number, tier: row.tier as LeagueTier});
    }
    return map;
}

export interface MinimalLeague {
    id: number;
    name: string;
    country?: string | null;
    logo?: string | null;
    type?: string | null;
}

/** Create leagues we have never seen (basic tier) so no fixture is dropped. */
export async function ensureLeagues(db: FootballClient, leagues: MinimalLeague[], tierOf: (providerId: number) => LeagueTier): Promise<Map<number, LeagueRef>> {
    const unique = new Map<number, MinimalLeague>();
    for (const l of leagues) if (l.id) unique.set(l.id, l);
    if (unique.size === 0) return new Map();
    const ids = [...unique.keys()];
    const existing = await leagueMap(db, ids);
    const missing = ids.filter((id) => !existing.has(id));
    if (missing.length > 0) {
        const rows = missing.map((id) => {
            const l = unique.get(id)!;
            return {
                provider_id: id,
                name: l.name,
                country: l.country ?? null,
                type: l.type?.toLowerCase() ?? null,
                logo_url: l.logo ?? null,
                slug: slugify(`${l.name} ${l.country ?? ''}`.trim(), id),
                is_active: true,
                tier: tierOf(id),
            };
        });
        const {error} = await db.from('leagues').upsert(rows, {onConflict: 'provider_id', ignoreDuplicates: true});
        if (error) fail('leagues.upsert', error);
    }
    return leagueMap(db, ids);
}

export interface SeasonRef {
    id: number;
    leagueId: number;
    leagueProviderId: number;
    leagueSlug: string;
    tier: LeagueTier;
    year: number;
    name: string;
}

/** Every season flagged current, with its league; optionally one tier only. */
export async function currentSeasons(db: FootballClient, tier?: LeagueTier): Promise<SeasonRef[]> {
    let query = db
        .from('seasons')
        .select('id,year,name,league:leagues!inner(id,provider_id,slug,tier)')
        .eq('is_current', true);
    if (tier) query = query.eq('leagues.tier', tier);
    const {data, error} = await query.limit(5000);
    if (error) fail('seasons.select', error);
    return (data ?? []).map((row) => {
        const league = row.league as unknown as {id: number; provider_id: number; slug: string; tier: LeagueTier};
        return {
            id: row.id as number,
            leagueId: league.id,
            leagueProviderId: league.provider_id,
            leagueSlug: league.slug,
            tier: league.tier,
            year: row.year as number,
            name: row.name as string,
        };
    });
}

/**
 * Seasons keyed by "leagueDbId:year", creating placeholders for unknown
 * ones. A placeholder is flagged current unless the league already has a
 * current season of a later (or the same) year: past seasons imported for
 * history must never steal the flag.
 */
export async function ensureSeasons(db: FootballClient, wanted: Array<{leagueId: number; year: number}>, run?: SyncRun): Promise<Map<string, number>> {
    const map = new Map<string, number>();
    const currentYear = new Map<number, number>(); // league -> year flagged current
    const leagueIds = [...new Set(wanted.map((w) => w.leagueId))];
    for (let i = 0; i < leagueIds.length; i += 300) {
        const {data, error} = await db.from('seasons').select('id,league_id,year,is_current').in('league_id', leagueIds.slice(i, i + 300));
        if (error) fail('seasons.select', error);
        for (const r of data ?? []) {
            map.set(`${r.league_id}:${r.year}`, r.id as number);
            if (r.is_current) currentYear.set(r.league_id as number, Math.max(currentYear.get(r.league_id as number) ?? 0, r.year as number));
        }
    }
    const missing = new Map<string, {league_id: number; year: number}>();
    for (const w of wanted) {
        const key = `${w.leagueId}:${w.year}`;
        if (!map.has(key)) missing.set(key, {league_id: w.leagueId, year: w.year});
    }
    if (missing.size > 0) {
        const rows = [...missing.values()].map((m) => ({
            ...m,
            name: String(m.year),
            is_current: (currentYear.get(m.league_id) ?? -1) < m.year,
        }));
        const {data, error} = await db.from('seasons').upsert(rows, {onConflict: 'league_id,year'}).select('id,league_id,year');
        if (error) fail('seasons.upsert', error);
        for (const r of data ?? []) map.set(`${r.league_id}:${r.year}`, r.id as number);
        run?.bump('seasons_created', rows.length);
    }
    return map;
}

export interface SeasonRow extends SeasonRef {
    isCurrent: boolean;
    fixturesListedAt: string | null;
    playersSyncedAt: string | null;
}

/**
 * Seasons of the featured leagues to keep in the database: the current one
 * plus `historyCount` past years, oldest last. Missing past seasons are
 * created (not current) so fixtures and player stats can hang off them.
 */
export async function featuredSeasons(db: FootballClient, historyCount: number, run?: SyncRun): Promise<SeasonRow[]> {
    const current = await currentSeasons(db, 'featured');
    const wanted: Array<{leagueId: number; year: number}> = [];
    for (const s of current) {
        for (let back = 1; back <= historyCount; back += 1) wanted.push({leagueId: s.leagueId, year: s.year - back});
    }
    if (wanted.length > 0) await ensureSeasons(db, wanted, run);

    const leagueIds = [...new Set(current.map((s) => s.leagueId))];
    if (leagueIds.length === 0) return [];
    const minYear = new Map<number, number>(current.map((s) => [s.leagueId, s.year - historyCount]));
    const {data, error} = await db
        .from('seasons')
        .select('id,year,name,is_current,fixtures_listed_at,players_synced_at,league:leagues!inner(id,provider_id,slug,tier)')
        .in('league_id', leagueIds)
        .limit(2000);
    if (error) fail('seasons.select', error);
    const byLeague = new Map<number, SeasonRef>(current.map((s) => [s.leagueId, s]));
    return (data ?? [])
        .map((row): SeasonRow => {
            const league = row.league as unknown as {id: number; provider_id: number; slug: string; tier: LeagueTier};
            return {
                id: row.id as number,
                leagueId: league.id,
                leagueProviderId: league.provider_id,
                leagueSlug: league.slug,
                tier: league.tier,
                year: row.year as number,
                name: row.name as string,
                isCurrent: row.is_current === true,
                fixturesListedAt: (row.fixtures_listed_at as string | null) ?? null,
                playersSyncedAt: (row.players_synced_at as string | null) ?? null,
            };
        })
        .filter((s) => s.year >= (minYear.get(s.leagueId) ?? 0) && s.year <= (byLeague.get(s.leagueId)?.year ?? 0))
        .sort((a, b) => b.year - a.year || a.leagueSlug.localeCompare(b.leagueSlug));
}

export interface MinimalTeam {
    id: number;
    name: string;
    logo?: string | null;
    code?: string | null;
    country?: string | null;
    founded?: number | null;
    venueName?: string | null;
}

/** Upsert teams from any payload that carries them and return the id map. */
export async function ensureTeams(db: FootballClient, teams: MinimalTeam[]): Promise<IdMap> {
    const unique = new Map<number, MinimalTeam>();
    for (const team of teams) if (team.id) unique.set(team.id, {...unique.get(team.id), ...team});
    if (unique.size === 0) return new Map();

    const ids = [...unique.keys()];
    const existing = await idMap(db, 'teams', ids);

    // Rich rows (from /teams) update everything; minimal rows (from fixtures)
    // only create missing teams so they never blank out stored details.
    const richRows = [...unique.values()].filter((t) => t.code !== undefined || t.country !== undefined || t.founded !== undefined);
    const minimalRows = [...unique.values()].filter((t) => !richRows.includes(t) && !existing.has(t.id));

    if (richRows.length > 0) {
        const {error} = await db.from('teams').upsert(
            richRows.map((t) => ({
                provider_id: t.id,
                name: t.name,
                short_code: t.code ?? null,
                country: t.country ?? null,
                logo_url: t.logo ?? null,
                venue_name: t.venueName ?? null,
                founded: t.founded ?? null,
                slug: slugify(t.name, t.id),
            })),
            {onConflict: 'provider_id'},
        );
        if (error) fail('teams.upsert', error);
    }
    for (let i = 0; i < minimalRows.length; i += 500) {
        const {error} = await db.from('teams').upsert(
            minimalRows.slice(i, i + 500).map((t) => ({provider_id: t.id, name: t.name, logo_url: t.logo ?? null, slug: slugify(t.name, t.id)})),
            {onConflict: 'provider_id', ignoreDuplicates: true},
        );
        if (error) fail('teams.upsert', error);
    }
    return idMap(db, 'teams', ids);
}

export interface MinimalPlayer {
    id: number;
    name: string | null;
    photo?: string | null;
    age?: number | null;
    position?: string | null;
}

/**
 * Upsert players by id. Minimal rows (from events, lineups, match stats)
 * only create missing players so richer squad data is never overwritten.
 */
export async function ensurePlayers(db: FootballClient, players: MinimalPlayer[]): Promise<IdMap> {
    const unique = new Map<number, MinimalPlayer>();
    for (const p of players) if (p.id) unique.set(p.id, {...unique.get(p.id), ...p});
    if (unique.size === 0) return new Map();

    const ids = [...unique.keys()];
    const existing = await idMap(db, 'players', ids);
    const missing = ids.filter((id) => !existing.has(id));
    if (missing.length > 0) {
        const rows = missing.map((id) => {
            const p = unique.get(id)!;
            const name = p.name && p.name.trim() !== '' ? p.name : `Giocatore ${id}`;
            return {
                provider_id: id,
                name,
                image_url: p.photo ?? null,
                age: p.age ?? null,
                position: p.position ?? null,
                slug: slugify(name, id),
            };
        });
        const {error} = await db.from('players').upsert(rows, {onConflict: 'provider_id', ignoreDuplicates: true});
        if (error) fail('players.upsert', error);
    }
    return idMap(db, 'players', ids);
}

export function chunk<T>(items: T[], size: number): T[][] {
    const out: T[][] = [];
    for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
    return out;
}

export {fail as failSync};
