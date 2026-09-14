import {matchListone, parseListone, type ListoneRow, type MatchablePlayer} from './listone';
import type {FantaRole} from './scores';

/**
 * The official fantasy votes of a round (Fantacalcio.it's "Voti"
 * workbook, converted by scripts/fantacalcio-voti-to-json.mjs): the
 * newspaper vote and the events the game pays, per player, written by
 * surname and club like the price list, so they are matched to the
 * database the same way. Pure: the rows come from core/fantasy/voti.
 */

/** [team, role, name, voto (null = no vote), gf, gs, rp, rs, rf, au, amm, esp, ass] */
export type VotoRow = [string, string, string, number | null, number, number, number, number, number, number, number, number, number];

export interface VotoEntry {
    team: string;
    role: FantaRole;
    name: string;
    /** The newspaper's vote; null when he had none (too few minutes). */
    voto: number | null;
    goals: number;
    conceded: number;
    penaltiesScored: number;
    penaltiesSaved: number;
    penaltiesMissed: number;
    ownGoals: number;
    yellow: number;
    red: number;
    assists: number;
}

export function parseVoti(rows: VotoRow[]): VotoEntry[] {
    const out: VotoEntry[] = [];
    for (const r of rows) {
        if (!Array.isArray(r) || r.length < 4) continue;
        const role = String(r[1]).toUpperCase();
        if (role !== 'P' && role !== 'D' && role !== 'C' && role !== 'A') continue;
        const voto = typeof r[3] === 'number' && Number.isFinite(r[3]) ? r[3] : null;
        const n = (i: number) => (typeof r[i] === 'number' && Number.isFinite(r[i] as number) ? (r[i] as number) : 0);
        out.push({team: String(r[0] ?? '').trim(), role, name: String(r[2] ?? '').trim(), voto, goals: n(4), conceded: n(5), penaltiesScored: n(6), penaltiesSaved: n(7), penaltiesMissed: n(8), ownGoals: n(9), yellow: n(10), red: n(11), assists: n(12)});
    }
    return out;
}

/**
 * The round's votes by player id: the club and the surname (the initial
 * breaking ties) as the price list is matched, so the same names meet
 * the same players. Entries nobody matches are returned too.
 */
export function matchVoti(entries: VotoEntry[], players: MatchablePlayer[]): {byPlayer: Map<number, VotoEntry>; unmatched: VotoEntry[]} {
    const rows: ListoneRow[] = entries.map((e) => [e.role, e.name, e.team, 0]);
    const {byPlayer: listed, unmatched: left} = matchListone(parseListone(rows), players);
    const byKey = new Map(entries.map((e) => [`${e.team}|${e.name}`, e]));
    const byPlayer = new Map<number, VotoEntry>();
    for (const [id, match] of listed) {
        // The list's name and the club it was matched under: the entry it came from.
        const entry = entries.find((e) => e.name === match.name && byKey.has(`${e.team}|${e.name}`)) ?? null;
        if (entry) byPlayer.set(id, entry);
    }
    const unmatched = left.map((l) => byKey.get(`${l.team}|${l.name}`)).filter((e): e is VotoEntry => !!e);
    return {byPlayer, unmatched};
}
