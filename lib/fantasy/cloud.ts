'use client';

import {createClient} from '@/lib/db/client';
import {normalizeConfig, type AuctionConfig, type Purchase} from './config';
import {parseShared, type SharedAuction} from './shared';

export type {SharedAuction};

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
    /** Set when the auction is shared by link. */
    shareToken: string | null;
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
    const {data, error} = await createClient().from('fantasy_auctions').select('id,name,league,updated_at,purchases,share_token').order('updated_at', {ascending: false}).limit(50);
    if (error) throw error;
    return (data ?? []).map((r) => ({id: r.id as string, name: r.name as string, league: r.league as string, updatedAt: r.updated_at as string, purchasesCount: Array.isArray(r.purchases) ? r.purchases.length : 0, shareToken: (r.share_token as string | null) ?? null}));
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

/** Opens the auction to the group: a new token, or the one it has. Returns the token. */
export async function shareAuction(id: string): Promise<string> {
    const db = createClient();
    const {data: current, error: readError} = await db.from('fantasy_auctions').select('share_token').eq('id', id).maybeSingle();
    if (readError) throw readError;
    if (current?.share_token) return current.share_token as string;
    const token = crypto.randomUUID();
    const {error} = await db.from('fantasy_auctions').update({share_token: token}).eq('id', id);
    if (error) throw error;
    return token;
}

/** Closes the link: whoever has it sees nothing any more. */
export async function unshareAuction(id: string): Promise<void> {
    const {error} = await createClient().from('fantasy_auctions').update({share_token: null}).eq('id', id);
    if (error) throw error;
}

/** The shared auction behind a token, from the browser. */
export async function loadShared(token: string): Promise<SharedAuction | null> {
    const {data, error} = await createClient().rpc('shared_auction', {token});
    if (error) throw error;
    const row = Array.isArray(data) ? data[0] : data;
    return row ? parseShared(row) : null;
}
