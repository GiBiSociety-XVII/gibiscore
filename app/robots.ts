import type {MetadataRoute} from 'next';
import {routing} from '@/i18n/routing';

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://gibiscore.com';

/**
 * Crawlers that bring no visitor and walk every match and team page of
 * every country (a render each, a handful of database reads per render):
 * SEO tools, AI training scrapers, and the like. They honour robots.txt;
 * search engines proper stay welcome — on the pages worth searching.
 *
 * The match and player pages are closed to every crawler: 400.000 pages
 * of which nobody searches more than a handful, and walking them was
 * most of what the site's functions did (see proxy.ts, where a crawler
 * that does not honour this is turned away at the edge). Competitions,
 * clubs, rankings and predictions stay open.
 */
const BLOCKED_BOTS = ['AhrefsBot', 'SemrushBot', 'MJ12bot', 'DotBot', 'PetalBot', 'Bytespider', 'DataForSeoBot', 'BLEXBot', 'SeekportBot', 'serpstatbot', 'GPTBot', 'CCBot', 'ClaudeBot', 'Amazonbot', 'meta-externalagent', 'ImagesiftBot', 'Barkrowler', 'ZoominfoBot', 'AwarioBot', 'MegaIndex'];

/** What no crawler is served, in every language the site speaks. */
const CLOSED = ['/api/', '/search', '/admin', ...routing.locales.flatMap((locale) => (locale === routing.defaultLocale ? ['/matches/', '/players/'] : [`/${locale}/matches/`, `/${locale}/players/`]))];

export default function robots(): MetadataRoute.Robots {
    return {
        rules: [
            {userAgent: BLOCKED_BOTS, disallow: '/'},
            // Bing honours the delay; Google ignores it and paces itself on the server's response time.
            {userAgent: 'bingbot', allow: '/', disallow: CLOSED, crawlDelay: 5},
            {userAgent: '*', allow: '/', disallow: CLOSED},
        ],
        sitemap: `${siteUrl}/sitemap.xml`,
    };
}
