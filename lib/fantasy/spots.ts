import type {FantaRole} from './scores';

/** A place on the pitch: who stands there, in which line. */
export interface Spot {
    id: number;
    role: FantaRole;
}

const ROLES: FantaRole[] = ['P', 'D', 'C', 'A'];

/**
 * The eleven laid over the spots as they were last drawn: whoever stayed
 * keeps his place, whoever left hands it to a newcomer of his line, and
 * the newcomers left over go at the end of their line. A swap by hand
 * thus puts the one who comes in exactly where the other one stood, and
 * nobody else moves.
 */
export function keepSpots(previous: readonly Spot[], starters: ReadonlyArray<{id: number; role: FantaRole}>): Spot[] {
    const out: Spot[] = [];
    for (const role of ROLES) {
        const now = new Set(starters.filter((p) => p.role === role).map((p) => p.id));
        const arrivals = [...now].filter((id) => !previous.some((s) => s.id === id));
        const line: Spot[] = [];
        for (const spot of previous.filter((s) => s.role === role)) {
            if (now.has(spot.id)) line.push(spot);
            else if (arrivals.length > 0) line.push({id: arrivals.shift()!, role});
        }
        out.push(...line, ...arrivals.map((id) => ({id, role})));
    }
    return out;
}

export const sameSpots = (a: readonly Spot[], b: readonly Spot[]): boolean => a.length === b.length && a.every((s, i) => s.id === b[i].id && s.role === b[i].role);
