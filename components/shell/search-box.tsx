'use client';

import {Search} from "lucide-react";
import {useEffect, useId, useRef, useState} from "react";
import {useTranslations} from "next-intl";
import {useRouter} from "@/i18n/navigation";
import {cn} from "@/components/shared/ui/cn";

interface Hit {
    name: string;
    slug: string;
    logoUrl: string | null;
    hint: string | null;
}
interface Hits {
    teams: Hit[];
    players: Hit[];
    competitions: Hit[];
}

const EMPTY: Hits = {teams: [], players: [], competitions: []};

/** Header search with live suggestions; Enter opens the full results page. */
export function SearchBox() {
    const t = useTranslations('AppBar');
    const router = useRouter();
    const [q, setQ] = useState('');
    const [hits, setHits] = useState<Hits>(EMPTY);
    const [open, setOpen] = useState(false);
    const [cursor, setCursor] = useState(-1);
    const box = useRef<HTMLFormElement>(null);
    const listId = useId();

    useEffect(() => {
        const query = q.trim();
        if (query.length < 2) return;
        const controller = new AbortController();
        const id = window.setTimeout(() => {
            fetch(`/api/search?q=${encodeURIComponent(query)}`, {signal: controller.signal})
                .then((r) => (r.ok ? (r.json() as Promise<Hits>) : EMPTY))
                .then((data) => {
                    setHits(data);
                    setCursor(-1);
                })
                .catch(() => undefined);
        }, 220);
        return () => {
            window.clearTimeout(id);
            controller.abort();
        };
    }, [q]);

    useEffect(() => {
        const onClick = (e: MouseEvent) => {
            if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
        };
        document.addEventListener('mousedown', onClick);
        return () => document.removeEventListener('mousedown', onClick);
    }, []);

    const active = q.trim().length >= 2 ? hits : EMPTY;
    const flat: Array<Hit & {href: string}> = [
        ...active.teams.map((h) => ({...h, href: `/teams/${h.slug}`})),
        ...active.players.map((h) => ({...h, href: `/players/${h.slug}`})),
        ...active.competitions.map((h) => ({...h, href: `/competitions/${h.slug}`})),
    ];
    const groups: Array<{key: keyof Hits; label: string; offset: number}> = [
        {key: 'teams', label: t('searchTeams'), offset: 0},
        {key: 'players', label: t('searchPlayers'), offset: active.teams.length},
        {key: 'competitions', label: t('searchCompetitions'), offset: active.teams.length + active.players.length},
    ];
    const show = open && q.trim().length >= 2;

    const go = (href: string) => {
        setOpen(false);
        router.push(href);
    };

    return (
        <form
            ref={box}
            action="/search"
            method="get"
            role="search"
            onSubmit={(e) => {
                if (cursor >= 0 && flat[cursor]) {
                    e.preventDefault();
                    go(flat[cursor].href);
                }
            }}
            className="relative ml-auto"
        >
            <div className="flex items-center gap-2 h-10 md:h-12 px-3 md:px-4 w-11 md:w-[240px] rounded-xl border-[2.5px] border-foreground bg-card text-muted-foreground shadow-[4px_4px_0_rgb(var(--foreground))] focus-within:text-foreground focus-within:shadow-[2px_2px_0_rgb(var(--foreground))] focus-within:translate-x-[2px] focus-within:translate-y-[2px] transition-all">
                <Search className="w-4 h-4 shrink-0 text-foreground" />
                <input
                    type="search"
                    name="q"
                    value={q}
                    onChange={(e) => {
                        setQ(e.target.value);
                        setOpen(true);
                    }}
                    onFocus={() => setOpen(true)}
                    onKeyDown={(e) => {
                        if (!show) return;
                        if (e.key === 'ArrowDown') {
                            e.preventDefault();
                            setCursor((c) => Math.min(c + 1, flat.length - 1));
                        } else if (e.key === 'ArrowUp') {
                            e.preventDefault();
                            setCursor((c) => Math.max(c - 1, -1));
                        } else if (e.key === 'Escape') {
                            setOpen(false);
                        }
                    }}
                    placeholder={t('search')}
                    aria-label={t('search')}
                    role="combobox"
                    aria-autocomplete="list"
                    aria-controls={listId}
                    aria-expanded={show}
                    autoComplete="off"
                    className="hidden md:block w-full bg-transparent outline-none text-[14px] font-bold placeholder:text-muted-foreground text-foreground"
                />
            </div>

            {show && (
                <div id={listId} role="listbox" className="absolute right-0 top-[calc(100%+8px)] w-[320px] max-w-[calc(100vw-24px)] bb-surface shadow-[6px_6px_0_rgb(var(--foreground))] overflow-hidden z-50">
                    {flat.length === 0 ? (
                        <p className="px-3 py-3 text-[13px] font-semibold text-muted-foreground">{t('searchNone')}</p>
                    ) : (
                        groups
                            .filter((g) => active[g.key].length > 0)
                            .map((g) => (
                                <div key={g.key}>
                                    <div className="px-3 h-7 flex items-center text-[10px] font-extrabold uppercase tracking-wider text-muted-foreground bg-muted/60">{g.label}</div>
                                    {active[g.key].map((h, i) => {
                                        const index = g.offset + i;
                                        return (
                                            <button
                                                key={`${g.key}-${h.slug}`}
                                                type="button"
                                                role="option"
                                                aria-selected={cursor === index}
                                                onMouseEnter={() => setCursor(index)}
                                                onClick={() => go(flat[index].href)}
                                                className={cn("w-full flex items-center gap-2.5 px-3 h-10 text-left border-t border-muted first:border-t-0", cursor === index ? "bg-accent/40" : "hover:bg-muted/60")}
                                            >
                                                <span className={cn("inline-flex w-6 h-6 items-center justify-center overflow-hidden shrink-0", g.key === 'players' ? "rounded-full bg-muted" : "")}>
                                                    {h.logoUrl && (
                                                        // eslint-disable-next-line @next/next/no-img-element
                                                        <img src={h.logoUrl} alt="" width={24} height={24} loading="lazy" className="object-contain w-full h-full" />
                                                    )}
                                                </span>
                                                <span className="flex flex-col leading-tight min-w-0">
                                                    <span className="text-[13px] font-bold truncate">{h.name}</span>
                                                    {h.hint && <span className="text-[11px] font-semibold text-muted-foreground truncate">{h.hint}</span>}
                                                </span>
                                            </button>
                                        );
                                    })}
                                </div>
                            ))
                    )}
                    <div className="px-3 h-8 flex items-center text-[11px] font-semibold text-muted-foreground border-t-2 border-foreground bg-card">{t('searchHint')}</div>
                </div>
            )}
        </form>
    );
}
