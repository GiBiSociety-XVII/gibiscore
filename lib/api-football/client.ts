import 'server-only';
import type {AfEnvelope} from './types';

/**
 * Minimal wrapper around API-Football v3 (api-sports.io, direct access).
 *
 * Rules (see docs/PLANNING.md, section 3):
 * - only ever called from the server (cron routes, sync workers);
 * - the key comes from the environment and is never sent to the browser;
 * - pages read from our own database, never from this client directly.
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
}

/** Last rate-limit headers seen; handy for the status route and job logs. */
export let lastRateLimit: RateLimitInfo = {dayLimit: null, dayRemaining: null, minuteLimit: null, minuteRemaining: null};

/**
 * Requests left today, from the last answer's headers or, when nothing
 * has been asked yet in this process, from the free /status endpoint.
 * Null when the provider does not say.
 */
export async function dailyRemaining(): Promise<number | null> {
    if (lastRateLimit.dayRemaining === null) {
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

export {quotaAllows} from './quota';

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
     * When the per-minute limit of the plan is hit, wait for the window to
     * reset and retry (at most twice). Only for batch jobs that can afford a
     * minute of waiting, never for the live job.
     */
    retryOnMinuteLimit?: boolean;
}

const MINUTE_WINDOW_MS = 61_000;

export function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Wait when the plan's per-minute allowance is about to run out, as told by
 * the headers of the previous response. Cheap insurance for batch jobs.
 */
export async function waitForMinuteWindow(): Promise<void> {
    if (lastRateLimit.minuteRemaining !== null && lastRateLimit.minuteRemaining <= 1) {
        await sleep(MINUTE_WINDOW_MS);
        lastRateLimit = {...lastRateLimit, minuteRemaining: null};
    }
}

/** GET one endpoint and return the full envelope (response + paging). */
export async function apiFootballGet<T>(path: string, params: Params = {}, options: GetOptions = {}): Promise<AfEnvelope<T>> {
    for (let attempt = 0; ; attempt += 1) {
        try {
            return await apiFootballGetOnce<T>(path, params);
        } catch (error) {
            if (options.retryOnMinuteLimit && error instanceof ApiFootballError && error.kind === 'rate_minute' && attempt < 2) {
                await sleep(MINUTE_WINDOW_MS);
                continue;
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

    const response = await fetch(url, {
        headers: {'x-apisports-key': apiKey(), Accept: 'application/json'},
        cache: 'no-store',
    });

    lastRateLimit = {
        dayLimit: readInt(response.headers, 'x-ratelimit-requests-limit'),
        dayRemaining: readInt(response.headers, 'x-ratelimit-requests-remaining'),
        minuteLimit: readInt(response.headers, 'x-ratelimit-limit'),
        minuteRemaining: readInt(response.headers, 'x-ratelimit-remaining'),
    };

    const body = await response.text().catch(() => '');
    if (!response.ok) {
        throw new ApiFootballError(`API-Football ${response.status} on ${path}: ${body.slice(0, 300)}`, response.status, path);
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
