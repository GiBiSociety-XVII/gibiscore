'use client';

import {useSyncExternalStore} from 'react';
import {CLOUD_KEY, PINS_KEY, ROSTER_KEY, STORAGE_KEY, TEAMS_KEY, normalizeConfig, normalizeSavedTeam, type AuctionConfig, type Purchase, type SavedTeam} from './config';

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
        .map((p) => ({playerId: p.playerId, price: Math.max(0, Math.round(p.price)), manager: typeof p.manager === 'number' ? p.manager : 0}));
}
export const purchasesStore = createJsonStore<Purchase[]>(ROSTER_KEY, parsePurchases, []);

/** The cloud row this device's auction is linked to, and when it was last saved there. */
export interface CloudLink {
    id: string;
    savedAt: string;
}
function parseCloudLink(raw: unknown): CloudLink | null {
    const r = raw as Partial<CloudLink> | null;
    return r && typeof r.id === 'string' && typeof r.savedAt === 'string' ? {id: r.id, savedAt: r.savedAt} : null;
}
export const cloudStore = createJsonStore<CloudLink | null>(CLOUD_KEY, parseCloudLink, null);

/** My teams across the fantasy leagues, for the lineup page, and the one being looked at. */
export interface SavedTeams {
    teams: SavedTeam[];
    current: string | null;
}
function parseTeams(raw: unknown): SavedTeams {
    const r = raw as Partial<SavedTeams> | null;
    const teams = Array.isArray(r?.teams) ? r!.teams.map(normalizeSavedTeam).filter((t): t is SavedTeam => t !== null).slice(0, 30) : [];
    return {teams, current: typeof r?.current === 'string' ? r.current : null};
}
export const teamsStore = createJsonStore<SavedTeams>(TEAMS_KEY, parseTeams, {teams: [], current: null});

/** Starters pinned by hand on the lineup page, player ids per saved team. */
export type LineupPins = Record<string, number[]>;
function parsePins(raw: unknown): LineupPins {
    if (!raw || typeof raw !== 'object') return {};
    return Object.fromEntries(Object.entries(raw as Record<string, unknown>).filter(([, v]) => Array.isArray(v)).map(([k, v]) => [k, (v as unknown[]).filter((id): id is number => typeof id === 'number' && Number.isInteger(id)).slice(0, 11)]));
}
export const pinsStore = createJsonStore<LineupPins>(PINS_KEY, parsePins, {});

const noop = () => () => {};
/** False during server render and hydration, true afterwards: lets the page wait for localStorage before choosing what to show. */
export function useHydrated(): boolean {
    return useSyncExternalStore(noop, () => true, () => false);
}
