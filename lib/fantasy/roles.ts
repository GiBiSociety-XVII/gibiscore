import type {FantaRole} from './scores';

/**
 * Fantasy roles from the formations actually fielded. The provider's
 * position (goalkeeper, defender, midfielder, attacker) is generic and
 * often disagrees with the fantasy list: a wing-back is a defender, a
 * winger an attacker, a wide playmaker in a 4-2-3-1 an attacker while
 * the central one is a midfielder. The lineup grid (row and column in
 * the formation) says where the coach really plays him. Pure.
 */

/** One formation slot a player started in: the grid row and column (row 1 = keeper). */
export interface SlotStart {
    formation: string | null;
    /** row * 10 + column, as stored in lineups. */
    position: number;
    starts: number;
    /** Weight of the season these starts belong to (current season counts more). */
    weight?: number;
}

export interface FormationShape {
    rows: number[];
    /** Three or five at the back: the outer players of the widest middle row are wing-backs. */
    backThree: boolean;
}

export function parseFormation(formation: string | null): FormationShape | null {
    if (!formation) return null;
    const rows = formation.split('-').map((n) => Number(n)).filter((n) => Number.isFinite(n) && n > 0);
    if (rows.length < 2 || rows.reduce((s, v) => s + v, 0) !== 10) return null;
    return {rows, backThree: rows[0] === 3 || rows[0] === 5};
}

/**
 * Fantasy role of a formation slot. `apiRole` breaks the ties the grid
 * cannot settle (a two-man line behind the striker: a midfielder by
 * trade stays a midfielder, a forward is an attacker).
 */
export function slotRole(formation: string | null, position: number, apiRole: FantaRole | null): FantaRole | null {
    const row = Math.floor(position / 10);
    const col = position % 10;
    if (row === 1) return 'P';
    const shape = parseFormation(formation);
    if (!shape) return row === 2 ? 'D' : null;
    const lines = shape.rows.length;
    const index = row - 2;
    if (index < 0 || index >= lines) return null;
    const size = shape.rows[index];
    const last = index === lines - 1;
    const outer = col === 1 || col === size;
    if (index === 0) return 'D';
    if (last) return 'A';
    // The widest middle row of a back-three side: its outer men are wing-backs.
    if (shape.backThree && size >= 4 && outer && index === 1) return 'D';
    if (index === lines - 2) {
        // The line behind the strikers.
        if (size === 1) return 'C';
        if (size === 2) return apiRole === 'C' || apiRole === 'D' ? 'C' : 'A';
        if (size >= 3 && lines >= 4) return outer ? 'A' : 'C';
    }
    return 'C';
}

/** Starting slots per fantasy role of a formation (a 3-5-2 has five defenders, three midfielders, two attackers). */
export function formationSpots(formation: string | null): Record<FantaRole, number> | null {
    const shape = parseFormation(formation);
    if (!shape) return null;
    const spots: Record<FantaRole, number> = {P: 1, D: 0, C: 0, A: 0};
    shape.rows.forEach((size, index) => {
        for (let col = 1; col <= size; col += 1) {
            const role = slotRole(formation, (index + 2) * 10 + col, null);
            if (role) spots[role] += 1;
        }
    });
    return spots;
}

export interface RoleCall {
    role: FantaRole;
    /** Weighted starts per role behind the call. */
    breakdown: Partial<Record<FantaRole, number>>;
    /** How the role was decided. */
    source: 'lineups' | 'fallback';
}

/**
 * A player's fantasy role: the role he started most in, from the
 * formations fielded (current season counts more), when there are
 * enough starts; otherwise the fallback (his position for the provider).
 */
export function deriveRole(slots: SlotStart[], fallback: FantaRole | null, minStarts = 3): RoleCall | null {
    const breakdown: Partial<Record<FantaRole, number>> = {};
    let total = 0;
    for (const s of slots) {
        const role = slotRole(s.formation, s.position, fallback);
        if (!role) continue;
        const w = s.starts * (s.weight ?? 1);
        breakdown[role] = (breakdown[role] ?? 0) + w;
        total += s.starts;
    }
    if (total >= minStarts) {
        const best = (Object.entries(breakdown) as Array<[FantaRole, number]>).sort((a, b) => b[1] - a[1])[0];
        if (best) return {role: best[0], breakdown, source: 'lineups'};
    }
    return fallback ? {role: fallback, breakdown, source: 'fallback'} : null;
}

export interface SlotUse {
    playerId: number;
    /** Weighted starts per slot (row * 10 + column). */
    slots: Map<number, number>;
    /** Weighted starts, all slots. */
    total: number;
}

export interface Rival {
    id: number;
    /** Weighted starts the two share in the same slot: how contested the spot is. */
    shared: number;
}

/**
 * Who competes with a player for the pitch: the teammates who started
 * in the same slots of the formation. The overlap is what both have
 * played there, so a wing-back and the man who covers him when he
 * rests come out first. Up to `limit` rivals, most contested first.
 */
export function findRivals(player: SlotUse, teammates: SlotUse[], limit = 2): Rival[] {
    const out: Rival[] = [];
    for (const mate of teammates) {
        if (mate.playerId === player.playerId) continue;
        let shared = 0;
        for (const [slot, mine] of player.slots) {
            const theirs = mate.slots.get(slot) ?? 0;
            if (theirs > 0) shared += Math.min(mine, theirs);
        }
        if (shared > 0) out.push({id: mate.playerId, shared: Math.round(shared * 10) / 10});
    }
    return out.sort((a, b) => b.shared - a.shared).slice(0, limit);
}
