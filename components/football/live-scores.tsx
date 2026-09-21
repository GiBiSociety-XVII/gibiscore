'use client';

import {useCallback, useMemo, useRef} from "react";
import {useTranslations} from "next-intl";
import {useRouter} from "@/i18n/navigation";
import type {ScoresPage} from "@/lib/football/data/scores";
import {liveOf, type LiveFixture} from "@/lib/football/live";
import {LIVE_STATES, type FixtureState, type FixtureSummary} from "@/lib/football/types";
import {useFavoriteTeams, useFavorites} from "@/lib/favorites";
import {useLiveFixtures} from "./use-live";
import {CompetitionBlock} from "./competition-block";
import {ScoreFilters, type ScoreFilter} from "./score-filters";

/** How often the page asks the server for the state of its rows, while it is in front. */
const POLL_LIVE_MS = 10_000;
const POLL_DAY_MS = 15_000;
/** The whole page is rendered again no more often than this, and only when the list itself must change. */
const RENDER_AGAIN_MS = 30_000;

const isLive = (state: string) => (LIVE_STATES as readonly string[]).includes(state);

/** Every row of the page, in no particular order. */
function allFixtures(page: ScoresPage): FixtureSummary[] {
    return [...page.pinned, ...page.countries.flatMap((c) => c.competitions)].flatMap((g) => g.fixtures);
}

/**
 * The scores list, kept moving.
 *
 * The server renders the day (or the matches in play); the browser then
 * asks a small endpoint every few seconds for the state, minute and
 * score of the same rows and lays over whatever is later than what it
 * is showing (components/football/use-live.ts). Nothing on a row ever
 * goes backwards, so the page is never fetched again just to move a
 * score: that only happens when the list itself must change — a match
 * kicks off, one comes off the live page — and at most twice a minute.
 */
export function LiveScores({page, labels, emptyText, favoritesLabel}: {page: ScoresPage; labels: Record<ScoreFilter, string>; emptyText: string; favoritesLabel: string}) {
    const t = useTranslations('Pages.scores');
    const router = useRouter();
    const {favorites: favoriteCompetitions} = useFavorites();
    const {favorites: favoriteTeamSlugs} = useFavoriteTeams();
    const favoriteTeams = new Set(favoriteTeamSlugs);
    const live = page.mode === 'live';
    // Only while something can still change: a live list, or today with matches open or in play.
    const active = live || (page.date === page.today && (page.total === 0 || page.liveCount + page.scheduledCount > 0));

    const seed = useMemo(() => allFixtures(page).map(liveOf), [page]);
    const renderedAt = useRef(0);

    /**
     * What the merge cannot carry: a row that is not on the page at all.
     * A match kicks off and belongs on the live page; one ends and comes
     * off it; the day came out empty because a read failed. Only then is
     * the page rendered again, and never twice within half a minute.
     */
    const onAnswer = useCallback(
        (fixtures: LiveFixture[]) => {
            const known = new Set(seed.map((f) => f.id));
            const missing = fixtures.some((f) => isLive(f.state) && !known.has(f.id));
            const settled = live && seed.some((f) => isLive(f.state) && fixtures.some((u) => u.id === f.id && !isLive(u.state)));
            const emptied = !live && known.size === 0 && fixtures.length > 0;
            if (!missing && !settled && !emptied) return;
            const now = Date.now();
            if (now - renderedAt.current < RENDER_AGAIN_MS) return;
            renderedAt.current = now;
            router.refresh();
        },
        [live, router, seed],
    );

    const over = useLiveFixtures({url: active ? (live ? '/api/scores?mode=live' : `/api/scores?date=${page.date}`) : null, seed, everyMs: live ? POLL_LIVE_MS : POLL_DAY_MS, onAnswer});

    const patch = (fixtures: FixtureSummary[]) =>
        fixtures.map((f) => {
            const u = over.get(f.id);
            return u ? {...f, state: u.state as FixtureState, minute: u.minute, extraMinute: u.extraMinute, syncedAt: u.syncedAt, homeScore: u.homeScore, awayScore: u.awayScore} : f;
        });

    // The starred competitions come first, in a group of their own, in the order they were starred.
    const isFavorite = (slug: string) => favoriteCompetitions.includes(slug);
    const everyGroup = [...page.pinned, ...page.countries.flatMap((c) => c.competitions)];
    const favorites = favoriteCompetitions.map((slug) => everyGroup.find((g) => g.competition.slug === slug)).filter((g): g is (typeof everyGroup)[number] => !!g).map((g) => ({...g, fixtures: patch(g.fixtures)}));
    const pinned = page.pinned.filter((g) => !isFavorite(g.competition.slug)).map((g) => ({...g, fixtures: patch(g.fixtures)}));
    const countries = page.countries.map((c) => ({...c, competitions: c.competitions.filter((g) => !isFavorite(g.competition.slug)).map((g) => ({...g, fixtures: patch(g.fixtures)}))})).filter((c) => c.competitions.length > 0);
    const all = [...favorites, ...pinned, ...countries.flatMap((c) => c.competitions)].flatMap((g) => g.fixtures);
    const counts = {
        all: all.length,
        live: all.filter((f) => isLive(f.state)).length,
        finished: all.filter((f) => f.state === 'finished').length,
        scheduled: all.filter((f) => f.state === 'scheduled').length,
    };

    // The guide of the front page points at the first competition of the list and its first row.
    const firstSlug = [...favorites, ...pinned, ...countries.flatMap((c) => c.competitions)][0]?.competition.slug;
    const block = (g: (typeof everyGroup)[number]) => <CompetitionBlock key={g.competition.slug} group={g} favoriteTeams={favoriteTeams} tour={g.competition.slug === firstSlug} />;
    const list = all.length === 0 ? (
        <p className="px-2 py-6 text-center text-[13px] font-semibold text-muted-foreground">{emptyText}</p>
    ) : (
        <div data-tour="list" className="flex flex-col gap-2">
            {favorites.length > 0 && (
                <div data-group className="border-2 border-foreground rounded-lg overflow-hidden">
                    <div className="flex items-center gap-1.5 px-2 h-7 bg-foreground text-background text-[11px] font-extrabold uppercase tracking-wide">
                        <span className="w-1.5 h-1.5 rounded-full bg-accent" aria-hidden="true" />
                        {favoritesLabel}
                    </div>
                    {favorites.map(block)}
                </div>
            )}
            {pinned.length > 0 && (
                <div data-group className="border-2 border-foreground rounded-lg overflow-hidden">
                    {pinned.map(block)}
                </div>
            )}
            {countries.map((c) => (
                <div key={c.country} data-group className="border-2 border-foreground/30 rounded-lg overflow-hidden">
                    {c.competitions.map(block)}
                </div>
            ))}
            <p data-empty className="hidden px-2 py-6 text-center text-[13px] font-semibold text-muted-foreground">{emptyText}</p>
        </div>
    );

    if (live) {
        return (
            <>
                <p className="text-xs font-bold text-muted-foreground px-1">{t('liveHint', {count: counts.live})}</p>
                {list}
            </>
        );
    }
    return (
        <ScoreFilters counts={counts} labels={labels}>
            {list}
        </ScoreFilters>
    );
}
