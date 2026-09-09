import createMiddleware from 'next-intl/middleware';
import {createServerClient} from '@supabase/ssr';
import type {NextRequest} from 'next/server';
import {routing} from './i18n/routing';

const intl = createMiddleware(routing);

/**
 * Locale negotiation (with a single locale it only normalises URLs) plus
 * the Supabase session refresh: an expired access token is renewed here,
 * on every page, and the refreshed cookies travel with the response, so
 * server components and the browser client agree on who is signed in.
 */
export default async function proxy(request: NextRequest) {
    const response = intl(request);
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    if (!url || !key) return response;
    const supabase = createServerClient(url, key, {
        cookies: {
            getAll() {
                return request.cookies.getAll();
            },
            setAll(cookiesToSet) {
                for (const {name, value, options} of cookiesToSet) response.cookies.set(name, value, options);
            },
        },
    });
    // Nothing to do with the result: the call refreshes the token when needed.
    await supabase.auth.getUser();
    return response;
}

export const config = {
    // Match all pathnames except for
    // - … if they start with `/api`, `/_next` or `/_vercel`
    // - … the ones containing a dot (e.g. `favicon.ico`)
    matcher: '/((?!api|_next|_vercel|.*\\..*).*)'
};
