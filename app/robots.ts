import type {MetadataRoute} from 'next';

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://gibiscore.com';

/**
 * Crawlers that bring no visitor and walk every match and team page of
 * every country (a render each, a handful of database reads per render):
 * SEO tools, AI training scrapers, and the like. They honour robots.txt;
 * search engines proper stay welcome.
 */
const BLOCKED_BOTS = ['AhrefsBot', 'SemrushBot', 'MJ12bot', 'DotBot', 'PetalBot', 'Bytespider', 'DataForSeoBot', 'BLEXBot', 'SeekportBot', 'serpstatbot', 'GPTBot', 'CCBot', 'ClaudeBot', 'Amazonbot', 'meta-externalagent', 'ImagesiftBot', 'Barkrowler', 'ZoominfoBot', 'AwarioBot', 'MegaIndex'];

export default function robots(): MetadataRoute.Robots {
    return {
        rules: [
            {userAgent: BLOCKED_BOTS, disallow: '/'},
            // Bing honours the delay; Google ignores it and paces itself on the server's response time.
            {userAgent: 'bingbot', allow: '/', disallow: ['/api/', '/search'], crawlDelay: 5},
            {userAgent: '*', allow: '/', disallow: ['/api/', '/search']},
        ],
        sitemap: `${siteUrl}/sitemap.xml`,
    };
}
