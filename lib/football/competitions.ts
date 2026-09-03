/**
 * Competitions GiBiScore follows, keyed by Sportmonks league id.
 *
 * The ids come from the Sportmonks coverage pages (Serie A 384, Serie B 387,
 * Coppa Italia 390) and from their documentation examples (Champions League 2,
 * Europa League 5, Conference League 2286). The first run of the
 * `sync-competitions` job prints the league name the API returns for each id:
 * check that output once and fix any id here if a name does not match.
 */
export interface CompetitionConfig {
    sportmonksId: number;
    slug: string;
    /** Display name used until the API name is stored. */
    name: string;
    /** Lower comes first in lists and in the home page. */
    priority: number;
}

export const COMPETITIONS: readonly CompetitionConfig[] = [
    {sportmonksId: 384, slug: 'serie-a', name: 'Serie A', priority: 10},
    {sportmonksId: 387, slug: 'serie-b', name: 'Serie B', priority: 20},
    {sportmonksId: 390, slug: 'coppa-italia', name: 'Coppa Italia', priority: 30},
    {sportmonksId: 2, slug: 'champions-league', name: 'UEFA Champions League', priority: 40},
    {sportmonksId: 5, slug: 'europa-league', name: 'UEFA Europa League', priority: 50},
    {sportmonksId: 2286, slug: 'conference-league', name: 'UEFA Conference League', priority: 60},
];

export const COMPETITION_IDS: readonly number[] = COMPETITIONS.map((c) => c.sportmonksId);

/** Comma separated ids for Sportmonks `filters=fixtureLeagues:...`. */
export const COMPETITION_FILTER = COMPETITION_IDS.join(',');

export function competitionBySportmonksId(id: number): CompetitionConfig | undefined {
    return COMPETITIONS.find((c) => c.sportmonksId === id);
}
