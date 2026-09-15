'use client';

import {parseManualVote, type ManualVote} from './recap';
import {useSyncExternalStore} from 'react';
import {BENCHED_KEY, CLOUD_KEY, HISTORY_KEY, LOCKS_KEY, VOTES_KEY, OUTS_KEY, PINS_KEY, ROSTER_KEY, STORAGE_KEY, TEAMS_KEY, normalizeConfig, normalizeSavedTeam, type AuctionConfig, type Purchase, type SavedTeam} from './config';

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
/** Players marked out by hand on the lineup page (the news is ahead of the data), player ids per saved team. */
export const outsStore = createJsonStore<LineupPins>(OUTS_KEY, parsePins, {});
/** Players sent to the bench by hand on the lineup page (swapped out for someone else), player ids per saved team. */
export const benchedStore = createJsonStore<LineupPins>(BENCHED_KEY, parsePins, {});

/**
 * The lineup as it stood before the round kicked off, per saved team: the
 * forecasts, the pins and outs and the forced formation of the last view
 * before the deadline, frozen from then until the next round.
 */
export interface LineupLock {
    round: string;
    /** The forecast model the snapshot was drawn with: an older one is drawn again rather than kept frozen. */
    model?: number;
    /** First kick-off of the round, ISO. */
    deadline: string;
    savedAt: string;
    /** Cheap hash of the content, to write only what changed. */
    fingerprint: string;
    forecasts: unknown[];
    forced: string | null;
    pinned: number[];
    outs: number[];
    benched?: number[];
}
export type LineupLocks = Record<string, LineupLock>;
function parseLocks(raw: unknown): LineupLocks {
    if (!raw || typeof raw !== 'object') return {};
    const out: LineupLocks = {};
    for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
        const l = v as Partial<LineupLock> | null;
        if (!l || typeof l.round !== 'string' || typeof l.deadline !== 'string' || !Array.isArray(l.forecasts)) continue;
        out[k] = {round: l.round, ...(typeof l.model === 'number' ? {model: l.model} : {}), deadline: l.deadline, savedAt: typeof l.savedAt === 'string' ? l.savedAt : l.deadline, fingerprint: typeof l.fingerprint === 'string' ? l.fingerprint : '', forecasts: l.forecasts, forced: typeof l.forced === 'string' ? l.forced : null, pinned: Array.isArray(l.pinned) ? l.pinned.filter((id): id is number => typeof id === 'number') : [], outs: Array.isArray(l.outs) ? l.outs.filter((id): id is number => typeof id === 'number') : [], benched: Array.isArray(l.benched) ? l.benched.filter((id): id is number => typeof id === 'number') : []};
    }
    return out;
}
export const locksStore = createJsonStore<LineupLocks>(LOCKS_KEY, parseLocks, {});

/** Rounds kept per team once played: the recap compares what was advised with what happened. */
export const HISTORY_ROUNDS = 6;
/** Per saved team, the locks of the last rounds, oldest first. */
export type LineupHistory = Record<string, LineupLock[]>;
function parseHistory(raw: unknown): LineupHistory {
    if (!raw || typeof raw !== 'object') return {};
    const out: LineupHistory = {};
    for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
        if (!Array.isArray(v)) continue;
        const locks = Object.values(parseLocks(Object.fromEntries(v.map((l, i) => [String(i), l]))));
        if (locks.length > 0) out[k] = locks.slice(-HISTORY_ROUNDS);
    }
    return out;
}
export const historyStore = createJsonStore<LineupHistory>(HISTORY_KEY, parseHistory, {});

/** Votes typed on this device: per "season:round", per player id. Shown at once; the account keeps them too. */
export type ManualVotes = Record<string, Record<number, ManualVote>>;
export const votesKey = (seasonId: number, round: string) => `${seasonId}:${round}`;
function parseVotes(raw: unknown): ManualVotes {
    if (!raw || typeof raw !== 'object') return {};
    const out: ManualVotes = {};
    for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
        if (!v || typeof v !== 'object') continue;
        const votes: Record<number, ManualVote> = {};
        for (const [id, m] of Object.entries(v as Record<string, unknown>)) {
            const vote = parseManualVote(m);
            if (vote && Number.isInteger(Number(id))) votes[Number(id)] = vote;
        }
        if (Object.keys(votes).length > 0) out[k] = votes;
    }
    return out;
}
export const votesStore = createJsonStore<ManualVotes>(VOTES_KEY, parseVotes, {});

const noop = () => () => {};
/** False during server render and hydration, true afterwards: lets the page wait for localStorage before choosing what to show. */
export function useHydrated(): boolean {
    return useSyncExternalStore(noop, () => true, () => false);
}
