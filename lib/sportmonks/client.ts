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

export interface SportmonksResponse<T> {
    data: T;
    pagination?: SportmonksPagination;
    rate_limit?: {resets_in_seconds: number; remaining: number; requested_entity: string};
}

export class SportmonksError extends Error {
    constructor(
        message: string,
        public readonly status: number,
        public readonly path: string,
    ) {
        super(message);
        this.name = 'SportmonksError';
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
        throw new SportmonksError(`Sportmonks returned non-JSON for ${path}: ${body.slice(0, 200)}`, response.status, path);
    }

    // Sportmonks answers 200 with only a `message` when the token has no
    // access to the requested league/include. Surface that instead of
    // letting callers trip over a missing `data`.
    if (!json || typeof json !== 'object' || !('data' in json)) {
        const message = (json as {message?: string} | null)?.message ?? JSON.stringify(json).slice(0, 300);
        throw new SportmonksError(`Sportmonks returned no data for ${path}: ${message}`, response.status, path);
    }

    return json as SportmonksResponse<T>;
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
