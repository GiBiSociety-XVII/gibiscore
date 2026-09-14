'use client';

import {createClient} from '@/lib/db/client';
import {normalizeSavedTeam, type SavedTeam} from './config';
import type {LineupLock} from './store';

/**
 * A signed-in user's fantasy teams in the account (table fantasy_teams,
 * one row per team, RLS on the user): the roster with the league's
 * settings, the pins and outs of the lineup page and the lineup frozen
 * at kick-off. Read and written from the browser with the anon key.
 */

export interface AccountTeam {
    id: string;
    team: SavedTeam;
    pins: number[];
    outs: number[];
    lock: LineupLock | null;
    updatedAt: string;
}

const ids = (v: unknown): number[] => (Array.isArray(v) ? v.filter((id): id is number => typeof id === 'number' && Number.isInteger(id)) : []);

function parseLock(raw: unknown): LineupLock | null {
    const l = raw as Partial<LineupLock> | null;
    if (!l || typeof l.round !== 'string' || typeof l.deadline !== 'string' || !Array.isArray(l.forecasts)) return null;
    return {round: l.round, ...(typeof l.model === 'number' ? {model: l.model} : {}), deadline: l.deadline, savedAt: typeof l.savedAt === 'string' ? l.savedAt : l.deadline, fingerprint: typeof l.fingerprint === 'string' ? l.fingerprint : '', forecasts: l.forecasts, forced: typeof l.forced === 'string' ? l.forced : null, pinned: ids(l.pinned), outs: ids(l.outs)};
}

export async function listAccountTeams(): Promise<AccountTeam[]> {
    const {data, error} = await createClient().from('fantasy_teams').select('id,team,pins,outs,lock,updated_at').order('updated_at', {ascending: false}).limit(50);
    if (error) throw error;
    const rows: AccountTeam[] = [];
    for (const r of data ?? []) {
        const team = normalizeSavedTeam(r.team);
        if (!team) continue;
        rows.push({id: r.id as string, team, pins: ids(r.pins), outs: ids(r.outs), lock: parseLock(r.lock), updatedAt: r.updated_at as string});
    }
    return rows;
}

export async function saveAccountTeam(userId: string, row: Omit<AccountTeam, 'updatedAt'>): Promise<void> {
    const {error} = await createClient().from('fantasy_teams').upsert({user_id: userId, id: row.id, team: row.team, pins: row.pins, outs: row.outs, lock: row.lock}, {onConflict: 'user_id,id'});
    if (error) throw error;
}

export async function deleteAccountTeam(id: string): Promise<void> {
    const {error} = await createClient().from('fantasy_teams').delete().eq('id', id);
    if (error) throw error;
}
