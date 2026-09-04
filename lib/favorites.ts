'use client';

import {useCallback, useSyncExternalStore} from 'react';

/**
 * Favourite competitions, kept in the browser (no account needed). Slugs
 * in the order the user added them. When accounts arrive this store is
 * the place to sync from.
 */
const KEY = 'gibiscore:favorites';
const EVENT = 'gibiscore:favorites-changed';
const EMPTY: readonly string[] = [];
let cached: readonly string[] | null = null;

function read(): readonly string[] {
    if (cached) return cached;
    try {
        const raw = window.localStorage.getItem(KEY);
        const parsed = raw ? (JSON.parse(raw) as unknown) : [];
        cached = Array.isArray(parsed) ? parsed.filter((s): s is string => typeof s === 'string').slice(0, 20) : EMPTY;
    } catch {
        cached = EMPTY;
    }
    return cached;
}

function write(next: readonly string[]) {
    cached = next;
    try {
        window.localStorage.setItem(KEY, JSON.stringify(next));
    } catch {
        // private mode or storage disabled: the choice lives for this page only
    }
    window.dispatchEvent(new Event(EVENT));
}

function subscribe(callback: () => void) {
    window.addEventListener(EVENT, callback);
    window.addEventListener('storage', callback);
    return () => {
        window.removeEventListener(EVENT, callback);
        window.removeEventListener('storage', callback);
    };
}

export function useFavorites() {
    const favorites = useSyncExternalStore(subscribe, read, () => EMPTY);
    const toggle = useCallback((slug: string) => {
        const current = read();
        write(current.includes(slug) ? current.filter((s) => s !== slug) : [...current, slug]);
    }, []);
    const set = useCallback((slugs: string[]) => write(slugs), []);
    return {favorites, toggle, set, isFavorite: (slug: string) => favorites.includes(slug)};
}
