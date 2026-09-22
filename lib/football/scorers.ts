import type {MatchEvent} from './types';

/**
 * The goal lines under a scoreboard: "Lautaro 23', 67' (rig.)".
 *
 * Pure, and shared by the page the server renders and the browser that
 * keeps it moving: while a match is on the events arrive by the live
 * endpoint, and the same list must come out of both.
 */

export interface Scorer {
    name: string;
    slug: string | null;
    /** One entry per goal, already written out: "23'", "45+2' (rig.)". */
    minutes: string[];
}

/** How a penalty and an own goal are marked, in the reader's language. */
export interface ScorerMarks {
    penalty: string;
    ownGoal: string;
}

export function scorersOf(events: MatchEvent[], side: 'home' | 'away', marks: ScorerMarks): Scorer[] {
    const byPlayer = new Map<string, Scorer>();
    for (const e of events) {
        if (e.type !== 'goal' && e.type !== 'penalty' && e.type !== 'own_goal') continue;
        // An own goal counts for the other side.
        const credited = e.type === 'own_goal' ? (e.side === 'home' ? 'away' : 'home') : e.side;
        if (credited !== side) continue;
        const name = e.player.name ?? '?';
        const key = e.player.id ? String(e.player.id) : name;
        if (!byPlayer.has(key)) byPlayer.set(key, {name, slug: e.player.slug, minutes: []});
        const mark = e.type === 'penalty' ? ` ${marks.penalty}` : e.type === 'own_goal' ? ` ${marks.ownGoal}` : '';
        byPlayer.get(key)!.minutes.push(`${e.minute ?? ''}${e.extraMinute ? `+${e.extraMinute}` : ''}'${mark}`);
    }
    return [...byPlayer.values()];
}
