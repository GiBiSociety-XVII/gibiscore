'use client';

import {useCallback, useSyncExternalStore} from 'react';

/**
 * Favourites kept in the browser (no account needed): competitions and
 * teams, as slugs in the order the user added them. When accounts arrive
 * these stores are the place to sync from.
 */
const EMPTY: readonly string[] = [];

function createStore(key: string, limit: number) {
    const EVENT = `${key}:changed`;
    let cached: readonly string[] | null = null;

    function read(): readonly string[] {
        if (cached) return cached;
        try {
            const raw = window.localStorage.getItem(key);
            const parsed = raw ? (JSON.parse(raw) as unknown) : [];
            cached = Array.isArray(parsed) ? parsed.filter((s): s is string => typeof s === 'string').slice(0, limit) : EMPTY;
        } catch {
            cached = EMPTY;
        }
        return cached;
    }

    function write(next: readonly string[]) {
        cached = next.slice(0, limit);
        try {
            window.localStorage.setItem(key, JSON.stringify(cached));
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

    return function useStore() {
        const items = useSyncExternalStore(subscribe, read, () => EMPTY);
        const toggle = useCallback((slug: string) => {
            const current = read();
            write(current.includes(slug) ? current.filter((s) => s !== slug) : [...current, slug]);
        }, []);
        const set = useCallback((slugs: string[]) => write(slugs), []);
        return {favorites: items, toggle, set, isFavorite: (slug: string) => items.includes(slug)};
    };
}

/** Favourite competitions (home rail tables, "Preferiti" group in the scores list). */
export const useFavorites = createStore('gibiscore:favorites', 20);

/** Favourite teams ("Le mie squadre" in the home rail, highlighted rows). */
export const useFavoriteTeams = createStore('gibiscore:favorite-teams', 30);
