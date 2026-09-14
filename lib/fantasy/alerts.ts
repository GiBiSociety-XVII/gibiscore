import type {SavedTeam} from './config';
import {recommendLineup, type PlayerForecast} from './matchday';
import type {LineupLock} from './store';
import {defenceOption, type FormationKey} from './strategies';

/**
 * What to warn about on a saved team before the round: a starter of the
 * last lineup advised who is now out, in doubt or left out of the
 * official lineup, and the rest of the roster who is out. Pure: the
 * snapshot is the one the lineup page keeps on the device, the statuses
 * come from the status API.
 */

export interface PlayerStatusLite {
    name: string;
    official: 'starter' | 'bench' | 'out' | null;
    sidelined: {category: string; description: string | null} | null;
}

/** What the status API answers: the round the statuses are for and the players asked for. */
export interface StatusResponse {
    round: string | null;
    generatedAt: string | null;
    players: Record<number, PlayerStatusLite>;
}

export type AlertKind = 'injury' | 'suspension' | 'absent' | 'doubtful' | 'benchOfficial' | 'outOfficial';

export interface LineupAlert {
    playerId: number;
    name: string;
    kind: AlertKind;
    /** Whether he was in the eleven the page last advised. */
    starter: boolean;
    description: string | null;
}

export interface TeamAlerts {
    /** The last advice on the device is for this round: the starters are known. */
    hasLineup: boolean;
    starters: LineupAlert[];
    others: LineupAlert[];
}

function kindOf(s: PlayerStatusLite): {kind: AlertKind; description: string | null} | null {
    if (s.sidelined) {
        const c = s.sidelined.category;
        if (c === 'doubtful') return {kind: 'doubtful', description: s.sidelined.description};
        if (c === 'manual') return null;
        return {kind: c === 'injury' ? 'injury' : c === 'suspension' ? 'suspension' : 'absent', description: s.sidelined.description};
    }
    if (s.official === 'bench') return {kind: 'benchOfficial', description: null};
    if (s.official === 'out') return {kind: 'outOfficial', description: null};
    return null;
}

/** The eleven the device last advised for the team, when the snapshot is for this round. */
export function advisedStarters(team: SavedTeam, snapshot: LineupLock | undefined, round: string | null): Set<number> | null {
    if (!snapshot || !round || snapshot.round !== round) return null;
    const advice = recommendLineup(snapshot.forecasts as PlayerForecast[], {rules: team.rules, defenceModifier: defenceOption(team), prefer: team.formation as FormationKey | null, force: snapshot.forced as FormationKey | null, pinned: new Set(snapshot.pinned)});
    return new Set(advice.starters.map((f) => f.player.id));
}

export function teamAlerts(team: SavedTeam, statuses: Record<number, PlayerStatusLite>, starters: Set<number> | null): TeamAlerts {
    const out: TeamAlerts = {hasLineup: starters !== null, starters: [], others: []};
    for (const id of team.players) {
        const s = statuses[id];
        if (!s) continue;
        const k = kindOf(s);
        if (!k) continue;
        const alert: LineupAlert = {playerId: id, name: s.name, kind: k.kind, starter: starters?.has(id) ?? false, description: k.description};
        // Off the eleven, a bench or out in the official lineup is no news; an absence is.
        if (alert.starter) out.starters.push(alert);
        else if (k.kind !== 'benchOfficial' && k.kind !== 'outOfficial') out.others.push(alert);
    }
    const weight: Record<AlertKind, number> = {injury: 0, suspension: 0, absent: 0, outOfficial: 1, benchOfficial: 2, doubtful: 3};
    out.starters.sort((a, b) => weight[a.kind] - weight[b.kind] || a.name.localeCompare(b.name));
    out.others.sort((a, b) => weight[a.kind] - weight[b.kind] || a.name.localeCompare(b.name));
    return out;
}
