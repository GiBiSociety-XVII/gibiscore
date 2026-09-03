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

async function selectIdMap(db: FootballClient, table: string, providerIds: number[]): Promise<IdMap> {
    const map: IdMap = new Map();
    for (let i = 0; i < providerIds.length; i += 500) {
        const chunk = providerIds.slice(i, i + 500);
        const {data, error} = await db.from(table).select('id,provider_id').in('provider_id', chunk);
        if (error) fail(`${table}.select`, error);
        for (const row of data ?? []) map.set(row.provider_id as number, row.id as number);
    }
    return map;
}

export async function leagueIdMap(db: FootballClient, providerIds: number[]): Promise<IdMap> {
    return selectIdMap(db, 'leagues', providerIds);
}

export interface SeasonRef {
    id: number;
    leagueId: number;
    leagueProviderId: number;
    leagueSlug: string;
    year: number;
    name: string;
}

/** Every season flagged current, with its league. */
export async function currentSeasons(db: FootballClient): Promise<SeasonRef[]> {
    const {data, error} = await db
        .from('seasons')
        .select('id,year,name,league:leagues!inner(id,provider_id,slug)')
        .eq('is_current', true);
    if (error) fail('seasons.select', error);
    return (data ?? []).map((row) => {
        const league = row.league as unknown as {id: number; provider_id: number; slug: string};
        return {
            id: row.id as number,
            leagueId: league.id,
            leagueProviderId: league.provider_id,
            leagueSlug: league.slug,
            year: row.year as number,
            name: row.name as string,
        };
    });
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
    const existing = await selectIdMap(db, 'teams', ids);

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
    if (minimalRows.length > 0) {
        const {error} = await db.from('teams').upsert(
            minimalRows.map((t) => ({provider_id: t.id, name: t.name, logo_url: t.logo ?? null, slug: slugify(t.name, t.id)})),
            {onConflict: 'provider_id', ignoreDuplicates: true},
        );
        if (error) fail('teams.upsert', error);
    }
    return selectIdMap(db, 'teams', ids);
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
    const existing = await selectIdMap(db, 'players', ids);
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
    return selectIdMap(db, 'players', ids);
}

export function chunk<T>(items: T[], size: number): T[][] {
    const out: T[][] = [];
    for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
    return out;
}

export {fail as failSync};
