import type {EventKind} from '@/lib/api-football/mappers';
import {LIVE_STATES, type FixtureState} from '@/lib/football/types';
import {routing, type AppLocale} from '@/i18n/routing';

/**
 * What a match can tell a fan who follows its competition or one of its
 * clubs: kick-off, half-time, full-time, every goal with who scored,
 * every red card, and the official lineups an hour before. Pure: the
 * live job feeds it what it knew of the match and what the provider just
 * said, and gets back the notifications to send, each with a key the
 * ledger (table notified) uses so nothing goes out twice.
 */
export type NotificationKind = 'kickoff' | 'half_time' | 'full_time' | 'goal' | 'red_card' | 'lineups' | 'reminder' | 'schedina' | 'digest';

export const NOTIFICATION_KINDS: readonly NotificationKind[] = ['reminder', 'lineups', 'kickoff', 'goal', 'red_card', 'half_time', 'full_time', 'digest', 'schedina'];

/** The same notification in every language of the site: the browser's own is picked when it is sent. */
export type Localized = Record<AppLocale, {title: string; body: string}>;

export interface Candidate {
    kind: NotificationKind;
    /** Unique per fixture: the same key is never sent twice. */
    key: string;
    text: Localized;
}

/** The words of the notifications, per language: they are built outside the pages, with no translation layer. */
const WORDS = {
    it: {kickoff: "Calcio d'inizio", halfTime: 'Fine primo tempo', fullTime: 'Finale', goal: 'Gol', penalty: ' su rigore', ownGoal: ' (autogol)', sentOff: 'Espulso', inAnHour: "Tra un'ora", lineups: 'Formazioni ufficiali'},
    en: {kickoff: 'Kick-off', halfTime: 'Half time', fullTime: 'Full time', goal: 'Goal', penalty: ' (penalty)', ownGoal: ' (own goal)', sentOff: 'Sent off', inAnHour: 'In an hour', lineups: 'Official lineups'},
} as const satisfies Record<AppLocale, Record<string, string>>;

type Words = (typeof WORDS)[AppLocale];

/** The same text written once per language. */
export function localize(make: (w: Words, locale: AppLocale) => {title: string; body: string}): Localized {
    const out = {} as Localized;
    for (const locale of routing.locales) out[locale] = make(WORDS[locale], locale);
    return out;
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
    if (prev.state === 'scheduled' && isLive(f.state)) out.push({kind: 'kickoff', key: 'kickoff', text: localize((w) => ({title: `${w.kickoff}: ${f.home} – ${f.away}`, body: f.league}))});
    if (f.state === 'half_time' && prev.state !== 'half_time') out.push({kind: 'half_time', key: 'half_time', text: localize((w) => ({title: `${w.halfTime}: ${score(f)}`, body: f.league}))});
    if (f.state === 'finished' && isLive(prev.state)) out.push({kind: 'full_time', key: 'full_time', text: localize((w) => ({title: `${w.fullTime}: ${score(f)}`, body: f.league}))});

    if (isLive(f.state) || f.state === 'finished') {
        const now = f.minute ?? (f.state === 'finished' ? 90 : 0);
        for (const e of f.events) {
            const minute = e.minute ?? 0;
            if (minute < now - FRESH_MINUTES) continue;
            const scorer = e.teamProviderId === f.homeProviderId ? f.home : f.away;
            const who = e.player ?? '';
            if (e.kind === 'goal' || e.kind === 'penalty' || e.kind === 'own_goal') {
                out.push({
                    kind: 'goal',
                    key: `goal:${e.teamProviderId ?? 0}:${minute}+${e.extraMinute ?? 0}:${who}`,
                    text: localize((w) => ({
                        title: `⚽ ${w.goal} ${scorer}${e.kind === 'penalty' ? w.penalty : e.kind === 'own_goal' ? w.ownGoal : ''}! ${score(f)}`,
                        body: `${clock(e)} ${who}${who ? ' · ' : ''}${f.league}`,
                    })),
                });
            } else if (e.kind === 'red_card' || e.kind === 'yellow_red_card') {
                out.push({
                    kind: 'red_card',
                    key: `red:${e.teamProviderId ?? 0}:${minute}:${who}`,
                    text: localize((w) => ({title: `🟥 ${w.sentOff} ${who || scorer}${who ? ` (${scorer})` : ''}`, body: `${clock(e)} · ${score(f)}`})),
                });
            }
        }
    }
    return out;
}

/** Kick-off in an hour: one notification per match, with the time (always the Italian clock, where the matches are played). */
export function reminderCandidate(f: Pick<MatchFacts, 'home' | 'away' | 'league'>, startingAt: string): Candidate {
    return {
        kind: 'reminder',
        key: 'reminder',
        text: localize((w, locale) => ({
            title: `${w.inAnHour}: ${f.home} – ${f.away}`,
            body: `${new Intl.DateTimeFormat(locale, {timeZone: 'Europe/Rome', hour: '2-digit', minute: '2-digit'}).format(new Date(startingAt))} · ${f.league}`,
        })),
    };
}

/** The official lineups are out: one notification per match, an hour or so before kick-off. */
export function lineupsCandidate(f: Pick<MatchFacts, 'home' | 'away' | 'league'>): Candidate {
    return {kind: 'lineups', key: 'lineups', text: localize((w) => ({title: `${w.lineups}: ${f.home} – ${f.away}`, body: f.league}))};
}
