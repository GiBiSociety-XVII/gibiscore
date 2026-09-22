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
 * A cron cannot run more often than once a minute, so while matches are
 * on the job runs three times per invocation, twenty seconds apart: no
 * score in the database is ever more than twenty seconds behind the
 * provider. The pages do not wait for a render to see it — they ask
 * /api/scores and /api/matches/[id]/live for the same rows every few
 * seconds (lib/football/live.ts) — so what is left to revalidate is
 * only what the first visitor of a page gets, and that is done once,
 * after the last pass.
 */
export async function GET(request: NextRequest) {
    return cronRoute(async () => {
        const startedAt = Date.now();
        let run = await syncLive();
        let requests = run.requests;
        let passes = 1;
        while ((run.counters.inplay ?? 0) > 0) {
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
 * The pages of the matches this minute touched, and of the two clubs of
 * each, are rendered again on their next request: they no longer expire
 * on a short timer, so a match that does not move costs nothing. A match
 * of a fantasy competition also refreshes the matchday, where the live
 * score of a lineup reads the players' lines.
 *
 * Once a minute, after the last pass: an open page no longer waits for
 * this to see a score move, so there is nothing to gain by doing it
 * three times.
 */
async function refreshMoved(sinceIso: string): Promise<void> {
    try {
        const {data} = await createServiceClient().from('fixtures').select('id,league:leagues!inner(slug),home:teams!fixtures_home_team_id_fkey(slug),away:teams!fixtures_away_team_id_fkey(slug)').gte('last_synced_at', sinceIso).limit(400);
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
