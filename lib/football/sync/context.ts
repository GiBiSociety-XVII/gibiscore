import 'server-only';
import type {SupabaseClient} from '@supabase/supabase-js';
import {createServiceClient} from '@/lib/db/server';
import {slugify} from '@/lib/sportmonks/mappers';
import type {SmPlayer, SmTeam} from '@/lib/sportmonks/types';

/**
 * Shared plumbing for sync jobs: a service-role client bound to the
 * `football` schema, id maps between Sportmonks ids and our ids, and a
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

export type IdMap = Map<number, number>; // sportmonks_id -> our id

async function selectIdMap(db: FootballClient, table: string, sportmonksIds: number[]): Promise<IdMap> {
    const map: IdMap = new Map();
    for (let i = 0; i < sportmonksIds.length; i += 500) {
        const chunk = sportmonksIds.slice(i, i + 500);
        const {data, error} = await db.from(table).select('id,sportmonks_id').in('sportmonks_id', chunk);
        if (error) fail(`${table}.select`, error);
        for (const row of data ?? []) map.set(row.sportmonks_id as number, row.id as number);
    }
    return map;
}

export async function leagueIdMap(db: FootballClient, sportmonksIds: number[]): Promise<IdMap> {
    return selectIdMap(db, 'leagues', sportmonksIds);
}

export async function seasonIdMap(db: FootballClient, sportmonksIds: number[]): Promise<IdMap> {
    return selectIdMap(db, 'seasons', sportmonksIds);
}

/** Upsert teams from any payload that carries them and return the id map. */
export async function ensureTeams(db: FootballClient, teams: SmTeam[]): Promise<IdMap> {
    const unique = new Map<number, SmTeam>();
    for (const team of teams) unique.set(team.id, team);
    if (unique.size === 0) return new Map();

    const rows = [...unique.values()].map((team) => ({
        sportmonks_id: team.id,
        name: team.name,
        short_code: team.short_code ?? null,
        logo_url: team.image_path ?? null,
        venue_name: team.venue?.name ?? null,
        founded: team.founded ?? null,
        slug: slugify(team.name, team.id),
    }));

    const {error} = await db.from('teams').upsert(rows, {onConflict: 'sportmonks_id'});
    if (error) fail('teams.upsert', error);
    return selectIdMap(db, 'teams', [...unique.keys()]);
}

export interface MinimalPlayer {
    id: number;
    name: string | null;
    player?: SmPlayer | null;
}

function playerName(p: MinimalPlayer): string {
    const full = p.player?.display_name ?? p.player?.common_name ?? p.player?.name ?? p.name;
    return full && full.trim() !== '' ? full : `Giocatore ${p.id}`;
}

/**
 * Upsert players by id. Rows that only carry an id and a name (from events
 * or lineups) never overwrite richer data already stored: we only send
 * columns we actually know.
 */
export async function ensurePlayers(db: FootballClient, players: MinimalPlayer[]): Promise<IdMap> {
    const unique = new Map<number, MinimalPlayer>();
    for (const p of players) if (p.id) unique.set(p.id, p);
    if (unique.size === 0) return new Map();

    const ids = [...unique.keys()];
    const existing = await selectIdMap(db, 'players', ids);
    const missing = ids.filter((id) => !existing.has(id));
    if (missing.length > 0) {
        const rows = missing.map((id) => {
            const p = unique.get(id)!;
            const name = playerName(p);
            return {
                sportmonks_id: id,
                name,
                display_name: p.player?.display_name ?? null,
                image_url: p.player?.image_path ?? null,
                date_of_birth: p.player?.date_of_birth ?? null,
                slug: slugify(name, id),
            };
        });
        const {error} = await db.from('players').upsert(rows, {onConflict: 'sportmonks_id', ignoreDuplicates: true});
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
