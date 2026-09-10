import type {FantaRole} from './scores';

/**
 * Fantasy roles from the formations actually fielded. The provider's
 * position (goalkeeper, defender, midfielder, attacker) is generic and
 * often disagrees with the fantasy list; the lineup grid (row and column
 * in the formation) says where the coach really plays him. Classic
 * rules, nothing finer: the back line is defenders, the front line
 * attackers, everyone in between a midfielder. Pure.
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
}

export function parseFormation(formation: string | null): FormationShape | null {
    if (!formation) return null;
    const rows = formation.split('-').map((n) => Number(n)).filter((n) => Number.isFinite(n) && n > 0);
    if (rows.length < 2 || rows.reduce((s, v) => s + v, 0) !== 10) return null;
    return {rows};
}

/**
 * Fantasy role of a formation slot: the first row defends, the last one
 * attacks, the rows between are midfield. `apiRole` is only a fallback
 * when the formation is unknown.
 */
export function slotRole(formation: string | null, position: number, apiRole: FantaRole | null): FantaRole | null {
    const row = Math.floor(position / 10);
    if (row === 1) return 'P';
    const shape = parseFormation(formation);
    if (!shape) return row === 2 ? 'D' : apiRole;
    const index = row - 2;
    if (index < 0 || index >= shape.rows.length) return null;
    if (index === 0) return 'D';
    if (index === shape.rows.length - 1) return 'A';
    return 'C';
}

/** Starting slots per fantasy role of a formation (a 3-5-2 has three defenders, five midfielders, two attackers). */
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

export interface Availability {
    /** Weighted matches started at the club. */
    starts: number;
    /** Weighted matches on the bench at the club. */
    benches: number;
}

/**
 * Whether a player's place is contested: he sat on the bench in at
 * least a fifth of the matches he was available for (with enough of
 * them to say so). A player who starts whenever he is fit is never in a
 * "ballottaggio", whatever his injuries did to his season.
 */
export function isContested(a: Availability, minMatches = 3): boolean {
    const total = a.starts + a.benches;
    if (total < minMatches) return false;
    return a.benches / total >= 0.2;
}
