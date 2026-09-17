/**
 * What API-Football covers for a league in its current season, as the
 * /leagues endpoint declares it (stored in leagues.season_coverage by
 * sync-competitions). The featured leagues are asked for everything
 * regardless; the basic tier is asked only for what the provider says it
 * has, so no request is spent on a payload that comes back empty. Pure.
 */
export interface LeagueCoverage {
    fixtures?: {events?: boolean; lineups?: boolean; statistics_fixtures?: boolean; statistics_players?: boolean};
    standings?: boolean;
    players?: boolean;
    top_scorers?: boolean;
    injuries?: boolean;
    predictions?: boolean;
    odds?: boolean;
}

export type CoverageKey =
    /** Goals, cards and substitutions of a match. */
    | 'events'
    /** Starting eleven and bench. */
    | 'lineups'
    /** Possession, shots, corners... per team. */
    | 'teamStats'
    /** Minutes, rating, shots... per player. */
    | 'playerStats'
    /** Any of lineups, team or player statistics: worth a request of the match by id. */
    | 'detail'
    | 'standings'
    /** Season aggregates per player (/players). */
    | 'players'
    | 'injuries'
    | 'odds';

/** Whether the declared coverage includes this piece; unknown coverage counts as none. */
export function covers(coverage: LeagueCoverage | null | undefined, key: CoverageKey): boolean {
    if (!coverage) return false;
    switch (key) {
        case 'events':
            return coverage.fixtures?.events === true;
        case 'lineups':
            return coverage.fixtures?.lineups === true;
        case 'teamStats':
            return coverage.fixtures?.statistics_fixtures === true;
        case 'playerStats':
            return coverage.fixtures?.statistics_players === true;
        case 'detail':
            return covers(coverage, 'lineups') || covers(coverage, 'teamStats') || covers(coverage, 'playerStats');
        case 'standings':
            return coverage.standings === true;
        case 'players':
            return coverage.players === true;
        case 'injuries':
            return coverage.injuries === true;
        case 'odds':
            return coverage.odds === true;
    }
}

/**
 * Whether a league of this tier is asked for this piece: a featured league
 * always (its coverage is known to be full, and a gap in the declaration
 * must not blank a top league), a basic league when the provider covers it.
 */
export function provides(tier: 'featured' | 'basic', coverage: LeagueCoverage | null | undefined, key: CoverageKey): boolean {
    return tier === 'featured' || covers(coverage, key);
}
