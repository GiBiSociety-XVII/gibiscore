'use client';

import {useEffect, useState} from "react";
import {useTranslations} from "next-intl";
import {Link} from "@/i18n/navigation";
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
 * (starred in the scores list or the sidebar, kept in the browser).
 * Without favourites, the pinned competitions playing that day. Tables
 * are fetched from a cached API route so the page itself stays static.
 */
export function FavoritesRail({defaults, catalog}: {defaults: string[]; catalog: RailCompetition[]}) {
    const t = useTranslations('Common.rail');
    const {favorites} = useFavorites();
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
            <span className="px-1 text-[10px] font-extrabold uppercase tracking-wider text-muted-foreground">{favorites.length > 0 ? t('favorites') : t('standings')}</span>
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
