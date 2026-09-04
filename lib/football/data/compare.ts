import 'server-only';
import type {PlayerPage, PlayerSeasonStat} from '../types';
import {getPlayerPage} from './players';
import {TEAM_SELECT, footballDb, logReadError, type TeamRow} from './shared';

export interface CompareSide {
    page: PlayerPage;
    /** Season totals summed over the player's competitions of the selected season. */
    totals: {
        appearances: number;
        minutes: number;
        goals: number;
        assists: number;
        shots: number;
        shotsOn: number;
        keyPasses: number;
        yellowCards: number;
        redCards: number;
        rating: number | null;
        passAccuracy: number | null;
    };
}

function sum(rows: PlayerSeasonStat[]): CompareSide['totals'] {
    const t = {appearances: 0, minutes: 0, goals: 0, assists: 0, shots: 0, shotsOn: 0, keyPasses: 0, yellowCards: 0, redCards: 0, rating: null as number | null, passAccuracy: null as number | null};
    let ratingW = 0;
    let ratingS = 0;
    let passW = 0;
    let passS = 0;
    for (const r of rows) {
        t.appearances += r.appearances;
        t.minutes += r.minutes;
        t.goals += r.goals;
        t.assists += r.assists;
        t.shots += r.shots ?? 0;
        t.shotsOn += r.shotsOn ?? 0;
        t.keyPasses += r.keyPasses ?? 0;
        t.yellowCards += r.yellowCards;
        t.redCards += r.redCards;
        if (r.rating !== null && r.appearances > 0) {
            ratingS += r.rating * r.appearances;
            ratingW += r.appearances;
        }
        if (r.passAccuracy !== null && r.appearances > 0) {
            passS += r.passAccuracy * r.appearances;
            passW += r.appearances;
        }
    }
    t.rating = ratingW > 0 ? Math.round((ratingS / ratingW) * 100) / 100 : null;
    t.passAccuracy = passW > 0 ? Math.round(passS / passW) : null;
    return t;
}

/** Two players side by side for one season (default: the newest season of the first player). */
export async function getPlayerCompare(slugA: string, slugB: string, seasonYear?: number): Promise<{a: CompareSide; b: CompareSide; year: number} | null> {
    const first = await getPlayerPage(slugA, seasonYear);
    if (!first) return null;
    const year = seasonYear ?? first.selectedSeason;
    const [a, b] = await Promise.all([seasonYear === undefined ? Promise.resolve(first) : getPlayerPage(slugA, year), getPlayerPage(slugB, year)]);
    if (!a || !b) return null;
    const side = (page: PlayerPage): CompareSide => ({page, totals: sum(page.seasons.filter((s) => s.seasonYear === year))});
    return {a: side(a), b: side(b), year};
}

export interface PlayerBrief {
    name: string;
    slug: string;
    imageUrl: string | null;
    /** Current team, when known. */
    team: string | null;
}

/** Name, photo and current team of one player: the "selected" card of the compare page. */
export async function getPlayerBrief(slug: string): Promise<PlayerBrief | null> {
    try {
        const db = footballDb();
        const {data, error} = await db.from('players').select('id,name,slug,image_url').eq('slug', slug).maybeSingle();
        if (error) throw error;
        if (!data) return null;
        const player = data as {id: number; name: string; slug: string; image_url: string | null};
        const {data: squad} = await db
            .from('squad_members')
            .select(`team:teams(${TEAM_SELECT}),season:seasons!inner(is_current)`)
            .eq('player_id', player.id)
            .eq('seasons.is_current', true)
            .limit(1);
        const team = ((squad ?? []) as unknown as Array<{team: TeamRow | null}>)[0]?.team ?? null;
        return {name: player.name, slug: player.slug, imageUrl: player.image_url, team: team?.name ?? null};
    } catch (error) {
        logReadError(`getPlayerBrief(${slug})`, error);
        return null;
    }
}
