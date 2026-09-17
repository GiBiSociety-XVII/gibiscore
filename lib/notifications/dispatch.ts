import 'server-only';
import type {FootballClient, SyncRun} from '@/lib/football/sync/context';
import {chunk} from '@/lib/football/sync/context';
import type {Candidate, NotificationKind} from './events';
import {pushConfigured, sendPush, type PushTarget} from './push';

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

        // 2. Who could care: the slugs of the match, the users with a subscribed browser.
        const {data: fixtureRows, error: fixtureError} = await db
            .from('fixtures')
            .select('id,league:leagues(slug),home:teams!fixtures_home_team_id_fkey(slug),away:teams!fixtures_away_team_id_fkey(slug)')
            .in('id', news.map((o) => o.fixtureId));
        if (fixtureError) throw fixtureError;
        const slugsOf = new Map<number, {league: string | null; home: string | null; away: string | null}>();
        for (const r of (fixtureRows ?? []) as unknown as Array<{id: number; league: {slug: string} | null; home: {slug: string} | null; away: {slug: string} | null}>) {
            slugsOf.set(r.id, {league: r.league?.slug ?? null, home: r.home?.slug ?? null, away: r.away?.slug ?? null});
        }
        const {data: subRows, error: subError} = await db.from('push_subscriptions').select('id,user_id,endpoint,p256dh,auth,failures').limit(20000);
        if (subError) throw subError;
        const subs = (subRows ?? []) as Array<{id: number; user_id: string; endpoint: string; p256dh: string; auth: string; failures: number}>;
        if (subs.length === 0) return;
        const userIds = [...new Set(subs.map((s) => s.user_id))];

        const favorites = new Map<string, {competitions: string[]; teams: string[]}>();
        const settings = new Map<string, Settings>();
        for (const ids of chunk(userIds, 300)) {
            const [{data: favRows, error: favError}, {data: setRows, error: setError}] = await Promise.all([
                db.from('user_favorites').select('user_id,competitions,teams').in('user_id', ids),
                db.from('notification_settings').select('user_id,enabled,kinds').in('user_id', ids),
            ]);
            if (favError) throw favError;
            if (setError) throw setError;
            for (const r of favRows ?? []) favorites.set(r.user_id as string, {competitions: slugList(r.competitions), teams: slugList(r.teams)});
            for (const r of setRows ?? []) settings.set(r.user_id as string, {enabled: r.enabled !== false, kinds: (r.kinds as Settings['kinds']) ?? {}});
        }
        const {data: mutedRows, error: mutedError} = await db.from('muted_fixtures').select('user_id,fixture_id').in('fixture_id', news.map((o) => o.fixtureId));
        if (mutedError) throw mutedError;
        const muted = new Set((mutedRows ?? []).map((r) => `${r.user_id}:${r.fixture_id}`));

        // 3. The sends: one per candidate per subscribed browser of a user who follows the match.
        const sends: Array<{sub: (typeof subs)[number]; fixtureId: number; candidate: Candidate}> = [];
        for (const o of news) {
            const slugs = slugsOf.get(o.fixtureId);
            if (!slugs) continue;
            for (const sub of subs) {
                const fav = favorites.get(sub.user_id);
                if (!fav) continue;
                const follows = (slugs.league !== null && fav.competitions.includes(slugs.league)) || (slugs.home !== null && fav.teams.includes(slugs.home)) || (slugs.away !== null && fav.teams.includes(slugs.away));
                if (!follows || muted.has(`${sub.user_id}:${o.fixtureId}`)) continue;
                const s = settings.get(sub.user_id) ?? {enabled: true, kinds: {}};
                if (!s.enabled) continue;
                for (const candidate of o.candidates) {
                    if (s.kinds[candidate.kind] === false) continue;
                    sends.push({sub, fixtureId: o.fixtureId, candidate});
                }
            }
        }
        if (sends.length === 0) return;

        const gone = new Set<number>();
        const failed = new Map<number, number>();
        let delivered = 0;
        for (const group of chunk(sends, CONCURRENCY)) {
            const results = await Promise.all(
                group.map(({sub, fixtureId, candidate}) => sendPush(sub as PushTarget, {title: candidate.title, body: candidate.body, url: `/matches/${fixtureId}`, tag: `match-${fixtureId}`, kind: candidate.kind})),
            );
            results.forEach((result, i) => {
                const sub = group[i].sub;
                if (result === 'ok') delivered += 1;
                else if (result === 'gone') gone.add(sub.id);
                else failed.set(sub.id, (failed.get(sub.id) ?? 0) + 1);
            });
        }
        run.bump('notifications', delivered);
        // Browsers that left, and the ones failing for too long, are forgotten.
        for (const [id, n] of failed) if ((subs.find((s) => s.id === id)?.failures ?? 0) + n >= MAX_FAILURES) gone.add(id);
        if (gone.size > 0) {
            await db.from('push_subscriptions').delete().in('id', [...gone]);
            run.bump('subscriptions_dropped', gone.size);
        }
        const stillFailing = [...failed.keys()].filter((id) => !gone.has(id));
        for (const id of stillFailing) {
            const sub = subs.find((s) => s.id === id);
            if (sub) await db.from('push_subscriptions').update({failures: sub.failures + (failed.get(id) ?? 0)}).eq('id', id);
        }
        const ok = [...new Set(sends.map((s) => s.sub.id))].filter((id) => !failed.has(id) && !gone.has(id));
        if (ok.length > 0) await db.from('push_subscriptions').update({failures: 0, last_used_at: new Date().toISOString()}).in('id', ok);
    } catch (error) {
        run.warn(`notifications: ${(error as Error).message}`);
    }
}

const slugList = (v: unknown): string[] => (Array.isArray(v) ? v.filter((s): s is string => typeof s === 'string') : []);
