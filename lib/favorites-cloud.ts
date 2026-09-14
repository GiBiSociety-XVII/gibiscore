'use client';

import {createClient} from '@/lib/db/client';

/** A signed-in user's favourites in the account (table user_favorites, one row per user, RLS on the user). */
export interface AccountFavorites {
    competitions: string[];
    teams: string[];
    updatedAt: string | null;
}

const slugs = (v: unknown, limit: number): string[] => (Array.isArray(v) ? [...new Set(v.filter((s): s is string => typeof s === 'string'))].slice(0, limit) : []);

/** The signed-in user's id from the session on the device: no request, null when signed out. */
export async function sessionUserId(): Promise<string | null> {
    const {data} = await createClient().auth.getSession();
    return data.session?.user.id ?? null;
}

export async function loadAccountFavorites(): Promise<AccountFavorites | null> {
    const {data, error} = await createClient().from('user_favorites').select('competitions,teams,updated_at').maybeSingle();
    if (error) throw error;
    if (!data) return null;
    return {competitions: slugs(data.competitions, 20), teams: slugs(data.teams, 30), updatedAt: (data.updated_at as string | null) ?? null};
}

export async function saveAccountFavorites(userId: string, favorites: {competitions: readonly string[]; teams: readonly string[]}): Promise<void> {
    const {error} = await createClient().from('user_favorites').upsert({user_id: userId, competitions: favorites.competitions, teams: favorites.teams}, {onConflict: 'user_id'});
    if (error) throw error;
}
