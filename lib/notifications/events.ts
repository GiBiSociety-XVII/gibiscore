import type {EventKind} from '@/lib/api-football/mappers';
import {LIVE_STATES, type FixtureState} from '@/lib/football/types';

/**
 * What a match can tell a fan who follows its competition or one of its
 * clubs: kick-off, half-time, full-time, every goal with who scored,
 * every red card, and the official lineups an hour before. Pure: the
 * live job feeds it what it knew of the match and what the provider just
 * said, and gets back the notifications to send, each with a key the
 * ledger (table notified) uses so nothing goes out twice.
 */
export type NotificationKind = 'kickoff' | 'half_time' | 'full_time' | 'goal' | 'red_card' | 'lineups';

export const NOTIFICATION_KINDS: readonly NotificationKind[] = ['kickoff', 'half_time', 'full_time', 'goal', 'red_card', 'lineups'];

export interface Candidate {
    kind: NotificationKind;
    /** Unique per fixture: the same key is never sent twice. */
    key: string;
    title: string;
    body: string;
}

/** What the database knew of the match before this pass; null when it never saw it. */
export interface Previous {
    state: FixtureState;
    homeScore: number | null;
    awayScore: number | null;
}

export interface MatchEvent {
    kind: EventKind;
    teamProviderId: number | null;
    minute: number | null;
    extraMinute: number | null;
    player: string | null;
}

/** The match as the provider just described it. */
export interface MatchFacts {
    home: string;
    away: string;
    homeProviderId: number;
    league: string;
    state: FixtureState;
    minute: number | null;
    homeScore: number | null;
    awayScore: number | null;
    events: MatchEvent[];
}

/**
 * A goal or a card older than this, in match minutes, is not news: the
 * first pass after a deploy sees every event of a match already on, and
 * a feed that lists them all again must not resend the first half.
 */
const FRESH_MINUTES = 12;

const isLive = (state: FixtureState) => (LIVE_STATES as readonly FixtureState[]).includes(state);
const score = (f: MatchFacts) => `${f.home} ${f.homeScore ?? 0}-${f.awayScore ?? 0} ${f.away}`;
const clock = (e: MatchEvent) => `${e.minute ?? 0}${e.extraMinute ? `+${e.extraMinute}` : ''}'`;

/**
 * The notifications a pass of the live job owes for this match: state
 * changes against what was known, goals and red cards fresh enough to
 * be news. Nothing for a match never seen before: the first sight of a
 * match already on would report its whole first half.
 */
export function detectChanges(prev: Previous | null, f: MatchFacts): Candidate[] {
    if (!prev) return [];
    const out: Candidate[] = [];
    if (prev.state === 'scheduled' && isLive(f.state)) out.push({kind: 'kickoff', key: 'kickoff', title: `Calcio d'inizio: ${f.home} – ${f.away}`, body: f.league});
    if (f.state === 'half_time' && prev.state !== 'half_time') out.push({kind: 'half_time', key: 'half_time', title: `Fine primo tempo: ${score(f)}`, body: f.league});
    if (f.state === 'finished' && isLive(prev.state)) out.push({kind: 'full_time', key: 'full_time', title: `Finale: ${score(f)}`, body: f.league});

    if (isLive(f.state) || f.state === 'finished') {
        const now = f.minute ?? (f.state === 'finished' ? 90 : 0);
        for (const e of f.events) {
            const minute = e.minute ?? 0;
            if (minute < now - FRESH_MINUTES) continue;
            const scorer = e.teamProviderId === f.homeProviderId ? f.home : f.away;
            const who = e.player ?? '';
            if (e.kind === 'goal' || e.kind === 'penalty' || e.kind === 'own_goal') {
                const how = e.kind === 'penalty' ? ' su rigore' : e.kind === 'own_goal' ? ' (autogol)' : '';
                out.push({
                    kind: 'goal',
                    key: `goal:${e.teamProviderId ?? 0}:${minute}+${e.extraMinute ?? 0}:${who}`,
                    title: `⚽ Gol ${scorer}${how}! ${score(f)}`,
                    body: `${clock(e)} ${who}${who ? ' · ' : ''}${f.league}`,
                });
            } else if (e.kind === 'red_card' || e.kind === 'yellow_red_card') {
                out.push({
                    kind: 'red_card',
                    key: `red:${e.teamProviderId ?? 0}:${minute}:${who}`,
                    title: `🟥 Espulso ${who || scorer}${who ? ` (${scorer})` : ''}`,
                    body: `${clock(e)} · ${score(f)}`,
                });
            }
        }
    }
    return out;
}

/** The official lineups are out: one notification per match, an hour or so before kick-off. */
export function lineupsCandidate(f: Pick<MatchFacts, 'home' | 'away' | 'league'>): Candidate {
    return {kind: 'lineups', key: 'lineups', title: `Formazioni ufficiali: ${f.home} – ${f.away}`, body: f.league};
}
