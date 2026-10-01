import createMiddleware from 'next-intl/middleware';
import {createServerClient} from '@supabase/ssr';
import {NextResponse, type NextRequest} from 'next/server';
import {routing} from './i18n/routing';

const intl = createMiddleware(routing);

/**
 * The pages the crawlers are not served: the matches, the players and
 * the clubs.
 *
 * There are 185.000 of the first, 200.000 of the second and 15.000 of
 * the third, almost all of minor leagues, and the crawlers walk every
 * one — hundreds of thousands of renders a day, each a function
 * invocation, a dozen database reads and a page sent out, for a site
 * with a few dozen human visitors. robots.txt asks them not to
 * (app/robots.ts) and the pages say noindex, but a crawler must fetch a
 * page to read either, and the well-behaved ones take weeks to slow
 * down while the others never do. Here, at the edge, a crawler asking
 * for one of these pages gets a 404 and no function runs. (The clubs
 * were left open at first: four thousand club pages an hour were being
 * rendered for crawlers the day after.)
 *
 * Crawlers that call themselves a browser are not caught by a name:
 * for them there is the proof cookie below, set by a script, which an
 * HTTP client never runs.
 *
 * Link previews (a match shared on WhatsApp or Telegram) fetch once per
 * share and are let through; so is everything that is not a crawler.
 */
const LONG_TAIL = /^\/(?:[a-z]{2}\/)?(?:matches|players|teams)\//;
const CRAWLER = /bot|crawl|spider|slurp|scrapy|python-requests|python-urllib|curl\/|wget\/|go-http-client|java\/|libwww|httpclient|okhttp|node-fetch|axios\/|undici|semrush|ahrefs|mj12|petalbot|bytespider|gptbot|ccbot|claudebot|anthropic-ai|amazonbot|applebot|yandex|baidu|duckduck|perplexity|dataforseo|blexbot|seekport|serpstat|imagesift|barkrowler|zoominfo|awario|megaindex|meta-external/i;
const PREVIEW = /facebookexternalhit|whatsapp|telegrambot|twitterbot|linkedinbot|slackbot|discordbot|skypeuripreview|embedly/i;

/**
 * Proof that the request comes from something that runs JavaScript: a
 * cookie only the page below sets. Crawlers that call themselves a
 * browser are not caught by a name, and after the names were turned
 * away they still rendered thousands of these pages an hour. A browser
 * landing on one of them without the cookie gets a page of five hundred
 * bytes from the edge that sets the cookie and loads the page again —
 * a blink, once a month; an HTTP client that does not run scripts gets
 * the same five hundred bytes forever, and no function ever runs.
 * Someone signed in has the session cookie, which is the same proof.
 */
const PROOF_COOKIE = 'gs_h';
const PROOF_DAYS = 30;

function hasProof(request: NextRequest): boolean {
    return request.cookies.getAll().some((c) => c.name === PROOF_COOKIE || c.name.startsWith('sb-'));
}

function challenge(request: NextRequest): NextResponse {
    const secure = request.nextUrl.protocol === 'https:' ? '; Secure' : '';
    const html =
        `<!doctype html><html lang="it"><head><meta charset="utf-8"><meta name="robots" content="noindex"><meta name="viewport" content="width=device-width"><title>GiBiScore</title></head>` +
        `<body style="font-family:system-ui,sans-serif;padding:2rem"><p id="m">Un attimo… / One moment…</p>` +
        `<script>document.cookie="${PROOF_COOKIE}=1; Path=/; Max-Age=${PROOF_DAYS * 86400}; SameSite=Lax${secure}";` +
        `if(document.cookie.indexOf("${PROOF_COOKIE}=")>=0){location.replace(location.href)}else{document.getElementById("m").textContent="Per aprire questa pagina servono i cookie. / This page needs cookies."}</script>` +
        `<noscript>Per aprire questa pagina serve JavaScript. / This page needs JavaScript.</noscript></body></html>`;
    return new NextResponse(html, {status: 200, headers: {'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow'}});
}

/** What a request for one of the long-tail pages gets instead of the page, when it gets anything else: null when it may go on. */
function gate(request: NextRequest): NextResponse | null {
    if (!LONG_TAIL.test(request.nextUrl.pathname)) return null;
    const agent = request.headers.get('user-agent') ?? '';
    if (PREVIEW.test(agent)) return null;
    if (CRAWLER.test(agent)) return new NextResponse(null, {status: 404, headers: {'X-Robots-Tag': 'noindex, nofollow', 'Cache-Control': 'public, max-age=86400'}});
    if (!hasProof(request)) return challenge(request);
    return null;
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
    const turnedAway = gate(request);
    if (turnedAway) return turnedAway;
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
