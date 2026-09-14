'use client';

import {useEffect, useState} from "react";
import {useTranslations} from "next-intl";
import {useRouter} from "@/i18n/navigation";
import type {ScoresPage} from "@/lib/football/data/scores";
import {LIVE_STATES, type FixtureState, type FixtureSummary} from "@/lib/football/types";
import {useFavoriteTeams, useFavorites} from "@/lib/favorites";
import {CompetitionBlock} from "./competition-block";
import {ScoreFilters, type ScoreFilter} from "./score-filters";

/** How often the page asks for the live state of its rows, while visible. */
const POLL_LIVE_MS = 15_000;
const POLL_DAY_MS = 20_000;

interface Update {
    id: number;
    state: string;
    minute: number | null;
    extraMinute: number | null;
    syncedAt: string | null;
    homeScore: number | null;
    awayScore: number | null;
}

const isLive = (state: string) => (LIVE_STATES as readonly string[]).includes(state);

function apply(f: FixtureSummary, u: Update | undefined): FixtureSummary {
    if (!u) return f;
    if (u.state === f.state && u.minute === f.minute && u.extraMinute === (f.extraMinute ?? null) && u.homeScore === f.homeScore && u.awayScore === f.awayScore && u.syncedAt === (f.syncedAt ?? null)) return f;
    return {...f, state: u.state as FixtureState, minute: u.minute, extraMinute: u.extraMinute, syncedAt: u.syncedAt, homeScore: u.homeScore, awayScore: u.awayScore};
}

/**
 * The scores list, kept moving: the server renders the day (or the
 * matches in play), the client then polls a light endpoint for the state,
 * minute and score of every row and patches them in place, without a
 * page reload. In live mode a match that starts or ends changes the list
 * itself: the page is refreshed from the server then.
 */
export function LiveScores({page, labels, emptyText, favoritesLabel}: {page: ScoresPage; labels: Record<ScoreFilter, string>; emptyText: string; favoritesLabel: string}) {
    const t = useTranslations('Pages.scores');
    const router = useRouter();
    const {favorites: favoriteCompetitions} = useFavorites();
    const {favorites: favoriteTeamSlugs} = useFavoriteTeams();
    const favoriteTeams = new Set(favoriteTeamSlugs);
    const [updates, setUpdates] = useState<Map<number, Update>>(() => new Map());
    const live = page.mode === 'live';
    // Only while something can still change: a live list, or today with matches open or in play.
    const active = live || (page.date === page.today && (page.total === 0 || page.liveCount + page.scheduledCount > 0));

    useEffect(() => {
        if (!active) return;
        let stopped = false;
        let refreshing = false;
        const known = new Set([...page.pinned, ...page.countries.flatMap((c) => c.competitions)].flatMap((g) => g.fixtures.map((f) => f.id)));
        const wasLive = new Set([...page.pinned, ...page.countries.flatMap((c) => c.competitions)].flatMap((g) => g.fixtures.filter((f) => isLive(f.state)).map((f) => f.id)));
        const tick = async () => {
            if (stopped || document.visibilityState !== 'visible') return;
            try {
                const url = live ? '/api/scores?mode=live' : `/api/scores?date=${page.date}`;
                const res = await fetch(url, {cache: 'no-store'});
                if (!res.ok) return;
                const body = (await res.json()) as {fixtures: Update[]};
                if (stopped) return;
                const next = new Map<number, Update>();
                for (const u of body.fixtures) next.set(u.id, u);
                setUpdates(next);
                // The server page came out empty (a database hiccup at render) while the day has matches: refresh it.
                if (!live && known.size === 0 && body.fixtures.length > 0 && !refreshing) {
                    refreshing = true;
                    router.refresh();
                    return;
                }
                // Live mode: the list itself changed (a match kicked off, one ended): the server knows the rows.
                if (live && !refreshing) {
                    const nowLive = body.fixtures.filter((u) => isLive(u.state)).map((u) => u.id);
                    const changed = nowLive.some((id) => !known.has(id)) || [...wasLive].some((id) => !nowLive.includes(id));
                    if (changed) {
                        refreshing = true;
                        router.refresh();
                    }
                }
            } catch {
                // Network hiccup: the next tick tries again.
            }
        };
        const id = window.setInterval(tick, live ? POLL_LIVE_MS : POLL_DAY_MS);
        const onVisible = () => {
            if (document.visibilityState === 'visible') void tick();
        };
        document.addEventListener('visibilitychange', onVisible);
        void tick();
        return () => {
            stopped = true;
            window.clearInterval(id);
            document.removeEventListener('visibilitychange', onVisible);
        };
    }, [active, live, page, router]);

    const patch = (fixtures: FixtureSummary[]) => fixtures.map((f) => apply(f, updates.get(f.id)));
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

    const list = all.length === 0 ? (
        <p className="px-2 py-6 text-center text-[13px] font-semibold text-muted-foreground">{emptyText}</p>
    ) : (
        <div className="flex flex-col gap-2">
            {favorites.length > 0 && (
                <div data-group className="border-2 border-foreground rounded-lg overflow-hidden">
                    <div className="flex items-center gap-1.5 px-2 h-7 bg-foreground text-background text-[11px] font-extrabold uppercase tracking-wide">
                        <span className="w-1.5 h-1.5 rounded-full bg-accent" aria-hidden="true" />
                        {favoritesLabel}
                    </div>
                    {favorites.map((g) => <CompetitionBlock key={g.competition.slug} group={g} favoriteTeams={favoriteTeams} />)}
                </div>
            )}
            {pinned.length > 0 && (
                <div data-group className="border-2 border-foreground rounded-lg overflow-hidden">
                    {pinned.map((g) => <CompetitionBlock key={g.competition.slug} group={g} favoriteTeams={favoriteTeams} />)}
                </div>
            )}
            {countries.map((c) => (
                <div key={c.country} data-group className="border-2 border-foreground/30 rounded-lg overflow-hidden">
                    {c.competitions.map((g) => <CompetitionBlock key={g.competition.slug} group={g} favoriteTeams={favoriteTeams} />)}
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
