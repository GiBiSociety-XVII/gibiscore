import 'server-only';
import {createServiceClient} from '@/lib/db/server';
import {isBuildPhase} from '@/lib/db/phase';

/**
 * What broke while serving the site, written down so the administrator
 * can see it without the platform's logs: the read layer's failures and
 * what a page's error boundary caught in the browser (table error_log).
 * Never throws and never waits on anything: a note is never worth a
 * second error.
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
/** What this instance wrote lately, so a storm is one row a minute, not thousands. */
const lately = new Map<string, {at: number; id: number}>();
const MAX_KEYS = 200;

const cut = (v: string | null | undefined, max: number): string | null => (typeof v === 'string' && v.length > 0 ? v.slice(0, max) : null);

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
