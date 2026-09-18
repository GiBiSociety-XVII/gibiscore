import 'server-only';
import type {FootballClient, SyncRun} from '@/lib/football/sync/context';
import {chunk} from '@/lib/football/sync/context';
import {localePath} from '@/lib/auth/next';
import {routing, type AppLocale} from '@/i18n/routing';
import type {Candidate, Localized, NotificationKind} from './events';
import {pushConfigured, sendPush, type PushPayload, type PushTarget} from './push';

/** A match with what it owes: our fixture id and the candidates (events.ts). */
export interface Outgoing {
    fixtureId: number;
    candidates: Candidate[];
}

/** A subscription is dropped after this many failed sends in a row. */
const MAX_FAILURES = 5;
/** Sends in flight at once. */
const CONCURRENCY = 20;

interface Settings {
    enabled: boolean;
    kinds: Partial<Record<NotificationKind, boolean>>;
}

interface Subscription {
    id: number;
    user_id: string;
    endpoint: string;
    p256dh: string;
    auth: string;
    failures: number;
    /** The language of the page that subscribed this browser. */
    locale: string;
}

/** The language of a browser, back to the default when it is one the site no longer has. */
const localeOf = (sub: Subscription): AppLocale => (routing.locales as readonly string[]).includes(sub.locale) ? (sub.locale as AppLocale) : routing.defaultLocale;

/** The notification as that browser reads it: its language, and the link in the same one. */
function payloadFor(sub: Subscription, text: Localized, url: string, tag: string, kind: NotificationKind): PushPayload {
    const locale = localeOf(sub);
    return {...text[locale], url: localePath(locale, url), tag, kind};
}

interface Send {
    sub: Subscription;
    payload: PushPayload;
}

const slugList = (v: unknown): string[] => (Array.isArray(v) ? v.filter((s): s is string => typeof s === 'string') : []);

/** Every subscribed browser, and the switches of their users (defaults: everything on). */
async function audience(db: FootballClient, userIds?: string[]): Promise<{subs: Subscription[]; settings: Map<string, Settings>}> {
    let query = db.from('push_subscriptions').select('id,user_id,endpoint,p256dh,auth,failures,locale').limit(20000);
    if (userIds) query = query.in('user_id', userIds);
    const {data: subRows, error: subError} = await query;
    if (subError) throw subError;
    const subs = (subRows ?? []) as Subscription[];
    const settings = new Map<string, Settings>();
    for (const ids of chunk([...new Set(subs.map((s) => s.user_id))], 300)) {
        const {data, error} = await db.from('notification_settings').select('user_id,enabled,kinds').in('user_id', ids);
        if (error) throw error;
        for (const r of data ?? []) settings.set(r.user_id as string, {enabled: r.enabled !== false, kinds: (r.kinds as Settings['kinds']) ?? {}});
    }
    return {subs, settings};
}

const wants = (settings: Map<string, Settings>, userId: string, kind: NotificationKind): boolean => {
    const s = settings.get(userId) ?? {enabled: true, kinds: {}};
    return s.enabled && s.kinds[kind] !== false;
};

/** The sends, twenty at a time; browsers gone or failing for too long are forgotten. */
async function deliver(db: FootballClient, run: SyncRun, sends: Send[]): Promise<void> {
    if (sends.length === 0) return;
    const subs = new Map(sends.map((s) => [s.sub.id, s.sub]));
    const gone = new Set<number>();
    const failed = new Map<number, number>();
    let delivered = 0;
    for (const group of chunk(sends, CONCURRENCY)) {
        const results = await Promise.all(group.map(({sub, payload}) => sendPush(sub as PushTarget, payload)));
        results.forEach((result, i) => {
            const sub = group[i].sub;
            if (result === 'ok') delivered += 1;
            else if (result === 'gone') gone.add(sub.id);
            else failed.set(sub.id, (failed.get(sub.id) ?? 0) + 1);
        });
    }
    run.bump('notifications', delivered);
    for (const [id, n] of failed) if ((subs.get(id)?.failures ?? 0) + n >= MAX_FAILURES) gone.add(id);
    if (gone.size > 0) {
        await db.from('push_subscriptions').delete().in('id', [...gone]);
        run.bump('subscriptions_dropped', gone.size);
    }
    for (const [id, n] of failed) {
        if (gone.has(id)) continue;
        await db.from('push_subscriptions').update({failures: (subs.get(id)?.failures ?? 0) + n}).eq('id', id);
    }
    const ok = [...subs.keys()].filter((id) => !failed.has(id) && !gone.has(id));
    if (ok.length > 0) await db.from('push_subscriptions').update({failures: 0, last_used_at: new Date().toISOString()}).in('id', ok);
}

/**
 * Sends what the live and lineups jobs found to whoever follows the
 * match: every signed-in user with a browser subscribed, notifications
 * on, that kind on, the match not muted, and the competition or one of
 * the two clubs among their favourites. The ledger (table notified)
 * takes each key first, so a second pass or a repeated feed never sends
 * the same goal twice. Never throws: a notification is never worth a
 * failed sync.
 */
export async function dispatchNotifications(db: FootballClient, run: SyncRun, outgoing: Outgoing[]): Promise<void> {
    try {
        const pending = outgoing.filter((o) => o.candidates.length > 0);
        if (pending.length === 0 || !pushConfigured()) return;

        // 1. The ledger: only the keys inserted now are news.
        const rows = pending.flatMap((o) => o.candidates.map((c) => ({fixture_id: o.fixtureId, key: c.key})));
        const {data: inserted, error: ledgerError} = await db.from('notified').upsert(rows, {onConflict: 'fixture_id,key', ignoreDuplicates: true}).select('fixture_id,key');
        if (ledgerError) throw ledgerError;
        const fresh = new Set((inserted ?? []).map((r) => `${r.fixture_id}:${r.key}`));
        const news = pending.map((o) => ({fixtureId: o.fixtureId, candidates: o.candidates.filter((c) => fresh.has(`${o.fixtureId}:${c.key}`))})).filter((o) => o.candidates.length > 0);
        if (news.length === 0) return;

        // 2. Who could care: the slugs of the match, the users with a subscribed browser and their favourites.
        const {data: fixtureRows, error: fixtureError} = await db
            .from('fixtures')
            .select('id,league:leagues(slug),home:teams!fixtures_home_team_id_fkey(slug),away:teams!fixtures_away_team_id_fkey(slug)')
            .in('id', news.map((o) => o.fixtureId));
        if (fixtureError) throw fixtureError;
        const slugsOf = new Map<number, {league: string | null; home: string | null; away: string | null}>();
        for (const r of (fixtureRows ?? []) as unknown as Array<{id: number; league: {slug: string} | null; home: {slug: string} | null; away: {slug: string} | null}>) {
            slugsOf.set(r.id, {league: r.league?.slug ?? null, home: r.home?.slug ?? null, away: r.away?.slug ?? null});
        }
        const {subs, settings} = await audience(db);
        if (subs.length === 0) return;
        const favorites = new Map<string, {competitions: string[]; teams: string[]}>();
        for (const ids of chunk([...new Set(subs.map((s) => s.user_id))], 300)) {
            const {data, error} = await db.from('user_favorites').select('user_id,competitions,teams').in('user_id', ids);
            if (error) throw error;
            for (const r of data ?? []) favorites.set(r.user_id as string, {competitions: slugList(r.competitions), teams: slugList(r.teams)});
        }
        const {data: mutedRows, error: mutedError} = await db.from('muted_fixtures').select('user_id,fixture_id').in('fixture_id', news.map((o) => o.fixtureId));
        if (mutedError) throw mutedError;
        const muted = new Set((mutedRows ?? []).map((r) => `${r.user_id}:${r.fixture_id}`));

        // 3. The sends: one per candidate per subscribed browser of a user who follows the match.
        const sends: Send[] = [];
        for (const o of news) {
            const slugs = slugsOf.get(o.fixtureId);
            if (!slugs) continue;
            for (const sub of subs) {
                const fav = favorites.get(sub.user_id);
                if (!fav) continue;
                const follows = (slugs.league !== null && fav.competitions.includes(slugs.league)) || (slugs.home !== null && fav.teams.includes(slugs.home)) || (slugs.away !== null && fav.teams.includes(slugs.away));
                if (!follows || muted.has(`${sub.user_id}:${o.fixtureId}`)) continue;
                for (const candidate of o.candidates) {
                    if (!wants(settings, sub.user_id, candidate.kind)) continue;
                    sends.push({sub, payload: payloadFor(sub, candidate.text, `/matches/${o.fixtureId}`, `match-${o.fixtureId}`, candidate.kind)});
                }
            }
        }
        await deliver(db, run, sends);
    } catch (error) {
        run.warn(`notifications: ${(error as Error).message}`);
    }
}

/**
 * One notification straight to some users (a slip settled, the evening
 * digest): their switches decide, favourites and mutes do not apply.
 * The caller makes sure it is not sent twice. Never throws.
 */
export async function notifyUsers(db: FootballClient, run: SyncRun, kind: NotificationKind, targets: Array<{userId: string; text: Localized; url: string; tag: string}>): Promise<void> {
    try {
        if (targets.length === 0 || !pushConfigured()) return;
        const {subs, settings} = await audience(db, [...new Set(targets.map((t) => t.userId))]);
        const sends: Send[] = [];
        for (const target of targets) {
            if (!wants(settings, target.userId, kind)) continue;
            for (const sub of subs) if (sub.user_id === target.userId) sends.push({sub, payload: payloadFor(sub, target.text, target.url, target.tag, kind)});
        }
        await deliver(db, run, sends);
    } catch (error) {
        run.warn(`notifications (${kind}): ${(error as Error).message}`);
    }
}
