'use client';

import {createContext, use, useEffect, useRef, useState} from "react";
import {useFormatter, useTranslations} from "next-intl";
import {Link, useRouter} from "@/i18n/navigation";
import {cn} from "@/components/shared/ui/cn";
import {isLater} from "@/lib/football/live";
import {scorersOf} from "@/lib/football/scorers";
import {LIVE_STATES, type FixtureState, type MatchLive as MatchLiveData} from "@/lib/football/types";
import {EventsTimeline} from "./events-timeline";
import {StatusBadge} from "./status-badge";

/**
 * The match page, kept moving without being fetched again.
 *
 * Everything on the page that changes while the ball rolls — the score,
 * the state and the minute, the scorers, the timeline — is drawn from
 * one small endpoint the browser asks every few seconds
 * (/api/matches/[id]/live), laid over what the server rendered by the
 * rule of lib/football/live: a reading is only ever replaced by a later
 * one. The page itself, heavy with lineups, statistics and ratings, is
 * rendered again only when something the patch cannot carry has changed
 * — a half begins or ends, an event appears — and never twice within
 * the minute.
 */

/** How often the browser asks for the state of the match, while the tab is in front. */
const POLL_MS = 8_000;
/** The whole page is rendered again no more often than this. */
const RENDER_AGAIN_MS = 45_000;
/** A failed ask is tried again this soon, once. */
const RETRY_MS = 3_000;
/** Before kick-off and after the final whistle the page still asks, for this long either way. */
const BEFORE_MS = 15 * 60_000;
const AFTER_MS = 5 * 3_600_000;

interface Shown {
    fixture: MatchLiveData['fixture'];
    events: MatchLiveData['events'];
    /** Kick-off, which never moves while the page is open: the state pill needs it. */
    startingAt: string;
}

const Live = createContext<Shown | null>(null);

function useShown(): Shown {
    const shown = use(Live);
    if (!shown) throw new Error('MatchLive missing');
    return shown;
}

const isLiveState = (state: string) => (LIVE_STATES as readonly string[]).includes(state);

/** True while the match can still move: in play, around kick-off, or just over. */
function worthAsking(state: string, startingAt: string): boolean {
    if (isLiveState(state)) return true;
    const from = Date.parse(startingAt);
    if (Number.isNaN(from)) return false;
    const now = Date.now();
    return now > from - BEFORE_MS && now < from + AFTER_MS;
}

export function MatchLive({seed, startingAt, children}: {seed: MatchLiveData; startingAt: string; children: React.ReactNode}) {
    const router = useRouter();
    const [got, setGot] = useState<MatchLiveData | null>(null);
    // The server's reading, unless the browser holds a later one.
    const shown = got && isLater(got.fixture, seed.fixture) ? got : seed;
    const renderedAt = useRef(0);
    const id = seed.fixture.id;
    const ask = worthAsking(shown.fixture.state, startingAt);

    useEffect(() => {
        if (!ask) return;
        let stopped = false;
        let asking = false;
        let retry: number | null = null;
        const controller = new AbortController();
        const soon = () => {
            if (stopped || retry !== null) return;
            retry = window.setTimeout(() => {
                retry = null;
                void tick();
            }, RETRY_MS);
        };
        const tick = async () => {
            if (stopped || asking || document.visibilityState !== 'visible') return;
            asking = true;
            try {
                const res = await fetch(`/api/matches/${id}/live`, {cache: 'no-store', signal: controller.signal});
                if (!res.ok) {
                    soon();
                    return;
                }
                const body = (await res.json()) as MatchLiveData;
                if (stopped || !body?.fixture) return;
                setGot((prev) => (isLater(body.fixture, prev?.fixture) ? body : prev));
            } catch {
                if (!stopped) soon();
            } finally {
                asking = false;
            }
        };
        const onVisible = () => {
            if (document.visibilityState === 'visible') void tick();
        };
        const timer = window.setInterval(() => void tick(), POLL_MS);
        document.addEventListener('visibilitychange', onVisible);
        void tick();
        return () => {
            stopped = true;
            controller.abort();
            window.clearInterval(timer);
            if (retry !== null) window.clearTimeout(retry);
            document.removeEventListener('visibilitychange', onVisible);
        };
    }, [ask, id]);

    // What the patch cannot carry — the lineups filling in, the statistics, the ratings,
    // the tabs the page opens on — comes with a fresh render, asked for sparingly.
    useEffect(() => {
        if (shown === seed) return;
        if (shown.fixture.state === seed.fixture.state && shown.events.length === seed.events.length) return;
        const now = Date.now();
        if (now - renderedAt.current < RENDER_AGAIN_MS) return;
        renderedAt.current = now;
        router.refresh();
    }, [shown, seed, router]);

    return <Live value={{fixture: shown.fixture, events: shown.events, startingAt}}>{children}</Live>;
}

/** The middle of the scoreboard: the score or the kick-off time, the state pill, the half-time score. */
export function LiveScoreline() {
    const {fixture, startingAt} = useShown();
    const t = useTranslations('Football.labels');
    const format = useFormatter();
    const live = isLiveState(fixture.state);
    const hasScore = fixture.homeScore !== null && fixture.awayScore !== null && fixture.state !== 'scheduled';
    return (
        <div className="flex flex-col items-center gap-1 px-2">
            <span className={cn("font-mono text-[40px] md:text-5xl font-bold tracking-tight tabular-nums leading-none px-2 rounded-lg", live && "bg-accent")}>
                {hasScore ? `${fixture.homeScore}-${fixture.awayScore}` : <span className="text-muted-foreground text-3xl">{format.dateTime(new Date(startingAt), {hour: '2-digit', minute: '2-digit'})}</span>}
            </span>
            <StatusBadge fixture={{state: fixture.state as FixtureState, minute: fixture.minute, extraMinute: fixture.extraMinute, syncedAt: fixture.syncedAt, startingAt}} />
            {fixture.homeScoreHt !== null && fixture.awayScoreHt !== null && (
                <span className="text-[11px] font-bold text-muted-foreground">{t('halfTimeScore', {home: fixture.homeScoreHt, away: fixture.awayScoreHt})}</span>
            )}
        </div>
    );
}

/** The goal lines under the scoreboard, one side each way round the ball. */
export function LiveScorers() {
    const {events} = useShown();
    const t = useTranslations('Football.events');
    const marks = {penalty: t('penaltyShort'), ownGoal: t('ownGoalShort')};
    const home = scorersOf(events, 'home', marks);
    const away = scorersOf(events, 'away', marks);
    if (home.length === 0 && away.length === 0) return null;
    const name = (s: {name: string; slug: string | null}) =>
        s.slug ? <Link href={`/players/${s.slug}`} className="text-foreground hover:underline decoration-accent decoration-2 underline-offset-2">{s.name}</Link> : <span className="text-foreground">{s.name}</span>;
    return (
        <div className="grid grid-cols-[minmax(0,1fr)_28px_minmax(0,1fr)] gap-2 px-3 pb-2 -mt-1 text-[11px] font-semibold text-muted-foreground">
            <ul className="flex flex-col items-end text-right">
                {home.map((s) => (
                    <li key={s.name} className="truncate max-w-full">
                        {name(s)} <span className="font-mono">{s.minutes.join(', ')}</span>
                    </li>
                ))}
            </ul>
            <span className="text-center" aria-hidden="true">⚽︎</span>
            <ul className="flex flex-col items-start">
                {away.map((s) => (
                    <li key={s.name} className="truncate max-w-full">
                        <span className="font-mono">{s.minutes.join(', ')}</span> {name(s)}
                    </li>
                ))}
            </ul>
        </div>
    );
}

/** What happened, above the tabs: it appears with the first event and grows as they come. */
export function LiveTimeline({title}: {title: string}) {
    const {events} = useShown();
    if (events.length === 0) return null;
    return (
        <div data-tour="timeline">
            <EventsTimeline events={events} title={title} />
        </div>
    );
}
