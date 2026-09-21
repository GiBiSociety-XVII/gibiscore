'use client';

import {useCallback, useEffect, useMemo, useRef, useState} from "react";
import {isLater, mergeLive, type LiveFixture} from "@/lib/football/live";

/**
 * The live half of a page, read from the server and never allowed to go
 * backwards.
 *
 * The page the server rendered is the seed; every few seconds the
 * browser asks one small endpoint for the state, minute and score of the
 * same matches and lays over it whatever is later (lib/football/live).
 * Because the merge is by stamp and not by arrival, none of the caches
 * in between can undo a score that is already on the screen: a render
 * that is seconds old, an edge node still holding the previous answer,
 * two answers that cross — all of them are simply older readings, and
 * older readings are dropped.
 *
 * One request every few seconds per open tab, of a few kilobytes, and
 * the endpoints hold their answer for a handful of seconds: a thousand
 * tabs cost the database the same as one.
 */

const NOTHING: ReadonlyMap<number, LiveFixture> = new Map();

export interface LivePollOptions {
    /** Where to ask. Null while there is nothing to ask for. */
    url: string | null;
    /** The rows the server rendered: the floor every answer is laid over. */
    seed: LiveFixture[];
    /** How often to ask, while the tab is in front. */
    everyMs: number;
    /** Called after every answer, with what it said: for what the merge cannot carry. */
    onAnswer?: (fixtures: LiveFixture[]) => void;
}

/** A failed ask (offline, a 503) is tried again this soon, once, then on the next tick. */
const RETRY_MS = 3_000;

export function useLiveFixtures({url, seed, everyMs, onAnswer}: LivePollOptions): ReadonlyMap<number, LiveFixture> {
    const [polled, setPolled] = useState<ReadonlyMap<number, LiveFixture>>(NOTHING);

    // The rows on the page and the caller's hand-back, as they are now: the timer
    // must not start over because the server rendered the page again.
    const latest = useRef<{ids: Set<number>; onAnswer: LivePollOptions['onAnswer']}>({ids: new Set(), onAnswer: undefined});
    useEffect(() => {
        latest.current = {ids: new Set(seed.map((f) => f.id)), onAnswer};
    });

    const take = useCallback((fixtures: LiveFixture[]) => {
        setPolled((prev) => {
            const next = mergeLive(prev, fixtures);
            if (next === prev) return prev;
            // Bounded: what the answer still lists, plus what the page is still showing.
            const keep = new Set(fixtures.map((f) => f.id));
            let trimmed: Map<number, LiveFixture> | null = null;
            for (const id of next.keys()) {
                if (keep.has(id) || latest.current.ids.has(id)) continue;
                trimmed ??= new Map(next);
                trimmed.delete(id);
            }
            return trimmed ?? next;
        });
        latest.current.onAnswer?.(fixtures);
    }, []);

    useEffect(() => {
        if (!url) return;
        let stopped = false;
        let asking = false;
        let retry: number | null = null;
        const controller = new AbortController();
        const soon = () => {
            if (stopped || retry !== null) return;
            retry = window.setTimeout(() => {
                retry = null;
                void ask();
            }, RETRY_MS);
        };
        const ask = async () => {
            if (stopped || asking || document.visibilityState !== 'visible') return;
            asking = true;
            try {
                const res = await fetch(url, {cache: 'no-store', signal: controller.signal});
                if (!res.ok) {
                    soon();
                    return;
                }
                const body = (await res.json()) as {fixtures?: LiveFixture[]};
                if (stopped || !Array.isArray(body.fixtures)) return;
                take(body.fixtures);
            } catch {
                // Offline, a hiccup, the page going away: tried again shortly, then on the next tick.
                if (!stopped) soon();
            } finally {
                asking = false;
            }
        };
        const onVisible = () => {
            if (document.visibilityState === 'visible') void ask();
        };
        const id = window.setInterval(() => void ask(), everyMs);
        document.addEventListener('visibilitychange', onVisible);
        void ask();
        return () => {
            stopped = true;
            controller.abort();
            window.clearInterval(id);
            if (retry !== null) window.clearTimeout(retry);
            document.removeEventListener('visibilitychange', onVisible);
        };
    }, [url, everyMs, take]);

    // The server's rows with every later reading laid over them: the seed can be stale, the answer cannot lose.
    return useMemo(() => {
        if (polled.size === 0) return NOTHING;
        const over = new Map<number, LiveFixture>();
        for (const f of seed) {
            const patch = polled.get(f.id);
            if (patch && isLater(patch, f)) over.set(f.id, patch);
        }
        return over;
    }, [seed, polled]);
}
