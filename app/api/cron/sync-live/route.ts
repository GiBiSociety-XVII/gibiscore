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

/** The second pass of a minute starts this long after the first. */
const SECOND_PASS_MS = 30_000;

/**
 * Every minute: in-play fixtures with events, statistics and lineups.
 * A cron cannot run more often, so while matches are on the job runs
 * twice per invocation, thirty seconds apart: scores move within half a
 * minute.
 */
export async function GET(request: NextRequest) {
    return cronRoute(async () => {
        const startedAt = Date.now();
        const first = await syncLive();
        await refreshMoved(new Date(startedAt).toISOString());
        if ((first.counters.inplay ?? 0) === 0) return first;
        const wait = SECOND_PASS_MS - (Date.now() - startedAt);
        if (wait > 0) await sleep(wait);
        const secondStarted = new Date().toISOString();
        const second = await syncLive();
        await refreshMoved(secondStarted);
        second.requests += first.requests;
        second.bump('passes', 2);
        return second;
    })(request);
}

/**
 * The pages of the matches this pass touched, and of the two clubs of
 * each, are rendered again on their next request: they no longer expire
 * on a short timer, so a match that does not move costs nothing. A match
 * of a fantasy competition also refreshes the matchday, where the live
 * score of a lineup reads the players' lines.
 */
async function refreshMoved(sinceIso: string): Promise<void> {
    try {
        const {data} = await createServiceClient().from('fixtures').select('id,league:leagues!inner(slug),home:teams!fixtures_home_team_id_fkey(slug),away:teams!fixtures_away_team_id_fkey(slug)').gte('last_synced_at', sinceIso).limit(200);
        // The default locale has no prefix on the URL, the cache may know any form.
        const refresh = (path: string) => {
            for (const p of everyLocalePath(path)) revalidatePath(p);
        };
        let fantasy = false;
        for (const row of (data ?? []) as unknown as Array<{id: number; league: {slug: string} | null; home: {slug: string} | null; away: {slug: string} | null}>) {
            refresh(`/matches/${row.id}`);
            if (row.home) refresh(`/teams/${row.home.slug}`);
            if (row.away) refresh(`/teams/${row.away.slug}`);
            if (row.league && FANTASY_SLUGS.has(row.league.slug)) fantasy = true;
        }
        if (fantasy) revalidateTag('fantasy-matchday', 'max');
    } catch {
        // Not worth failing the sync for: the timers still refresh the pages.
    }
}
