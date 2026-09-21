/**
 * What moves on a match while a page is open, and the one rule that
 * keeps it steady: a reading is only ever replaced by a later one.
 *
 * The same numbers reach the browser by two roads — the page the server
 * rendered (cached, so it can be seconds old) and the small JSON the
 * page polls (cached too, and served by whichever edge node answers) —
 * and neither road is ordered against the other. Without a rule, a
 * fresh score is overwritten by an older render and the row flickers
 * between the two until the next poll. With it, older readings are
 * simply dropped, whichever road they came by.
 *
 * Shared by the server (which reads the columns) and the browser (which
 * merges them), so it holds no import of either side.
 */

/** The columns of a fixture that change while it is on. */
export interface LiveFixture {
    id: number;
    state: string;
    minute: number | null;
    extraMinute: number | null;
    /** When the sync last wrote the row, ISO: what orders two readings. */
    syncedAt: string | null;
    homeScore: number | null;
    awayScore: number | null;
}

/** A match that is over stays over: no later feed hiccup puts it back on. */
const SETTLED = new Set(['finished', 'postponed', 'cancelled', 'abandoned']);

function writtenAt(f: Pick<LiveFixture, 'syncedAt'>): number {
    const t = f.syncedAt ? Date.parse(f.syncedAt) : Number.NaN;
    return Number.isNaN(t) ? 0 : t;
}

/**
 * True when `next` is a later reading of the match than `have`.
 *
 * The stamp of the sync decides it: a correction (a goal the video
 * review takes back) is written later and so wins, score going down and
 * all. Only when two readings carry the same stamp — or none at all,
 * as on a match that has never been synced — does how far the match has
 * got break the tie, and equal readings are not newer: the row is left
 * alone rather than drawn again.
 */
export function isLater(next: LiveFixture, have: LiveFixture | undefined): boolean {
    if (!have) return true;
    const a = writtenAt(next);
    const b = writtenAt(have);
    if (a !== b) return a > b;
    const settled = (f: LiveFixture) => (SETTLED.has(f.state) ? 1 : 0);
    if (settled(next) !== settled(have)) return settled(next) > settled(have);
    const played = (f: LiveFixture) => (f.minute ?? 0) + (f.extraMinute ?? 0);
    if (played(next) !== played(have)) return played(next) > played(have);
    const goals = (f: LiveFixture) => (f.homeScore ?? 0) + (f.awayScore ?? 0);
    return goals(next) > goals(have);
}

/** True when the two readings say the same thing, and a row drawn from one need not be drawn again. */
export function sameLive(a: LiveFixture, b: LiveFixture): boolean {
    return a.state === b.state && a.minute === b.minute && a.extraMinute === b.extraMinute && a.homeScore === b.homeScore && a.awayScore === b.awayScore && a.syncedAt === b.syncedAt;
}

/**
 * `have` with every later reading of `incoming` laid over it, and the
 * rest left alone. The map that comes out is a new one only when
 * something actually changed, so a poll that brings nothing new costs no
 * render.
 */
export function mergeLive(have: ReadonlyMap<number, LiveFixture>, incoming: Iterable<LiveFixture>): ReadonlyMap<number, LiveFixture> {
    let next: Map<number, LiveFixture> | null = null;
    for (const f of incoming) {
        const seen = (next ?? have).get(f.id);
        if (!isLater(f, seen)) continue;
        next ??= new Map(have);
        next.set(f.id, f);
    }
    return next ?? have;
}

/** A row of any of the read models, down to the columns that move. */
export function liveOf(f: {id: number; state: string; minute: number | null; extraMinute?: number | null; syncedAt?: string | null; homeScore: number | null; awayScore: number | null}): LiveFixture {
    return {id: f.id, state: f.state, minute: f.minute, extraMinute: f.extraMinute ?? null, syncedAt: f.syncedAt ?? null, homeScore: f.homeScore, awayScore: f.awayScore};
}
