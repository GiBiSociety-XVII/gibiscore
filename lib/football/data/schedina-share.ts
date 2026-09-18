import 'server-only';
import type {Ticket} from '@/components/football/schedina-ticket';
import {footballDb, logReadError} from './shared';

/** A shared slip by its token, as the ticket shows it; null when the token is unknown. Nothing about the owner. */
export async function getSharedSchedina(token: string): Promise<Ticket | null> {
    if (!/^[a-f0-9]{16,64}$/.test(token)) return null;
    try {
        const {data, error} = await footballDb().rpc('schedina_by_token', {token});
        if (error) throw error;
        const row = (Array.isArray(data) ? data[0] : data) as Record<string, unknown> | undefined;
        if (!row) return null;
        const num = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v));
        return {
            id: row.id as number,
            kind: row.kind as Ticket['kind'],
            risk: row.risk as Ticket['risk'],
            size: row.size as number,
            systemOf: (row.system_of as number | null) ?? null,
            selections: row.selections as Ticket['selections'],
            pct: row.pct as number,
            fair: Number(row.fair),
            book: num(row.book),
            stake: num(row.stake),
            payout: num(row.payout),
            lines: (row.lines as Ticket['lines']) ?? null,
            lastKickoff: row.last_kickoff as string,
            createdAt: row.created_at as string,
            hits: (row.hits as number | null) ?? null,
            hit: (row.hit as boolean | null) ?? null,
            results: (row.results as Ticket['results']) ?? null,
        };
    } catch (error) {
        logReadError(`getSharedSchedina`, error);
        return null;
    }
}
