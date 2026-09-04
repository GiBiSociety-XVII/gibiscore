'use client';

import {useEffect, useState, useSyncExternalStore} from "react";
import {useTranslations} from "next-intl";
import {Link} from "@/i18n/navigation";
import {cn} from "@/components/shared/ui/cn";
import {Panel} from "@/components/shell/panel";
import {useFavorites} from "@/lib/favorites";
import type {StandingGroup} from "@/lib/football/types";
import {StandingsTable} from "./standings-table";

export interface RailCompetition {
    slug: string;
    name: string;
    logoUrl: string | null;
}

interface Table {
    competition: {name: string; slug: string};
    groups: StandingGroup[];
}

/** Full tables shown at once: enough to read, never a wall of squeezed boxes. */
const VISIBLE = 2;
const ACTIVE_KEY = 'gibiscore:rail-active';

const cache = new Map<string, Promise<Table | null>>();

function loadTable(slug: string): Promise<Table | null> {
    if (!cache.has(slug)) {
        cache.set(
            slug,
            fetch(`/api/standings/${encodeURIComponent(slug)}`)
                .then((r) => (r.ok ? (r.json() as Promise<Table | null>) : null))
                .catch(() => null),
        );
    }
    return cache.get(slug)!;
}

// The chosen tables live in localStorage; read through useSyncExternalStore so
// the server render (nothing chosen) and the first client render agree.
const EMPTY: readonly string[] = [];
let activeCache: readonly string[] | null = null;
const ACTIVE_EVENT = 'gibiscore:rail-active-changed';

function readActive(): readonly string[] {
    if (activeCache) return activeCache;
    try {
        const raw = window.localStorage.getItem(ACTIVE_KEY);
        const parsed = raw ? (JSON.parse(raw) as unknown) : [];
        activeCache = Array.isArray(parsed) ? parsed.filter((s): s is string => typeof s === 'string') : EMPTY;
    } catch {
        activeCache = EMPTY;
    }
    return activeCache;
}

function writeActive(next: string[]) {
    activeCache = next;
    try {
        window.localStorage.setItem(ACTIVE_KEY, JSON.stringify(next));
    } catch {
        // storage unavailable: the choice lives for this page only
    }
    window.dispatchEvent(new Event(ACTIVE_EVENT));
}

function subscribeActive(callback: () => void) {
    window.addEventListener(ACTIVE_EVENT, callback);
    return () => window.removeEventListener(ACTIVE_EVENT, callback);
}

/**
 * Home rail: the user's favourite competitions (starred in the scores
 * list or the sidebar). A row of chips lists them all; the chosen two are
 * shown as complete tables, one under the other, with no inner scrolling.
 * Without favourites, the pinned competitions playing that day.
 */
export function FavoritesRail({defaults, catalog}: {defaults: string[]; catalog: RailCompetition[]}) {
    const t = useTranslations('Common.rail');
    const {favorites} = useFavorites();
    const [tables, setTables] = useState<Record<string, Table | null | undefined>>({});
    const stored = useSyncExternalStore(subscribeActive, readActive, () => EMPTY);
    const slugs = favorites.length > 0 ? favorites : defaults;

    // Active = stored choices still among the favourites, topped up in favourite order.
    const active = (() => {
        const chosen = stored.filter((s) => slugs.includes(s)).slice(0, VISIBLE);
        for (const s of slugs) {
            if (chosen.length >= VISIBLE) break;
            if (!chosen.includes(s)) chosen.push(s);
        }
        return chosen;
    })();

    const choose = (slug: string) => {
        if (active.includes(slug)) return;
        writeActive([slug, ...active].slice(0, VISIBLE));
    };

    useEffect(() => {
        let alive = true;
        for (const slug of active) {
            if (tables[slug] !== undefined) continue;
            loadTable(slug).then((table) => {
                if (alive) setTables((prev) => ({...prev, [slug]: table}));
            });
        }
        return () => {
            alive = false;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [active.join(',')]);

    const meta = (slug: string) => catalog.find((c) => c.slug === slug);
    const nameOf = (slug: string) => meta(slug)?.name ?? tables[slug]?.competition.name ?? slug;

    if (slugs.length === 0) return <p className="px-1 text-[12px] font-semibold text-muted-foreground">{t('noFavorites')}</p>;

    return (
        <>
            <div className="flex flex-col gap-1.5">
                <span className="px-1 text-[10px] font-extrabold uppercase tracking-wider text-muted-foreground">{favorites.length > 0 ? t('favorites') : t('standings')}</span>
                {slugs.length > VISIBLE && (
                    <div className="flex flex-wrap gap-1">
                        {slugs.map((slug) => {
                            const m = meta(slug);
                            const on = active.includes(slug);
                            return (
                                <button
                                    key={slug}
                                    type="button"
                                    onClick={() => choose(slug)}
                                    aria-pressed={on}
                                    title={nameOf(slug)}
                                    className={cn(
                                        "inline-flex items-center gap-1.5 h-8 pl-1.5 pr-2.5 rounded-lg border-2 text-[12px] font-extrabold whitespace-nowrap transition-colors",
                                        on ? "bg-foreground text-background border-foreground" : "bg-card border-foreground/20 hover:border-foreground",
                                    )}
                                >
                                    {m?.logoUrl ? (
                                        // eslint-disable-next-line @next/next/no-img-element
                                        <img src={m.logoUrl} alt="" width={18} height={18} loading="lazy" className={cn("object-contain rounded-sm", on && "bg-background p-px")} />
                                    ) : null}
                                    <span className="max-w-[110px] truncate">{nameOf(slug)}</span>
                                </button>
                            );
                        })}
                    </div>
                )}
            </div>

            {active.map((slug) => {
                const table = tables[slug];
                return (
                    <Panel
                        key={slug}
                        title={nameOf(slug)}
                        action={<Link href={`/competitions/${slug}`} className="text-[11px] font-extrabold underline decoration-accent decoration-[2px] underline-offset-2 whitespace-nowrap">{t('fullStandings')}</Link>}
                    >
                        {table === undefined ? (
                            <div className="px-3 py-3 flex flex-col gap-2 animate-pulse" aria-busy="true">
                                {Array.from({length: 8}, (_, i) => <div key={i} className="h-5 rounded bg-muted" />)}
                            </div>
                        ) : (
                            <StandingsTable groups={table?.groups ?? []} compact />
                        )}
                    </Panel>
                );
            })}
        </>
    );
}
