'use client';

import {useSyncExternalStore} from 'react';
import {ROSTER_KEY, STORAGE_KEY, normalizeConfig, type AuctionConfig, type Purchase} from './config';

/**
 * Auction state on the device: settings and purchases in localStorage,
 * read through useSyncExternalStore so server and client render the
 * same first frame (the server snapshot is the empty value).
 */

function createJsonStore<T>(key: string, parse: (raw: unknown) => T, empty: T) {
    const EVENT = `${key}:changed`;
    let cached: {value: T} | null = null;

    const read = (): T => {
        if (cached) return cached.value;
        let value = empty;
        try {
            const raw = window.localStorage.getItem(key);
            if (raw) value = parse(JSON.parse(raw));
        } catch {
            value = empty;
        }
        cached = {value};
        return value;
    };
    const write = (value: T) => {
        cached = {value};
        try {
            window.localStorage.setItem(key, JSON.stringify(value));
        } catch {
            // Private mode or full storage: keep the in-memory value.
        }
        window.dispatchEvent(new Event(EVENT));
    };
    const subscribe = (cb: () => void) => {
        const onStorage = (e: StorageEvent) => {
            if (e.key === key) {
                cached = null;
                cb();
            }
        };
        window.addEventListener(EVENT, cb);
        window.addEventListener('storage', onStorage);
        return () => {
            window.removeEventListener(EVENT, cb);
            window.removeEventListener('storage', onStorage);
        };
    };
    const useValue = () => useSyncExternalStore(subscribe, read, () => empty);
    return {read, write, subscribe, useValue};
}

export const configStore = createJsonStore<AuctionConfig | null>(STORAGE_KEY, (raw) => normalizeConfig(raw), null);

function parsePurchases(raw: unknown): Purchase[] {
    if (!Array.isArray(raw)) return [];
    return raw
        .filter((p): p is Purchase => !!p && typeof p === 'object' && typeof (p as Purchase).playerId === 'number' && typeof (p as Purchase).price === 'number')
        .map((p) => ({playerId: p.playerId, price: Math.max(1, Math.round(p.price)), manager: typeof p.manager === 'number' ? p.manager : 0}));
}
export const purchasesStore = createJsonStore<Purchase[]>(ROSTER_KEY, parsePurchases, []);

const noop = () => () => {};
/** False during server render and hydration, true afterwards: lets the page wait for localStorage before choosing what to show. */
export function useHydrated(): boolean {
    return useSyncExternalStore(noop, () => true, () => false);
}
