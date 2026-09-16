import 'server-only';
import {revalidateTag} from 'next/cache';
import {createServiceClient} from '@/lib/db/server';
import {fantaDisplayName} from './fanta-name';

/**
 * Players named the fantasy way: for every match between a fantasy name
 * (the list, a votes workbook) and a player, the fantasy name is kept
 * on the row and the display name follows it. Only the rows that change
 * are written; the caches that carry names are refreshed when any did.
 */
export async function applyFantaNames(matches: Array<{id: number; fantaName: string; name: string; fanta: string | null}>): Promise<number> {
    const changes = matches
        .map((m) => ({id: m.id, fanta: m.fantaName.trim(), name: fantaDisplayName(m.fantaName, m.name)}))
        .filter((m, i) => m.fanta !== '' && (m.name !== matches[i].name || m.fanta !== matches[i].fanta));
    if (changes.length === 0) return 0;
    const db = createServiceClient();
    for (let i = 0; i < changes.length; i += 20) {
        await Promise.all(changes.slice(i, i + 20).map(async (c) => {
            const {error} = await db.from('players').update({fanta_name: c.fanta, name: c.name}).eq('id', c.id);
            if (error) throw error;
        }));
    }
    for (const tag of ['fantasy-votes', 'fantasy-matchday', 'fantasy-pool']) revalidateTag(tag, {expire: 0});
    return changes.length;
}
