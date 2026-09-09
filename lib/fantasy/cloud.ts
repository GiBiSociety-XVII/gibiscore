'use client';

import {createClient} from '@/lib/db/client';
import {normalizeConfig, type AuctionConfig, type Purchase} from './config';

/**
 * Auctions saved in the cloud for the signed-in user (table
 * fantasy_auctions, one row per auction, RLS on the user). Read and
 * written straight from the browser with the anon key: the session
 * cookie carries the user, the policies do the rest.
 */

export interface CloudAuction {
    id: string;
    name: string;
    league: string;
    updatedAt: string;
    purchasesCount: number;
}

export interface CloudUser {
    id: string;
    email: string | null;
}

export async function cloudUser(): Promise<CloudUser | null> {
    const {data} = await createClient().auth.getUser();
    return data.user ? {id: data.user.id, email: data.user.email ?? null} : null;
}

export async function listAuctions(): Promise<CloudAuction[]> {
    const {data, error} = await createClient().from('fantasy_auctions').select('id,name,league,updated_at,purchases').order('updated_at', {ascending: false}).limit(50);
    if (error) throw error;
    return (data ?? []).map((r) => ({id: r.id as string, name: r.name as string, league: r.league as string, updatedAt: r.updated_at as string, purchasesCount: Array.isArray(r.purchases) ? r.purchases.length : 0}));
}

/** Creates the auction (no id) or updates it; returns the id. */
export async function saveAuction(auction: {id: string | null; name: string; config: AuctionConfig; purchases: Purchase[]}, userId: string): Promise<string> {
    const db = createClient();
    const row = {name: auction.name, league: auction.config.league, config: auction.config, purchases: auction.purchases};
    if (auction.id) {
        const {data, error} = await db.from('fantasy_auctions').update(row).eq('id', auction.id).select('id').maybeSingle();
        if (error) throw error;
        if (data) return data.id as string;
        // Deleted elsewhere: saved again as a new one.
    }
    const {data, error} = await db.from('fantasy_auctions').insert({...row, user_id: userId}).select('id').single();
    if (error) throw error;
    return data.id as string;
}

export async function loadAuction(id: string): Promise<{config: AuctionConfig; purchases: Purchase[]} | null> {
    const {data, error} = await createClient().from('fantasy_auctions').select('config,purchases').eq('id', id).maybeSingle();
    if (error) throw error;
    if (!data) return null;
    const config = normalizeConfig(data.config);
    if (!config) return null;
    const purchases = (Array.isArray(data.purchases) ? data.purchases : [])
        .filter((p): p is Purchase => !!p && typeof p === 'object' && typeof (p as Purchase).playerId === 'number' && typeof (p as Purchase).price === 'number')
        .map((p) => ({playerId: p.playerId, price: p.price, manager: typeof p.manager === 'number' ? p.manager : 0}));
    return {config, purchases};
}

export async function deleteAuction(id: string): Promise<void> {
    const {error} = await createClient().from('fantasy_auctions').delete().eq('id', id);
    if (error) throw error;
}
