'use client';

import {useSyncExternalStore} from "react";
import type {FixtureState} from "@/lib/football/types";

/**
 * Minute of a live match that keeps moving between two syncs. The
 * server renders the stored minute; once hydrated the client adds the
 * time elapsed since the live sync wrote the row, capped at the end of
 * the period (45+, 90+, 105+, 120+) unless the provider's stoppage time
 * is known ("90+3"). Ticks every ten seconds.
 */

const TICK_MS = 10_000;
/** Never drift more than this past the stored minute: a stalled sync must not keep counting. */
const MAX_DRIFT_MIN = 6;

let listeners: Array<() => void> = [];
let timer: number | null = null;
const subscribe = (cb: () => void) => {
    listeners.push(cb);
    if (timer === null) timer = window.setInterval(() => listeners.forEach((l) => l()), TICK_MS);
    return () => {
        listeners = listeners.filter((l) => l !== cb);
        if (listeners.length === 0 && timer !== null) {
            window.clearInterval(timer);
            timer = null;
        }
    };
};
const getNow = () => Math.floor(Date.now() / TICK_MS) * TICK_MS;
const getServerNow = () => null;

export interface LiveMinuteInput {
    state: FixtureState;
    minute: number | null;
    extraMinute?: number | null;
    syncedAt?: string | null;
}

/** "67", "45+", "90+3": the minute label without the apostrophe. */
export function minuteLabel(input: LiveMinuteInput, now: number | null): string | null {
    if (input.minute === null) return null;
    const stored = input.minute;
    const synced = input.syncedAt ? Date.parse(input.syncedAt) : NaN;
    const drift = now !== null && Number.isFinite(synced) ? Math.min(MAX_DRIFT_MIN, Math.max(0, Math.floor((now - synced) / 60_000))) : 0;
    // Known stoppage time: keep counting inside it.
    if (input.extraMinute) return `${stored}+${input.extraMinute + drift}`;
    const cap = input.state === 'extra_time' ? (stored <= 105 ? 105 : 120) : stored <= 45 ? 45 : 90;
    const estimate = stored + drift;
    if (estimate > cap) return `${cap}+`;
    return String(estimate);
}

export function LiveMinute({fixture, fallback}: {fixture: LiveMinuteInput; fallback: string}) {
    const now = useSyncExternalStore(subscribe, getNow, getServerNow);
    const label = minuteLabel(fixture, now);
    return <>{label === null ? fallback : `${label}'`}</>;
}
