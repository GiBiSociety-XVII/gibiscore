/**
 * Competitions GiBiScore follows, keyed by Sportmonks league id.
 *
 * The ids come from the Sportmonks coverage pages (Serie A 384, Serie B 387,
 * Coppa Italia 390) and from their documentation examples (Champions League 2,
 * Europa League 5, Conference League 2286). The `sync-competitions` job logs
 * the league name the API returns for each id: check that output once and fix
 * any id here if a name does not match.
 *
 * Validation mode: set `SPORTMONKS_LEAGUE_IDS=271,501` (comma separated) to
 * follow other leagues instead, e.g. the ones included in the free plan while
 * the European Plan trial is not active yet. Names and slugs then come from
 * the API. Remove the variable (and redeploy) to go back to this list.
 */
export interface CompetitionConfig {
    sportmonksId: number;
    /** URL slug; when omitted it is derived from the API name at sync time. */
    slug?: string;
    /** Display name used until the API name is stored. */
    name?: string;
    /** Lower comes first in lists and in the home page. */
    priority: number;
}

export const DEFAULT_COMPETITIONS: readonly CompetitionConfig[] = [
    {sportmonksId: 384, slug: 'serie-a', name: 'Serie A', priority: 10},
    {sportmonksId: 387, slug: 'serie-b', name: 'Serie B', priority: 20},
    {sportmonksId: 390, slug: 'coppa-italia', name: 'Coppa Italia', priority: 30},
    {sportmonksId: 2, slug: 'champions-league', name: 'UEFA Champions League', priority: 40},
    {sportmonksId: 5, slug: 'europa-league', name: 'UEFA Europa League', priority: 50},
    {sportmonksId: 2286, slug: 'conference-league', name: 'UEFA Conference League', priority: 60},
];

function parseOverride(value: string | undefined): CompetitionConfig[] | null {
    if (!value) return null;
    const ids = value
        .split(',')
        .map((s) => Number(s.trim()))
        .filter((n) => Number.isInteger(n) && n > 0);
    if (ids.length === 0) return null;
    return ids.map((sportmonksId, index) => ({sportmonksId, priority: (index + 1) * 10}));
}

/** Competitions to sync: the env override when present, the default list otherwise. */
export function getCompetitions(): readonly CompetitionConfig[] {
    return parseOverride(process.env.SPORTMONKS_LEAGUE_IDS) ?? DEFAULT_COMPETITIONS;
}

export function isValidationMode(): boolean {
    return parseOverride(process.env.SPORTMONKS_LEAGUE_IDS) !== null;
}

/** Comma separated ids for Sportmonks `filters=fixtureLeagues:...`. */
export function competitionFilter(): string {
    return getCompetitions()
        .map((c) => c.sportmonksId)
        .join(',');
}

/** Backwards-compatible alias used by the home page ordering. */
export const COMPETITIONS = DEFAULT_COMPETITIONS;
