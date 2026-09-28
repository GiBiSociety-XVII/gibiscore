import {revalidatePath, revalidateTag} from 'next/cache';
import type {NextRequest} from 'next/server';
import {createServiceClient} from '@/lib/db/server';
import {sleep} from '@/lib/api-football/client';
import {cronRoute} from '@/lib/football/sync/run-job';
import {syncLive} from '@/lib/football/sync/fixtures';
import {AUCTION_LEAGUES} from '@/lib/fantasy/config';
import {everyLocalePath} from '@/lib/auth/next';

/** The competitions a fantasy roster can be drawn from: a live match of theirs moves the lineup's live score. */
const FANTASY_SLUGS = new Set(AUCTION_LEAGUES.flatMap((l) => l.slugs));

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/** While matches are on, a pass starts this long after the one before. */
const PASS_EVERY_MS = 20_000;
/** No pass is started past this point of the minute: it must have room to finish inside maxDuration. */
const LAST_PASS_BY_MS = 44_000;

/**
 * Every minute: in-play fixtures with events, statistics and lineups.
 *
 * A cron cannot run more often than once a minute, so while a featured
 * match is on the job runs three times per invocation, twenty seconds
 * apart: no score of those is ever more than twenty seconds behind the
 * provider. The pages do not wait for a render to see it — they ask
 * /api/scores and /api/matches/[id]/live for the same rows every few
 * seconds (lib/football/live.ts) — so what is left to revalidate is
 * only what the first visitor of a page gets, and that is done once,
 * after the last pass.
 *
 * With only minor leagues in play — most hours of most days, somewhere
 * in the world — one pass a minute: the function would otherwise sit
 * awake between passes all day long, and that time is billed.
 */
export async function GET(request: NextRequest) {
    return cronRoute(async () => {
        const startedAt = Date.now();
        let run = await syncLive();
        let requests = run.requests;
        let passes = 1;
        while ((run.counters.featured_inplay ?? 0) > 0) {
            const nextAt = startedAt + passes * PASS_EVERY_MS;
            if (nextAt - startedAt > LAST_PASS_BY_MS || Date.now() - startedAt > LAST_PASS_BY_MS) break;
            await sleep(Math.max(0, nextAt - Date.now()));
            run = await syncLive();
            requests += run.requests;
            passes += 1;
        }
        await refreshMoved(new Date(startedAt).toISOString());
        run.requests = requests;
        run.bump('passes', passes);
        return run;
    })(request);
}

/**
 * What is rendered again after a minute of live sync, once, after the
 * last pass. Scores and events reach an open page by the live endpoints,
 * so a score moving is no reason to render anything: what a page needs
 * a render for is
 *
 * - its detail: lineups, statistics, ratings. The match page and the
 *   two clubs' pages of every fixture whose detail was written this
 *   minute (`details_synced_at`): the featured ones every minute, the
 *   covered minor ones every three, and every one that just ended.
 * - the rounds of a featured competition, where the scores are drawn
 *   by the server: its page, when one of its matches moved.
 * - the fantasy matchday, where the live score of a lineup reads the
 *   players' lines: when a fixture of a fantasy competition moved.
 *
 * Nothing for the thousand minor matches in play at any hour of the
 * day: their pages are patched in the browser like every other, and a
 * render each per minute, for pages nobody has open, was most of what
 * the functions did.
 */
async function refreshMoved(sinceIso: string): Promise<void> {
    try {
        const db = createServiceClient();
        const [detailed, moved] = await Promise.all([
            db.from('fixtures').select('id,home:teams!fixtures_home_team_id_fkey(slug),away:teams!fixtures_away_team_id_fkey(slug)').gte('details_synced_at', sinceIso).limit(200),
            db.from('fixtures').select('league:leagues!inner(slug,tier)').gte('last_synced_at', sinceIso).eq('leagues.tier', 'featured').limit(400),
        ]);
        // The default locale has no prefix on the URL, the cache may know any form.
        const refresh = (path: string) => {
            for (const p of everyLocalePath(path)) revalidatePath(p);
        };
        for (const row of (detailed.data ?? []) as unknown as Array<{id: number; home: {slug: string} | null; away: {slug: string} | null}>) {
            refresh(`/matches/${row.id}`);
            if (row.home) refresh(`/teams/${row.home.slug}`);
            if (row.away) refresh(`/teams/${row.away.slug}`);
        }
        const leagues = new Set<string>();
        for (const row of (moved.data ?? []) as unknown as Array<{league: {slug: string} | null}>) if (row.league) leagues.add(row.league.slug);
        for (const slug of leagues) refresh(`/competitions/${slug}`);
        if ([...leagues].some((slug) => FANTASY_SLUGS.has(slug))) revalidateTag('fantasy-matchday', 'max');
    } catch {
        // Not worth failing the sync for: the timers still refresh the pages.
    }
}
