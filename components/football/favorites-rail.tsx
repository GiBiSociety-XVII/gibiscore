'use client';

import {Settings2} from "lucide-react";
import {useEffect, useState} from "react";
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

/**
 * Home rail: full, scrollable tables of the user's favourite competitions
 * (kept in the browser). Without favourites, the pinned competitions
 * playing that day. Tables are fetched from a cached API route so the
 * page itself stays static.
 */
export function FavoritesRail({defaults, catalog}: {defaults: string[]; catalog: RailCompetition[]}) {
    const t = useTranslations('Common.rail');
    const {favorites, toggle} = useFavorites();
    const [editing, setEditing] = useState(false);
    const [tables, setTables] = useState<Record<string, Table | null | undefined>>({});
    const slugs = favorites.length > 0 ? favorites.slice(0, 6) : defaults;

    useEffect(() => {
        let alive = true;
        for (const slug of slugs) {
            if (tables[slug] !== undefined) continue;
            loadTable(slug).then((table) => {
                if (alive) setTables((prev) => ({...prev, [slug]: table}));
            });
        }
        return () => {
            alive = false;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [slugs.join(',')]);

    const nameOf = (slug: string) => catalog.find((c) => c.slug === slug)?.name ?? tables[slug]?.competition.name ?? slug;

    return (
        <>
            <div className="flex items-center justify-between gap-2 px-1">
                <span className="text-[10px] font-extrabold uppercase tracking-wider text-muted-foreground">{favorites.length > 0 ? t('favorites') : t('standings')}</span>
                <button
                    type="button"
                    onClick={() => setEditing((v) => !v)}
                    aria-expanded={editing}
                    className={cn("inline-flex items-center gap-1 h-6 px-2 rounded-md border-2 text-[11px] font-extrabold", editing ? "bg-foreground text-background border-foreground" : "border-foreground/20 bg-card hover:border-foreground")}
                >
                    <Settings2 className="w-3.5 h-3.5" />
                    {editing ? t('done') : t('customize')}
                </button>
            </div>

            {editing && (
                <Panel title={t('pickTitle')}>
                    <p className="px-3 py-2 text-[11px] font-semibold text-muted-foreground border-b border-muted">{t('pickHint')}</p>
                    <ul className="flex flex-col max-h-[300px] overflow-y-auto [scrollbar-width:thin]">
                        {catalog.map((c) => {
                            const on = favorites.includes(c.slug);
                            return (
                                <li key={c.slug}>
                                    <label className="flex items-center gap-2 px-3 h-8 border-t border-muted first:border-t-0 text-[13px] font-bold cursor-pointer hover:bg-muted/60">
                                        <input type="checkbox" checked={on} onChange={() => toggle(c.slug)} className="accent-[rgb(var(--foreground))] w-3.5 h-3.5" />
                                        {c.logoUrl && (
                                            // eslint-disable-next-line @next/next/no-img-element
                                            <img src={c.logoUrl} alt="" width={16} height={16} loading="lazy" className="object-contain" />
                                        )}
                                        <span className="truncate">{c.name}</span>
                                    </label>
                                </li>
                            );
                        })}
                    </ul>
                </Panel>
            )}

            {slugs.length === 0 && <p className="px-1 text-[12px] font-semibold text-muted-foreground">{t('noFavorites')}</p>}

            {slugs.map((slug) => {
                const table = tables[slug];
                return (
                    <Panel
                        key={slug}
                        scroll
                        title={nameOf(slug)}
                        action={<Link href={`/competitions/${slug}`} className="text-[11px] font-extrabold underline decoration-accent decoration-[2px] underline-offset-2 whitespace-nowrap">{t('fullStandings')}</Link>}
                    >
                        {table === undefined ? (
                            <p className="px-3 py-3 text-[12px] font-semibold text-muted-foreground animate-pulse">…</p>
                        ) : (
                            <StandingsTable groups={table?.groups ?? []} compact />
                        )}
                    </Panel>
                );
            })}
        </>
    );
}
