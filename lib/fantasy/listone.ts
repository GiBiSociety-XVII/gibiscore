import type {FantaRole} from './scores';

/**
 * The official fantasy list ("listone"): the role every player has in
 * the fantasy game, which is what the auction must show, and the list's
 * own quotation. Players are given by surname (with an initial when two
 * share it) and club, so matching against the database goes by club
 * and surname, the initial breaking ties. Pure.
 */

/** [role, name, team, quotation] as exported by scripts/listone-to-json.mjs. */
export type ListoneRow = [string, string, string, number];

export interface ListoneEntry {
    role: FantaRole;
    /** As written in the list. */
    name: string;
    surname: string;
    /** Initial(s) of the first name when the list gives them, lower case. */
    initial: string | null;
    team: string;
    quote: number;
}

export interface MatchablePlayer {
    id: number;
    name: string;
    team: string;
}

export interface ListoneMatch {
    role: FantaRole;
    quote: number;
    /** The list's name, for the record. */
    name: string;
}

/** Lower case, no accents, apostrophes unified, HTML entities gone. */
export function normalizeName(s: string): string {
    return s
        .replace(/&apos;|’|`/g, "'")
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .replace(/[ıİ]/g, 'i')
        .replace(/[ðÐ]/g, 'd')
        .replace(/[łŁ]/g, 'l')
        .replace(/[đĐ]/g, 'd')
        .replace(/[øØ]/g, 'o')
        .replace(/[þÞ]/g, 'th')
        .replace(/ß/g, 'ss')
        .toLowerCase()
        .replace(/[^a-z' -]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

const ROLES = new Set(['P', 'D', 'C', 'A']);

export function parseListone(rows: ListoneRow[]): ListoneEntry[] {
    const out: ListoneEntry[] = [];
    for (const [role, name, team, quote] of rows) {
        if (!ROLES.has(role)) continue;
        // "Martinez J." / "Rossi Fr.": the trailing token with a dot is the initial.
        const m = name.match(/^(.*?)\s+([A-Za-z]{1,3})\.$/);
        out.push({role: role as FantaRole, name, surname: normalizeName(m ? m[1] : name), initial: m ? m[2].toLowerCase() : null, team: normalizeName(team), quote});
    }
    return out;
}

/** Surname and initial of a database name: "M. Svilar", "David de Gea", "Lautaro Martínez", "Hermoso". */
export function splitDbName(name: string): {surname: string; initial: string | null; tokens: string[]} {
    const tokens = normalizeName(name).split(' ').filter(Boolean);
    if (tokens.length <= 1) return {surname: tokens[0] ?? '', initial: null, tokens};
    const [first, ...rest] = tokens;
    return {surname: rest.join(' '), initial: first.replace(/[^a-z]/g, '').slice(0, 1) || null, tokens: rest};
}

/** The list's club name is inside the database club name ("milan" in "ac milan", "roma" in "as roma"). */
export function sameTeam(listTeam: string, dbTeam: string): boolean {
    if (!listTeam) return false;
    const db = normalizeName(dbTeam);
    return db === listTeam || db.split(' ').includes(listTeam) || db.includes(listTeam);
}

const squash = (s: string) => s.replace(/[' -]/g, '');

function surnameMatches(entry: ListoneEntry, db: {surname: string; tokens: string[]}): number {
    if (!entry.surname || !db.surname) return 0;
    if (db.surname === entry.surname || squash(db.surname) === squash(entry.surname)) return 3;
    // "Anguissa" for "zambo anguissa", "Milinkovic" for "milinkovic-savic", "De Gea" for "de gea".
    const parts = db.surname.split(/[ -]/);
    if (parts.includes(entry.surname) || parts[parts.length - 1] === entry.surname) return 2;
    if (db.surname.endsWith(` ${entry.surname}`) || db.surname.startsWith(`${entry.surname}-`) || db.surname.startsWith(`${entry.surname} `)) return 2;
    const entryParts = entry.surname.split(/[ -]/);
    if (entryParts.length > 1 && entryParts.some((p) => p.length > 3 && parts.includes(p))) return 1;
    return 0;
}

/**
 * Matches the list against the players of the database: by club first,
 * then surname, the initial deciding between namesakes. Entries without
 * a club (players who left the league) match only when the surname is
 * unique in the whole database. Returns the match per player id and the
 * list entries nobody matched.
 */
export function matchListone(entries: ListoneEntry[], players: MatchablePlayer[]): {byPlayer: Map<number, ListoneMatch>; unmatched: ListoneEntry[]} {
    const byPlayer = new Map<number, ListoneMatch>();
    const unmatched: ListoneEntry[] = [];
    const parsed = players.map((p) => ({p, full: normalizeName(p.name), ...splitDbName(p.name)}));
    const used = new Set<number>();
    /** The candidates of a pool, best surname score first, the initial deciding between namesakes; the same person twice in the database counts once. */
    const pick = (entry: ListoneEntry, pool: typeof parsed, strict: boolean): number[] | null => {
        let candidates = pool.map((c) => ({c, score: surnameMatches(entry, c)})).filter((x) => x.score > (strict ? 1 : 0) && !used.has(x.c.p.id));
        if (candidates.length === 0) return null;
        const best = Math.max(...candidates.map((x) => x.score));
        candidates = candidates.filter((x) => x.score === best);
        if (candidates.length > 1 && entry.initial) {
            const byInitial = candidates.filter((x) => x.c.initial !== null && entry.initial!.startsWith(x.c.initial));
            if (byInitial.length >= 1) candidates = byInitial;
        } else if (strict && entry.initial) {
            // Away from the club the initial must agree, or a namesake elsewhere would take the role.
            candidates = candidates.filter((x) => x.c.initial === null || entry.initial!.startsWith(x.c.initial));
        }
        const names = new Set(candidates.map((x) => x.c.full));
        if (names.size !== 1) return null;
        return candidates.map((x) => x.c.p.id);
    };
    const assign = (entry: ListoneEntry, ids: number[]) => {
        for (const id of ids) {
            used.add(id);
            byPlayer.set(id, {role: entry.role, quote: entry.quote, name: entry.name});
        }
    };
    // Entries with an initial first: they are the ambiguous surnames, and must not be stolen by the plain ones.
    const ordered = [...entries].sort((a, b) => Number(b.initial !== null) - Number(a.initial !== null));
    const pending: ListoneEntry[] = [];
    for (const entry of ordered) {
        if (!entry.team) {
            pending.push(entry);
            continue;
        }
        const ids = pick(entry, parsed.filter((c) => sameTeam(entry.team, c.p.team)), false);
        if (ids) assign(entry, ids);
        else pending.push(entry);
    }
    // Second pass, club ignored: the list and the database may disagree on a transfer, and the
    // players who left the league are still listed. The surname must then be unique.
    for (const entry of pending) {
        const ids = pick(entry, parsed, true);
        if (ids) assign(entry, ids);
        else unmatched.push(entry);
    }
    return {byPlayer, unmatched};
}
