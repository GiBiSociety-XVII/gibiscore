/**
 * What the transfer feed says about a club's squad: who arrived and who
 * left since the season started. The provider's squads lag behind moves
 * by days; its transfer feed does not. Pure.
 */

export interface TransferMove {
    playerId: number;
    name: string;
    /** YYYY-MM-DD */
    date: string;
    inTeam: number | null;
    outTeam: number | null;
}

export interface SquadChanges {
    arrivals: Map<number, string>;
    departures: Set<number>;
}

/** The last move of each player inside the window decides: in = arrival, out = departure. */
export function squadChanges(moves: TransferMove[], team: number, since: string, until: string): SquadChanges {
    const byPlayer = new Map<number, TransferMove[]>();
    for (const m of moves) {
        if (m.date < since || m.date > until) continue;
        if (m.inTeam !== team && m.outTeam !== team) continue;
        byPlayer.set(m.playerId, [...(byPlayer.get(m.playerId) ?? []), m]);
    }
    const arrivals = new Map<number, string>();
    const departures = new Set<number>();
    for (const [id, list] of byPlayer) {
        const last = [...list].sort((a, b) => a.date.localeCompare(b.date))[list.length - 1];
        if (last.inTeam === team) arrivals.set(id, last.name);
        else if (last.outTeam === team) departures.add(id);
    }
    return {arrivals, departures};
}

/** Start of a season's transfer activity: mid-June of the season's first year. */
export const seasonWindowStart = (year: number) => `${year}-06-15`;
