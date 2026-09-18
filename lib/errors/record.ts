import 'server-only';
import {createServiceClient} from '@/lib/db/server';
import {isBuildPhase} from '@/lib/db/phase';

/**
 * What broke while serving the site, written down so the administrator
 * can see it without the platform's logs: the read layer's failures and
 * what a page's error boundary caught in the browser (table error_log).
 * Never throws: a note is never worth a second error.
 *
 * Two things keep it small. The same message again within the minute is
 * one row with one more hit, and every source has a ceiling of rows per
 * minute: a storm, or somebody posting made-up errors at the open route,
 * costs a handful of rows and nothing more.
 */

export type ErrorSource = 'read' | 'client' | 'api';

export interface ErrorNote {
    source: ErrorSource;
    message: string;
    /** Next.js gives the browser only a digest of a server error: it ties the two sides together. */
    digest?: string | null;
    path?: string | null;
    locale?: string | null;
    userAgent?: string | null;
}

/** The same message again within this long is one row with one more hit. */
const SAME_MS = 60_000;
/** Rows a source may write in a minute, per instance: the browsers' route is the one strangers can reach. */
const PER_MINUTE: Record<ErrorSource, number> = {client: 20, read: 60, api: 60};
/** What this instance wrote lately, so a storm is one row a minute, not thousands. */
const lately = new Map<string, {at: number; id: number}>();
const MAX_KEYS = 200;
/** Rows written this minute, per source. */
const spent = new Map<ErrorSource, {minute: number; rows: number}>();

const cut = (v: string | null | undefined, max: number): string | null => (typeof v === 'string' && v.length > 0 ? v.slice(0, max) : null);

/** True while the source still has room this minute; counts the row it is about to write. */
function take(source: ErrorSource, now: number): boolean {
    const minute = Math.floor(now / 60_000);
    const seen = spent.get(source);
    const used = seen && seen.minute === minute ? seen.rows : 0;
    if (used >= PER_MINUTE[source]) return false;
    spent.set(source, {minute, rows: used + 1});
    return true;
}

export async function recordError(note: ErrorNote): Promise<void> {
    // At build time there is no site to serve, and often no database: the console line is enough.
    if (isBuildPhase()) return;
    const message = cut(note.message, 500) ?? 'unknown';
    const key = `${note.source}:${message}`;
    const now = Date.now();
    try {
        const db = createServiceClient();
        const seen = lately.get(key);
        if (seen && now - seen.at < SAME_MS) {
            await db.rpc('bump_error_hits', {row_id: seen.id});
            return;
        }
        if (!take(note.source, now)) return;
        const {data, error} = await db
            .from('error_log')
            .insert({source: note.source, message, digest: cut(note.digest, 100), path: cut(note.path, 300), locale: cut(note.locale, 8), user_agent: cut(note.userAgent, 300)})
            .select('id')
            .single();
        if (error) return;
        if (lately.size > MAX_KEYS) lately.clear();
        lately.set(key, {at: now, id: data.id as number});
    } catch {
        // No key, no database, no network: there is nothing more to do about an error than the console line.
    }
}
