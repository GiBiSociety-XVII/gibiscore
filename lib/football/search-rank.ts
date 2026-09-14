import {featuredPriority} from './competitions';

/**
 * How search hits are folded and ordered. Pure, so the API and the full
 * page share it and it can be tested without a database.
 */

/** Lower case, no accents or special Latin letters: what the database keeps in `search_name`. */
export function foldName(text: string): string {
    return text
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .replace(/[øØ]/g, 'o')
        .replace(/[łŁ]/g, 'l')
        .replace(/[đĐ]/g, 'd')
        .replace(/ß/g, 'ss')
        .replace(/[æÆ]/g, 'ae')
        .replace(/[œŒ]/g, 'oe')
        .toLowerCase()
        .trim();
}

/** How the name meets the query: 2 when it starts with it, 1 when one of its words does, 0 when it only contains it. */
export function prefixMatch(name: string, query: string): 0 | 1 | 2 {
    const n = foldName(name);
    const q = foldName(query);
    if (q.length === 0) return 0;
    if (n.startsWith(q)) return 2;
    return n.split(/[\s'-]+/).some((w) => w.startsWith(q)) ? 1 : 0;
}

/** What a competition is worth in a ranking: the featured ones by their order, any other active one a little. */
export function leagueWeight(slug: string | null | undefined, tier?: string | null): number {
    if (!slug) return 0;
    const priority = featuredPriority(slug);
    if (priority < 1000) return 10 + Math.max(0, (100 - priority) / 10);
    return tier === 'featured' ? 6 : 2;
}

export interface RankablePlayer {
    name: string;
    /** Whether this season's squads place him somewhere. */
    hasTeam: boolean;
    /** The competition his team plays this season, when known. */
    leagueSlug?: string | null;
    leagueTier?: string | null;
    /** Minutes played in the last two seasons, when known. */
    minutes?: number;
}

/**
 * A player's place in the results: the ones with a team come first, the
 * big competitions before the small, the more he plays the higher, and
 * a name that starts with the query beats one that only contains it.
 */
export function playerScore(p: RankablePlayer, query: string): number {
    let score = 0;
    if (p.hasTeam) score += 20 + leagueWeight(p.leagueSlug, p.leagueTier);
    score += prefixMatch(p.name, query) * 2.5;
    score += Math.min(3, (p.minutes ?? 0) / 1500);
    return score;
}

export interface RankableTeam {
    name: string;
    leagueSlug?: string | null;
    leagueTier?: string | null;
}

/** A team's place: the competitions it plays this season, then the name. */
export function teamScore(t: RankableTeam, query: string): number {
    return leagueWeight(t.leagueSlug, t.leagueTier) + prefixMatch(t.name, query) * 2.5;
}

/** Sorts hits by their score, the name breaking ties. */
export function rankBy<T extends {name: string}>(items: T[], score: (item: T) => number): T[] {
    return items.map((item, i) => ({item, i, s: score(item)})).sort((a, b) => b.s - a.s || a.item.name.localeCompare(b.item.name) || a.i - b.i).map((x) => x.item);
}
