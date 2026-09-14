'use client';

import {useCallback, useSyncExternalStore} from 'react';

/**
 * Favourites kept in the browser: competitions and teams, as slugs in
 * the order the user added them. Signed in, they follow the account
 * (components/shell/account-favorites-sync.tsx reads and writes these
 * stores), so every device shows the same.
 */
const EMPTY: readonly string[] = [];

export interface FavoritesStore {
    read(): readonly string[];
    write(next: readonly string[]): void;
    subscribe(callback: () => void): () => void;
}

function createStore(key: string, limit: number): FavoritesStore & {useStore: () => {favorites: readonly string[]; toggle: (slug: string) => void; set: (slugs: string[]) => void; isFavorite: (slug: string) => boolean}} {
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
        cached = [...new Set(next)].slice(0, limit);
        try {
            window.localStorage.setItem(key, JSON.stringify(cached));
        } catch {
            // private mode or storage disabled: the choice lives for this page only
        }
        window.dispatchEvent(new Event(EVENT));
    }

    function subscribe(callback: () => void) {
        const onStorage = (e: StorageEvent) => {
            if (e.key === key) {
                cached = null;
                callback();
            }
        };
        window.addEventListener(EVENT, callback);
        window.addEventListener('storage', onStorage);
        return () => {
            window.removeEventListener(EVENT, callback);
            window.removeEventListener('storage', onStorage);
        };
    }

    function useStore() {
        const items = useSyncExternalStore(subscribe, read, () => EMPTY);
        const toggle = useCallback((slug: string) => {
            const current = read();
            write(current.includes(slug) ? current.filter((s) => s !== slug) : [...current, slug]);
        }, []);
        const set = useCallback((slugs: string[]) => write(slugs), []);
        return {favorites: items, toggle, set, isFavorite: (slug: string) => items.includes(slug)};
    }

    return {read, write, subscribe, useStore};
}

const competitions = createStore('gibiscore:favorites', 20);
const teams = createStore('gibiscore:favorite-teams', 30);

/** Favourite competitions (home rail tables, "Preferiti" group in the scores list). */
export const useFavorites = competitions.useStore;
/** Favourite teams ("Le mie squadre" in the home rail, highlighted rows). */
export const useFavoriteTeams = teams.useStore;

/** The stores themselves, for the account sync. */
export const favoriteCompetitionsStore: FavoritesStore = competitions;
export const favoriteTeamsStore: FavoritesStore = teams;
