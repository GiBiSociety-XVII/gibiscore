/**
 * Which club a player belongs to now, from what the provider tells in
 * different places and at different speeds:
 *
 * - the squad list of a club: authoritative during a transfer window,
 *   when it is refreshed every day, but it lags for months on a loan
 *   or a move it never registered;
 * - the season statistics line: says where he played, not where he is;
 * - a place in a matchday squad (starter or bench), or on the injury
 *   list for a fixture of the club: dated, and current by construction.
 *
 * So: dated evidence from after the last transfer window closed wins,
 * the most recent first (nobody can move until the next window). With
 * none, the squad list decides, since a move may have followed the last
 * match he played. With no squad list at all, the latest dated evidence,
 * then a statistics line with appearances.
 */

export type ClubEvidence =
    | {kind: 'squad'; teamId: number}
    | {kind: 'line'; teamId: number; appearances: number}
    | {kind: 'played'; teamId: number; date: string}
    | {kind: 'sidelined'; teamId: number; date: string};

/** The day after the last transfer deadline (Italy and the big leagues: 1 September, 2 February), as YYYY-MM-DD. */
export function lastWindowClose(today: string): string {
    const year = Number(today.slice(0, 4));
    const monthDay = today.slice(5, 10);
    if (monthDay >= '09-02') return `${year}-09-02`;
    if (monthDay >= '02-03') return `${year}-02-03`;
    return `${year - 1}-09-02`;
}

export function resolveClub(evidence: ClubEvidence[], windowClosedAt: string): number | null {
    const dated = evidence
        .filter((e): e is Extract<ClubEvidence, {date: string}> => e.kind === 'played' || e.kind === 'sidelined')
        .sort((a, b) => b.date.localeCompare(a.date));
    const latest = dated[0];
    if (latest && latest.date >= windowClosedAt) return latest.teamId;

    const squads = evidence.filter((e) => e.kind === 'squad');
    if (squads.length > 0) {
        // Listed by more than one club: the one he has been seen with this season, else the first.
        const seen = squads.find((s) => dated.some((d) => d.teamId === s.teamId) || evidence.some((e) => e.kind === 'line' && e.appearances > 0 && e.teamId === s.teamId));
        return (seen ?? squads[0]).teamId;
    }
    if (latest) return latest.teamId;

    const line = evidence.filter((e): e is Extract<ClubEvidence, {kind: 'line'}> => e.kind === 'line' && e.appearances > 0).sort((a, b) => b.appearances - a.appearances)[0];
    return line?.teamId ?? null;
}
