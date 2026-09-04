import type {MetadataRoute} from 'next';
import {createPublicClient} from '@/lib/db/server';

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://gibiscore.com';

// Static pages, every competition, the teams of the featured leagues. Rebuilt hourly.
export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
    const now = new Date();
    const entries: MetadataRoute.Sitemap = [
        {url: `${siteUrl}/`, lastModified: now, changeFrequency: 'always', priority: 1},
        {url: `${siteUrl}/live`, lastModified: now, changeFrequency: 'always', priority: 0.9},
        {url: `${siteUrl}/competitions`, lastModified: now, changeFrequency: 'daily', priority: 0.8},
    ];
    try {
        const db = createPublicClient().schema('football');
        const [leagues, teams] = await Promise.all([
            db.from('leagues').select('slug,tier,updated_at').eq('is_active', true).limit(3000),
            db.from('squad_members').select('team:teams!inner(slug,updated_at),season:seasons!inner(is_current,league:leagues!inner(tier))').eq('seasons.is_current', true).eq('seasons.leagues.tier', 'featured').limit(5000),
        ]);
        for (const l of (leagues.data ?? []) as Array<{slug: string; tier: string; updated_at: string}>) {
            entries.push({url: `${siteUrl}/competitions/${l.slug}`, lastModified: new Date(l.updated_at), changeFrequency: 'hourly', priority: l.tier === 'featured' ? 0.8 : 0.5});
        }
        const seen = new Set<string>();
        for (const row of (teams.data ?? []) as unknown as Array<{team: {slug: string; updated_at: string} | null}>) {
            const slug = row.team?.slug;
            if (!slug || seen.has(slug)) continue;
            seen.add(slug);
            entries.push({url: `${siteUrl}/teams/${slug}`, lastModified: new Date(row.team!.updated_at), changeFrequency: 'daily', priority: 0.6});
        }
    } catch (error) {
        console.error('[sitemap]', (error as Error).message);
    }
    return entries;
}
