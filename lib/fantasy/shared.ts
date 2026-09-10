import type {Purchase} from './config';

/**
 * A fantasy auction shared with the group by link: what the
 * shared_auction() function returns, read on the server for the page and
 * from the browser to refresh it. No strategy, no targets: the table's
 * settings and the purchases only.
 */
/** What the group sees of a shared auction: the table's settings, never the owner's strategy. */
export interface SharedAuction {
    name: string;
    league: string;
    managers: string[];
    credits: number;
    participants: number;
    slots: Record<'P' | 'D' | 'C' | 'A', number>;
    mode: string;
    purchases: Purchase[];
    updatedAt: string;
}

export function parseShared(row: unknown): SharedAuction | null {
    const r = row as {name?: unknown; league?: unknown; config?: Record<string, unknown>; purchases?: unknown; updated_at?: unknown} | null;
    if (!r || typeof r.name !== 'string' || typeof r.league !== 'string' || !r.config) return null;
    const c = r.config;
    const slots = c.slots as Partial<Record<'P' | 'D' | 'C' | 'A', number>> | undefined;
    const purchases = (Array.isArray(r.purchases) ? r.purchases : [])
        .filter((p): p is Purchase => !!p && typeof p === 'object' && typeof (p as Purchase).playerId === 'number' && typeof (p as Purchase).price === 'number')
        .map((p) => ({playerId: p.playerId, price: p.price, manager: typeof p.manager === 'number' ? p.manager : 0}));
    return {
        name: r.name,
        league: r.league,
        managers: Array.isArray(c.managers) ? c.managers.filter((m): m is string => typeof m === 'string') : [],
        credits: typeof c.credits === 'number' ? c.credits : 500,
        participants: typeof c.participants === 'number' ? c.participants : 8,
        slots: {P: slots?.P ?? 3, D: slots?.D ?? 8, C: slots?.C ?? 8, A: slots?.A ?? 6},
        mode: typeof c.mode === 'string' ? c.mode : 'classic',
        purchases,
        updatedAt: typeof r.updated_at === 'string' ? r.updated_at : new Date().toISOString(),
    };
}

