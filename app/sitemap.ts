import type {MetadataRoute} from 'next';
import {createPublicClient} from '@/lib/db/server';
import {fetchAll} from '@/lib/db/paginate';
import {routing} from '@/i18n/routing';

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://gibiscore.com';

// Static pages and every competition. Not the clubs: their pages are closed to the crawlers
// (app/robots.ts), and a closed page in a sitemap is only an invitation. Rebuilt hourly.
export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
    const now = new Date();
    const entries: MetadataRoute.Sitemap = [
        {url: `${siteUrl}/`, lastModified: now, changeFrequency: 'always', priority: 1},
        {url: `${siteUrl}/live`, lastModified: now, changeFrequency: 'always', priority: 0.9},
        {url: `${siteUrl}/competitions`, lastModified: now, changeFrequency: 'daily', priority: 0.8},
        {url: `${siteUrl}/stats`, lastModified: now, changeFrequency: 'daily', priority: 0.7},
        {url: `${siteUrl}/predictions`, lastModified: now, changeFrequency: 'hourly', priority: 0.7},
        {url: `${siteUrl}/injuries`, lastModified: now, changeFrequency: 'daily', priority: 0.6},
        {url: `${siteUrl}/compare`, lastModified: now, changeFrequency: 'weekly', priority: 0.5},
        {url: `${siteUrl}/fantacalcio`, lastModified: now, changeFrequency: 'weekly', priority: 0.6},
        {url: `${siteUrl}/fantacalcio/asta`, lastModified: now, changeFrequency: 'daily', priority: 0.6},
    ];
    try {
        const db = createPublicClient();
        const leagues = await fetchAll((a, b) => db.from('leagues').select('slug,tier,updated_at').eq('is_active', true).order('id').range(a, b), {max: 5000});
        for (const l of leagues as Array<{slug: string; tier: string; updated_at: string}>) {
            entries.push({url: `${siteUrl}/competitions/${l.slug}`, lastModified: new Date(l.updated_at), changeFrequency: 'hourly', priority: l.tier === 'featured' ? 0.8 : 0.5});
        }
    } catch (error) {
        console.error('[sitemap]', (error as Error).message);
    }
    // Every page in every language: the default one at the plain address, the others under their prefix.
    return entries.map((e) => {
        // The home page's url ends with the slash: its alternates must not, or they redirect.
        const path = e.url.slice(siteUrl.length).replace(/\/$/, '');
        const languages: Record<string, string> = {};
        for (const locale of routing.locales) languages[locale] = locale === routing.defaultLocale ? e.url : `${siteUrl}/${locale}${path}`;
        languages['x-default'] = e.url;
        return {...e, alternates: {languages}};
    });
}
