import createMiddleware from 'next-intl/middleware';
import {createServerClient} from '@supabase/ssr';
import {NextResponse, type NextRequest} from 'next/server';
import {routing} from './i18n/routing';

const intl = createMiddleware(routing);

/**
 * The pages the crawlers are not served: the matches and the players.
 *
 * There are 185.000 of the one and 200.000 of the other, almost all of
 * minor leagues, and the crawlers walk every one — hundreds of
 * thousands of renders a day, each a function invocation, a dozen
 * database reads and a page sent out, for a site with a few dozen human
 * visitors. robots.txt asks them not to (app/robots.ts) and the pages
 * say noindex, but a crawler must fetch a page to read either, and the
 * well-behaved ones take weeks to slow down while the others never do.
 * Here, at the edge, a crawler asking for one of these pages gets a
 * 404 and no function runs.
 *
 * Link previews (a match shared on WhatsApp or Telegram) fetch once per
 * share and are let through; so is everything that is not a crawler.
 */
const LONG_TAIL = /^\/(?:[a-z]{2}\/)?(?:matches|players)\//;
const CRAWLER = /bot|crawl|spider|slurp|scrapy|python-requests|python-urllib|curl\/|wget\/|go-http-client|java\/|libwww|httpclient|okhttp|node-fetch|axios\/|undici|semrush|ahrefs|mj12|petalbot|bytespider|gptbot|ccbot|claudebot|anthropic-ai|amazonbot|applebot|yandex|baidu|duckduck|perplexity|dataforseo|blexbot|seekport|serpstat|imagesift|barkrowler|zoominfo|awario|megaindex|meta-external/i;
const PREVIEW = /facebookexternalhit|whatsapp|telegrambot|twitterbot|linkedinbot|slackbot|discordbot|skypeuripreview|embedly/i;

function crawlerOnLongTail(request: NextRequest): boolean {
    if (!LONG_TAIL.test(request.nextUrl.pathname)) return false;
    const agent = request.headers.get('user-agent') ?? '';
    return CRAWLER.test(agent) && !PREVIEW.test(agent);
}

/**
 * Locale negotiation (with a single locale it only normalises URLs) plus
 * the Supabase session refresh: an expired access token is renewed here,
 * on every page of someone signed in, and the refreshed cookies travel
 * with the response, so server components and the browser client agree
 * on who is signed in. A request without a session cookie — a crawler,
 * a first visit — has nothing to refresh and costs no call.
 */
export default async function proxy(request: NextRequest) {
    if (crawlerOnLongTail(request)) return new NextResponse(null, {status: 404, headers: {'X-Robots-Tag': 'noindex, nofollow', 'Cache-Control': 'public, max-age=86400'}});
    const response = intl(request);
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    if (!url || !key) return response;
    if (!request.cookies.getAll().some((c) => c.name.startsWith('sb-'))) return response;
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
