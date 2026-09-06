import 'server-only';
import type {AfEnvelope} from './types';
import {BATCH_PER_MINUTE, PLAN, quotaIsFresh} from './plan';
import {MINUTE_WINDOW_MS, RateGate} from './rate-gate';

/**
 * Minimal wrapper around API-Football v3 (api-sports.io, direct access).
 *
 * Rules (see docs/PLANNING.md, section 3):
 * - only ever called from the server (cron routes, sync workers);
 * - the key comes from the environment and is never sent to the browser;
 * - pages read from our own database, never from this client directly;
 * - the plan's limits (300 a minute, 7,500 a day) are enforced here, once,
 *   not by each job: every request goes through the minute gate, and every
 *   response updates the day's count that the jobs read before starting.
 *
 * API-Football answers HTTP 200 even on logical errors (bad key, quota
 * reached, wrong parameter): the `errors` field carries them. We turn those
 * into ApiFootballError so jobs never mistake them for empty results.
 */

const BASE_URL = 'https://v3.football.api-sports.io';

export type ApiFootballErrorKind = 'http' | 'api' | 'quota' | 'rate_minute' | 'auth' | 'invalid_json';

export class ApiFootballError extends Error {
    constructor(
        message: string,
        public readonly status: number,
        public readonly path: string,
        public readonly kind: ApiFootballErrorKind = 'http',
        public readonly details?: unknown,
    ) {
        super(message);
        this.name = 'ApiFootballError';
    }
}

export interface RateLimitInfo {
    /** Daily quota of the plan and what is left of it. */
    dayLimit: number | null;
    dayRemaining: number | null;
    /** Per-minute burst limit. */
    minuteLimit: number | null;
    minuteRemaining: number | null;
    /** When these headers were read (ms since epoch); null before the first request. */
    readAt: number | null;
}

/** Last rate-limit headers seen in this process; the jobs persist them in sync_state for the others. */
export let lastRateLimit: RateLimitInfo = {dayLimit: PLAN.perDay, dayRemaining: null, minuteLimit: PLAN.perMinute, minuteRemaining: null, readAt: null};

/** Seed the day's count from a reading another process stored (see sync_state). */
export function seedRateLimit(info: Partial<RateLimitInfo>): void {
    lastRateLimit = {...lastRateLimit, ...info};
}

/** Requests started by this process, for the job summaries. */
export let requestCount = 0;

/** One gate per process: the batch lane waits for its slot, the live lane takes one and goes. */
const gate = new RateGate({limit: BATCH_PER_MINUTE});

/**
 * Requests left today: from the last headers seen (this process, or seeded
 * from the store) when recent and of this UTC day, else one call to the
 * /status endpoint. Null when the provider does not say.
 */
export async function dailyRemaining(): Promise<number | null> {
    if (lastRateLimit.dayRemaining === null || lastRateLimit.readAt === null || !quotaIsFresh(lastRateLimit.readAt, Date.now())) {
        try {
            await apiFootballGet('status');
        } catch (error) {
            // A day already spent answers even /status with the quota error: nothing is left.
            if (error instanceof ApiFootballError && error.kind === 'quota') return 0;
            return null;
        }
    }
    return lastRateLimit.dayRemaining;
}

function apiKey(): string {
    const value = process.env.API_FOOTBALL_KEY;
    if (!value) {
        throw new Error('API_FOOTBALL_KEY is not set');
    }
    return value;
}

export type Params = Record<string, string | number | boolean | undefined>;

function errorList(errors: AfEnvelope<unknown>['errors']): Array<[string, string]> {
    if (Array.isArray(errors)) return errors.map((e, i) => [String(i), String(e)]);
    if (errors && typeof errors === 'object') return Object.entries(errors).map(([k, v]) => [k, String(v)]);
    return [];
}

function readInt(headers: Headers, name: string): number | null {
    const raw = headers.get(name);
    if (raw === null) return null;
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
}

export interface GetOptions {
    /**
     * batch (default): wait for a slot in the minute, and when the provider
     * still answers "too many requests" wait a minute and retry, twice.
     * live: never wait, the next tick is a minute away anyway.
     */
    lane?: 'batch' | 'live';
}

export function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

/** GET one endpoint and return the full envelope (response + paging). */
export async function apiFootballGet<T>(path: string, params: Params = {}, options: GetOptions = {}): Promise<AfEnvelope<T>> {
    const live = options.lane === 'live';
    for (let attempt = 0; ; attempt += 1) {
        if (live) gate.take();
        else await gate.acquire();
        try {
            return await apiFootballGetOnce<T>(path, params);
        } catch (error) {
            if (error instanceof ApiFootballError && error.kind === 'rate_minute') {
                gate.backOff();
                if (!live && attempt < 2) {
                    await sleep(MINUTE_WINDOW_MS);
                    continue;
                }
            }
            throw error;
        }
    }
}

async function apiFootballGetOnce<T>(path: string, params: Params): Promise<AfEnvelope<T>> {
    const url = new URL(`${BASE_URL}/${path.replace(/^\//, '')}`);
    for (const [key, value] of Object.entries(params)) {
        if (value !== undefined) url.searchParams.set(key, String(value));
    }

    requestCount += 1;
    const response = await fetch(url, {
        headers: {'x-apisports-key': apiKey(), Accept: 'application/json'},
        cache: 'no-store',
    });

    lastRateLimit = {
        dayLimit: readInt(response.headers, 'x-ratelimit-requests-limit') ?? lastRateLimit.dayLimit,
        dayRemaining: readInt(response.headers, 'x-ratelimit-requests-remaining'),
        minuteLimit: readInt(response.headers, 'x-ratelimit-limit') ?? lastRateLimit.minuteLimit,
        minuteRemaining: readInt(response.headers, 'x-ratelimit-remaining'),
        readAt: Date.now(),
    };
    gate.observe(lastRateLimit.minuteRemaining);

    const body = await response.text().catch(() => '');
    if (!response.ok) {
        const kind: ApiFootballErrorKind = response.status === 429 ? 'rate_minute' : 'http';
        throw new ApiFootballError(`API-Football ${response.status} on ${path}: ${body.slice(0, 300)}`, response.status, path, kind);
    }

    let json: AfEnvelope<T>;
    try {
        json = JSON.parse(body) as AfEnvelope<T>;
    } catch {
        throw new ApiFootballError(`API-Football returned non-JSON for ${path}: ${body.slice(0, 200)}`, response.status, path, 'invalid_json');
    }

    const errors = errorList(json.errors);
    if (errors.length > 0) {
        const text = errors.map(([k, v]) => `${k}: ${v}`).join('; ');
        const lower = text.toLowerCase();
        const kind: ApiFootballErrorKind = lower.includes('token') || lower.includes('key')
            ? 'auth'
            : lower.includes('per minute')
              ? 'rate_minute'
              : lower.includes('request limit') || lower.includes('rate limit') || lower.includes('reached')
                ? 'quota'
                : 'api';
        if (kind === 'quota') lastRateLimit = {...lastRateLimit, dayRemaining: 0, readAt: Date.now()};
        throw new ApiFootballError(`API-Football error on ${path} (${text})`, response.status, path, kind, json.errors);
    }

    if (!Array.isArray(json.response) && json.response === undefined) {
        throw new ApiFootballError(`API-Football returned no response field for ${path}`, response.status, path, 'invalid_json');
    }

    return json;
}

/** Iterate every page of a paginated endpoint (players, injuries ...). */
export async function* apiFootballPages<T>(path: string, params: Params = {}): AsyncGenerator<T[]> {
    let page = 1;
    for (;;) {
        const envelope = await apiFootballGet<T[]>(path, {...params, page});
        yield envelope.response;
        if (!envelope.paging || envelope.paging.current >= envelope.paging.total) return;
        page += 1;
    }
}
