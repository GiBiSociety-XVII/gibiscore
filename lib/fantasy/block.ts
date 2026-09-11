import type {FantaRole} from './scores';

/**
 * Keepers by club, for leagues where a keeper is bought with every keeper
 * of his club at one price ("portieri a blocco"). The block is carried by
 * the club's first keeper: he is the one priced, planned and bought; the
 * others follow him into the roster at nothing.
 */
export interface BlockPlayer {
    id: number;
    role: FantaRole;
    team: {id: number};
    scores: {starter: number; overall: number};
}

export interface KeeperBlocks {
    /** Every keeper id of the club, first keeper first. */
    byTeam: Map<number, number[]>;
    /** The first keeper of each keeper's club. */
    starterOf: Map<number, number>;
    /** The keepers who are not their club's first: not priced, not planned, bought with the first. */
    backups: Set<number>;
}

export function keeperBlocks(players: BlockPlayer[]): KeeperBlocks {
    const byTeam = new Map<number, BlockPlayer[]>();
    for (const p of players) {
        if (p.role !== 'P') continue;
        byTeam.set(p.team.id, [...(byTeam.get(p.team.id) ?? []), p]);
    }
    const out: KeeperBlocks = {byTeam: new Map(), starterOf: new Map(), backups: new Set()};
    for (const [teamId, keepers] of byTeam) {
        const sorted = keepers.slice().sort((a, b) => b.scores.starter - a.scores.starter || b.scores.overall - a.scores.overall);
        out.byTeam.set(teamId, sorted.map((p) => p.id));
        for (const p of sorted) out.starterOf.set(p.id, sorted[0].id);
        for (const p of sorted.slice(1)) out.backups.add(p.id);
    }
    return out;
}
