import 'server-only';

/**
 * Minimal typed wrapper around the Sportmonks Football API v3.
 *
 * Rules (see docs/PLANNING.md, section 3):
 * - only ever called from the server (cron routes, sync workers);
 * - the token comes from the environment and is never sent to the browser;
 * - pages read from our own database, never from this client directly.
 */

const BASE_URL = 'https://api.sportmonks.com/v3/football';

export interface SportmonksPagination {
    count: number;
    per_page: number;
    current_page: number;
    next_page: string | null;
    has_more: boolean;
}

export interface SportmonksSubscription {
    meta?: {trial_ends_at?: string | null; ends_at?: string | null; current_timestamp?: number};
    plans?: Array<{plan: string; sport: string; category: string}>;
    add_ons?: Array<{add_on: string; sport: string; category: string}>;
    widgets?: unknown[];
}

export interface SportmonksResponse<T> {
    data: T;
    pagination?: SportmonksPagination;
    subscription?: SportmonksSubscription[] | SportmonksSubscription;
    rate_limit?: {resets_in_seconds: number; remaining: number; requested_entity: string};
    timezone?: string;
}

export type SportmonksErrorKind = 'http' | 'no_access' | 'invalid_json';

export class SportmonksError extends Error {
    constructor(
        message: string,
        public readonly status: number,
        public readonly path: string,
        public readonly kind: SportmonksErrorKind = 'http',
    ) {
        super(message);
        this.name = 'SportmonksError';
    }

    /** True when the token exists but the subscription does not cover the request. */
    get isNoAccess(): boolean {
        return this.kind === 'no_access';
    }
}

function token(): string {
    const value = process.env.SPORTMONKS_API_TOKEN;
    if (!value) {
        throw new Error('SPORTMONKS_API_TOKEN is not set');
    }
    return value;
}

export interface RequestOptions {
    /** Comma-separated includes, e.g. "participants;scores;events". */
    include?: string;
    /** Extra query parameters (filters, per_page, page...). */
    params?: Record<string, string | number | undefined>;
    /** Next.js fetch cache control; sync jobs should pass {cache: 'no-store'}. */
    cache?: RequestCache;
}

/** GET one Sportmonks endpoint and return the parsed JSON envelope. */
export async function sportmonksGet<T>(
    path: string,
    {include, params = {}, cache = 'no-store'}: RequestOptions = {},
): Promise<SportmonksResponse<T>> {
    const url = new URL(`${BASE_URL}/${path.replace(/^\//, '')}`);
    if (include) url.searchParams.set('include', include);
    for (const [key, value] of Object.entries(params)) {
        if (value !== undefined) url.searchParams.set(key, String(value));
    }

    const response = await fetch(url, {
        headers: {Authorization: token(), Accept: 'application/json'},
        cache,
    });

    const body = await response.text().catch(() => '');
    if (!response.ok) {
        throw new SportmonksError(
            `Sportmonks ${response.status} on ${path}: ${body.slice(0, 300)}`,
            response.status,
            path,
        );
    }

    let json: unknown;
    try {
        json = JSON.parse(body);
    } catch {
        throw new SportmonksError(`Sportmonks returned non-JSON for ${path}: ${body.slice(0, 200)}`, response.status, path, 'invalid_json');
    }

    // Sportmonks answers 200 with only a `message` when the token has no
    // access to the requested league/include ("No result(s) found matching
    // your request ... via your current subscription"). Surface that as a
    // distinct error kind so jobs can skip the item instead of aborting.
    if (!json || typeof json !== 'object' || !('data' in json)) {
        const message = (json as {message?: string} | null)?.message ?? JSON.stringify(json).slice(0, 300);
        throw new SportmonksError(`Sportmonks returned no data for ${path}: ${message}`, response.status, path, 'no_access');
    }

    return json as SportmonksResponse<T>;
}

export interface SportmonksAccess {
    subscription: SportmonksSubscription | null;
    /** Leagues the token can read, as returned by GET /leagues. */
    leagues: Array<{id: number; name: string; country_id: number | null; short_code: string | null}>;
}

/**
 * What the current token is allowed to read. GET /leagues only lists the
 * leagues inside the subscription, and every envelope carries the
 * subscription metadata (plan, add-ons, trial end).
 */
export async function sportmonksAccess(): Promise<SportmonksAccess> {
    const leagues: SportmonksAccess['leagues'] = [];
    let subscription: SportmonksSubscription | null = null;
    let page = 1;
    for (;;) {
        const envelope = await sportmonksGet<Array<{id: number; name: string; country_id?: number | null; short_code?: string | null}>>('leagues', {
            params: {page, per_page: 50},
        });
        if (!subscription && envelope.subscription) {
            subscription = Array.isArray(envelope.subscription) ? envelope.subscription[0] ?? null : envelope.subscription;
        }
        for (const l of envelope.data) {
            leagues.push({id: l.id, name: l.name, country_id: l.country_id ?? null, short_code: l.short_code ?? null});
        }
        if (!envelope.pagination?.has_more || page >= 20) break;
        page += 1;
    }
    return {subscription, leagues};
}

/** Iterate every page of a paginated endpoint. */
export async function* sportmonksPages<T>(
    path: string,
    options: RequestOptions = {},
): AsyncGenerator<T[]> {
    let page = 1;
    for (;;) {
        const envelope = await sportmonksGet<T[]>(path, {
            ...options,
            params: {...options.params, page, per_page: options.params?.per_page ?? 50},
        });
        yield envelope.data;
        if (!envelope.pagination?.has_more) return;
        page += 1;
    }
}
