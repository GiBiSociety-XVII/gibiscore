/**
 * Absence spells. API-Football lists, per fixture, the players that
 * missed it (or are doubtful for it) and the reason; it never says when
 * an injury started or when the player is due back. We rebuild that:
 * consecutive missed fixtures of one player make a spell, its first
 * fixture is "out since", and the reason gives an indicative return
 * window from typical recovery times. Pure and testable.
 */

export interface SidelinedRow {
    playerId: number;
    teamId: number;
    /** Date of the missed fixture, YYYY-MM-DD. */
    date: string;
    category: string;
    description: string | null;
}

export interface Spell {
    playerId: number;
    teamId: number;
    category: string;
    description: string | null;
    /** First fixture missed in this spell, YYYY-MM-DD. */
    since: string;
    /** Latest fixture missed (or listed as doubtful), YYYY-MM-DD. */
    last: string;
    /** Fixtures in the spell. */
    missed: number;
    /** Still out: the latest listing is upcoming, or the team has not played since. */
    active: boolean;
}

export interface ReturnEstimate {
    /** nextMatch: back for the next fixture (suspensions, doubts). range: typical recovery window. soon: the window has passed. unknown: no basis. */
    kind: 'nextMatch' | 'range' | 'soon' | 'unknown';
    /** Middle of the window, YYYY-MM-DD, when kind is range. */
    date: string | null;
    from: string | null;
    to: string | null;
    longTerm: boolean;
}

/** Two fixtures further apart than this are separate spells (international breaks are ~2 weeks). */
const MAX_GAP_DAYS = 24;
/** Without any team fixture in between, a listing older than this is stale. */
const STALE_DAYS = 24;

const DAY = 86_400_000;

export function daysBetween(from: string, to: string): number {
    return Math.round((Date.UTC(+to.slice(0, 4), +to.slice(5, 7) - 1, +to.slice(8, 10)) - Date.UTC(+from.slice(0, 4), +from.slice(5, 7) - 1, +from.slice(8, 10))) / DAY);
}

export function addDays(date: string, days: number): string {
    return new Date(Date.UTC(+date.slice(0, 4), +date.slice(5, 7) - 1, +date.slice(8, 10)) + days * DAY).toISOString().slice(0, 10);
}

export interface BuildOptions {
    /** Today, YYYY-MM-DD. */
    today: string;
    /** Whether the team played a finished fixture strictly after the date (YYYY-MM-DD). */
    teamPlayedAfter?: (teamId: number, date: string) => boolean;
}

/** One spell per player and team: the latest run of missed fixtures. */
export function buildSpells(rows: SidelinedRow[], options: BuildOptions): Spell[] {
    const groups = new Map<string, SidelinedRow[]>();
    for (const r of rows) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(r.date)) continue;
        const key = `${r.playerId}:${r.teamId}`;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key)!.push(r);
    }
    const spells: Spell[] = [];
    for (const group of groups.values()) {
        const byDate = new Map<string, SidelinedRow>();
        for (const r of group.sort((a, b) => a.date.localeCompare(b.date))) byDate.set(r.date, r);
        const dates = [...byDate.keys()];
        let start = dates.length - 1;
        while (start > 0 && daysBetween(dates[start - 1], dates[start]) <= MAX_GAP_DAYS) start -= 1;
        const latest = byDate.get(dates[dates.length - 1])!;
        const last = latest.date;
        const played = options.teamPlayedAfter?.(latest.teamId, last) ?? false;
        const active = last >= options.today || (!played && daysBetween(last, options.today) <= STALE_DAYS);
        spells.push({
            playerId: latest.playerId,
            teamId: latest.teamId,
            category: latest.category,
            description: latest.description,
            since: dates[start],
            last,
            missed: dates.length - start,
            active,
        });
    }
    return spells;
}

interface Window {
    match: RegExp;
    min: number;
    max: number;
}

/** Typical time out in days by reason, most specific first. */
const WINDOWS: Window[] = [
    {match: /cruciate|acl|achilles/, min: 180, max: 270},
    {match: /broken|fracture|shinbone|calfbone/, min: 60, max: 120},
    {match: /surgery|operation/, min: 45, max: 90},
    {match: /hernia|tendon|ligament|meniscus/, min: 28, max: 56},
    {match: /knee/, min: 28, max: 56},
    {match: /hamstring/, min: 21, max: 35},
    {match: /shoulder|arm|wrist|hand|finger|ribs|collarbone/, min: 21, max: 42},
    {match: /ankle|foot|heel|shin|hip|toe/, min: 21, max: 42},
    {match: /muscle|thigh|calf|groin|adductor|quad/, min: 14, max: 28},
    {match: /back|neck/, min: 14, max: 28},
    {match: /leg/, min: 21, max: 42},
    {match: /concussion|head|face|nose|eye/, min: 7, max: 14},
    {match: /knock|contusion|bruise|illness|virus|flu|health|fever|sick/, min: 5, max: 10},
    {match: /injur/, min: 14, max: 28},
];

/** Indicative return from the reason and the start of the spell. */
export function estimateReturn(spell: Pick<Spell, 'category' | 'description' | 'since' | 'last'>, today: string): ReturnEstimate {
    const none: ReturnEstimate = {kind: 'unknown', date: null, from: null, to: null, longTerm: false};
    if (spell.category === 'suspension' || spell.category === 'doubtful') return {...none, kind: 'nextMatch'};
    const text = (spell.description ?? '').toLowerCase();
    if (spell.category !== 'injury' || /heart|cardiac/.test(text)) return none;
    const window = WINDOWS.find((w) => w.match.test(text));
    if (!window) return none;
    const from = addDays(spell.since, window.min);
    const to = addDays(spell.since, window.max);
    const longTerm = window.max >= 120;
    if (to < today) return {kind: 'soon', date: null, from, to, longTerm};
    return {kind: 'range', date: addDays(spell.since, Math.round((window.min + window.max) / 2)), from, to, longTerm};
}
