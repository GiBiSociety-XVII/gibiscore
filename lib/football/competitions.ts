/**
 * Competition tiers.
 *
 * GiBiScore follows EVERY competition API-Football publishes (~1,100
 * leagues and cups). To stay inside the plan's daily request budget the
 * leagues are split in two tiers:
 *
 * - featured: full detail. Teams and squads, lineups, team and player
 *   statistics during and after matches, injuries, standings every 30
 *   minutes. Listed first everywhere on the site.
 * - basic: fixtures, scores and events from the day lists and the live
 *   feed, standings once a day. Teams are created from the fixtures.
 *
 * Featured ids can be overridden with API_FOOTBALL_FEATURED_LEAGUE_IDS
 * (comma separated). API-Football ids: Serie A 135, Serie B 136, Coppa
 * Italia 137, Supercoppa 547, Champions League 2, Europa League 3,
 * Conference League 848, Premier League 39, La Liga 140, Bundesliga 78,
 * Ligue 1 61, Eredivisie 88, Primeira Liga 94.
 */
export interface CompetitionConfig {
    providerId: number;
    /** URL slug; when omitted it is derived from the API name at sync time. */
    slug?: string;
    name?: string;
    /** Lower comes first in lists and in the home page. */
    priority: number;
}

export const FEATURED_COMPETITIONS: readonly CompetitionConfig[] = [
    {providerId: 135, slug: 'serie-a', name: 'Serie A', priority: 10},
    {providerId: 136, slug: 'serie-b', name: 'Serie B', priority: 20},
    {providerId: 137, slug: 'coppa-italia', name: 'Coppa Italia', priority: 30},
    {providerId: 547, slug: 'supercoppa-italiana', name: 'Supercoppa Italiana', priority: 35},
    {providerId: 2, slug: 'champions-league', name: 'UEFA Champions League', priority: 40},
    {providerId: 3, slug: 'europa-league', name: 'UEFA Europa League', priority: 50},
    {providerId: 848, slug: 'conference-league', name: 'UEFA Conference League', priority: 60},
    {providerId: 39, slug: 'premier-league', name: 'Premier League', priority: 70},
    {providerId: 140, slug: 'la-liga', name: 'La Liga', priority: 80},
    {providerId: 78, slug: 'bundesliga', name: 'Bundesliga', priority: 90},
    {providerId: 61, slug: 'ligue-1', name: 'Ligue 1', priority: 100},
    {providerId: 88, slug: 'eredivisie', name: 'Eredivisie', priority: 110},
    {providerId: 94, slug: 'primeira-liga', name: 'Primeira Liga', priority: 120},
];

function parseIds(value: string | undefined): number[] | null {
    if (!value) return null;
    const ids = value
        .split(',')
        .map((s) => Number(s.trim()))
        .filter((n) => Number.isInteger(n) && n > 0);
    return ids.length > 0 ? ids : null;
}

/** Featured competitions: the env override when present, the default list otherwise. */
export function getFeaturedCompetitions(): readonly CompetitionConfig[] {
    const override = parseIds(process.env.API_FOOTBALL_FEATURED_LEAGUE_IDS);
    if (!override) return FEATURED_COMPETITIONS;
    return override.map((providerId, index) => {
        const known = FEATURED_COMPETITIONS.find((c) => c.providerId === providerId);
        return {providerId, slug: known?.slug, name: known?.name, priority: known?.priority ?? 1000 + index * 10};
    });
}

export function isFeaturedProviderId(providerId: number): boolean {
    return getFeaturedCompetitions().some((c) => c.providerId === providerId);
}

/** Priority by slug, used to order featured competitions on the site. */
export function featuredPriority(slug: string | null | undefined): number {
    if (!slug) return 9999;
    return FEATURED_COMPETITIONS.find((c) => c.slug === slug)?.priority ?? 9999;
}

/**
 * Scope of the basic tier: 'all' (default) syncs every competition
 * API-Football publishes; 'featured' limits the site to the featured list,
 * which is what a Free plan can afford.
 */
export function basicScope(): 'all' | 'featured' {
    return process.env.API_FOOTBALL_SCOPE === 'featured' ? 'featured' : 'all';
}

/** Kept for the home page ordering. */
export const COMPETITIONS = FEATURED_COMPETITIONS;
