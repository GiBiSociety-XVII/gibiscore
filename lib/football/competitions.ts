/**
 * Competitions GiBiScore follows, keyed by API-Football league id.
 *
 * Ids from the API-Football league list: Serie A 135, Serie B 136,
 * Coppa Italia 137, UEFA Champions League 2, UEFA Europa League 3,
 * UEFA Conference League 848. The `sync-competitions` job logs the league
 * name the API returns for each id: check that output once and fix any id
 * here if a name does not match.
 *
 * Override: set `API_FOOTBALL_LEAGUE_IDS=135,39` (comma separated) to follow
 * a different list without a code change, e.g. to keep request usage inside
 * the free plan while testing. Names and slugs then come from the API.
 */
export interface CompetitionConfig {
    providerId: number;
    /** URL slug; when omitted it is derived from the API name at sync time. */
    slug?: string;
    /** Display name used until the API name is stored. */
    name?: string;
    /** Lower comes first in lists and in the home page. */
    priority: number;
}

export const DEFAULT_COMPETITIONS: readonly CompetitionConfig[] = [
    {providerId: 135, slug: 'serie-a', name: 'Serie A', priority: 10},
    {providerId: 136, slug: 'serie-b', name: 'Serie B', priority: 20},
    {providerId: 137, slug: 'coppa-italia', name: 'Coppa Italia', priority: 30},
    {providerId: 2, slug: 'champions-league', name: 'UEFA Champions League', priority: 40},
    {providerId: 3, slug: 'europa-league', name: 'UEFA Europa League', priority: 50},
    {providerId: 848, slug: 'conference-league', name: 'UEFA Conference League', priority: 60},
];

function parseOverride(value: string | undefined): CompetitionConfig[] | null {
    if (!value) return null;
    const ids = value
        .split(',')
        .map((s) => Number(s.trim()))
        .filter((n) => Number.isInteger(n) && n > 0);
    if (ids.length === 0) return null;
    return ids.map((providerId, index) => {
        const known = DEFAULT_COMPETITIONS.find((c) => c.providerId === providerId);
        return {providerId, slug: known?.slug, name: known?.name, priority: (index + 1) * 10};
    });
}

/** Competitions to sync: the env override when present, the default list otherwise. */
export function getCompetitions(): readonly CompetitionConfig[] {
    return parseOverride(process.env.API_FOOTBALL_LEAGUE_IDS) ?? DEFAULT_COMPETITIONS;
}

export function isOverrideActive(): boolean {
    return parseOverride(process.env.API_FOOTBALL_LEAGUE_IDS) !== null;
}

/** Dash separated ids for the `live` parameter of /fixtures. */
export function liveFilter(): string {
    return getCompetitions()
        .map((c) => c.providerId)
        .join('-');
}

/** Used by the home page to order competitions. */
export const COMPETITIONS = DEFAULT_COMPETITIONS;
