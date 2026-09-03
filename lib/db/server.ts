import 'server-only';
import {createServerClient} from '@supabase/ssr';
import {createClient as createSupabaseClient} from '@supabase/supabase-js';
import {cookies} from 'next/headers';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_PUBLISHABLE_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;

/** Per-request client bound to the visitor's session cookies (RLS applies). */
export async function createClient() {
    const cookieStore = await cookies();

    return createServerClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
        cookies: {
            getAll() {
                return cookieStore.getAll();
            },
            setAll(cookiesToSet) {
                try {
                    cookiesToSet.forEach(({name, value, options}) =>
                        cookieStore.set(name, value, options),
                    );
                } catch {
                    // Called from a Server Component: cookies cannot be set
                    // there. Safe to ignore because the proxy refreshes
                    // sessions.
                }
            },
        },
    });
}

/**
 * Anonymous client with no session. Use it for public, cacheable reads
 * (fixtures, standings): it never touches cookies, so pages that use it
 * can stay static and revalidate on a timer.
 */
export function createPublicClient() {
    return createSupabaseClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
        auth: {persistSession: false, autoRefreshToken: false},
    });
}

/**
 * Service-role client for cron jobs and sync workers. Bypasses RLS: never
 * import this from anything that runs in response to a user request.
 */
export function createServiceClient() {
    const serviceKey = process.env.SUPABASE_SECRET_KEY;
    if (!serviceKey) {
        throw new Error('SUPABASE_SECRET_KEY is not set');
    }
    return createSupabaseClient(SUPABASE_URL, serviceKey, {
        auth: {persistSession: false, autoRefreshToken: false},
        db: {schema: 'football'},
    });
}
