'use client';

import {Check, Search, X} from "lucide-react";
import {useEffect, useState} from "react";
import {useTranslations} from "next-intl";
import {Link, useRouter} from "@/i18n/navigation";

interface Hit {
    name: string;
    slug: string;
    logoUrl: string | null;
    hint: string | null;
}

export interface PickedPlayer {
    name: string;
    slug: string;
    imageUrl: string | null;
    hint: string | null;
}

function Avatar({src, size}: {src: string | null; size: number}) {
    return (
        <span className="inline-flex rounded-full bg-muted overflow-hidden shrink-0" style={{width: size, height: size}}>
            {src && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={src} alt="" width={size} height={size} loading="lazy" className="object-cover w-full h-full" />
            )}
        </span>
    );
}

/**
 * One side of the comparison: the chosen player as a card ("Cambia" to
 * pick another), otherwise a search box that writes the player's slug
 * into the compare URL.
 */
export function PlayerPicker({param, other, otherParam, placeholder, selected = null, season}: {param: 'a' | 'b'; other: string | null; otherParam: 'a' | 'b'; placeholder: string; selected?: PickedPlayer | null; season?: number}) {
    const t = useTranslations('Pages.compare');
    const router = useRouter();
    const [q, setQ] = useState('');
    const [hits, setHits] = useState<Hit[]>([]);
    const [changing, setChanging] = useState(false);

    useEffect(() => {
        const query = q.trim();
        if (query.length < 2) return;
        const controller = new AbortController();
        const id = window.setTimeout(() => {
            fetch(`/api/search?q=${encodeURIComponent(query)}`, {signal: controller.signal})
                .then((r) => (r.ok ? (r.json() as Promise<{players: Hit[]}>) : {players: []}))
                .then((data) => setHits(data.players))
                .catch(() => undefined);
        }, 220);
        return () => {
            window.clearTimeout(id);
            controller.abort();
        };
    }, [q]);

    const navigate = (slug: string | null) => {
        const params = new URLSearchParams();
        if (slug) params.set(param, slug);
        if (other) params.set(otherParam, other);
        if (season) params.set('season', String(season));
        setQ('');
        setChanging(false);
        router.push(`/compare?${params.toString()}`);
    };
    const visible = q.trim().length >= 2 ? hits : [];
    const showCard = selected !== null && !changing;

    if (showCard) {
        return (
            <div className="bb-surface flex items-center gap-3 px-3 h-14 border-accent-text" aria-live="polite">
                <Avatar src={selected.imageUrl} size={36} />
                <span className="flex flex-col leading-tight min-w-0 flex-1">
                    <span className="inline-flex items-center gap-1.5 text-[10px] font-extrabold uppercase tracking-wide text-accent-text"><Check className="w-3.5 h-3.5" aria-hidden="true" />{t('selected')}</span>
                    <Link href={`/players/${selected.slug}`} className="text-[14px] font-extrabold truncate hover:underline decoration-accent decoration-[3px] underline-offset-2">{selected.name}</Link>
                    {selected.hint && <span className="text-[11px] font-semibold text-muted-foreground truncate">{selected.hint}</span>}
                </span>
                <button type="button" onClick={() => setChanging(true)} className="bb-btn bg-card px-2.5 h-8 text-[12px] font-extrabold">{t('change')}</button>
                <button type="button" onClick={() => navigate(null)} aria-label={t('remove')} title={t('remove')} className="inline-flex items-center justify-center w-8 h-8 rounded-md border-2 border-foreground bg-card hover:bg-accent">
                    <X className="w-4 h-4" aria-hidden="true" />
                </button>
            </div>
        );
    }

    return (
        <div className="flex flex-col gap-1.5">
            <label className="flex items-center gap-2 bb-input px-3 h-10">
                <Search className="w-4 h-4 shrink-0" />
                <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={placeholder} aria-label={placeholder} autoComplete="off" autoFocus={changing} className="w-full bg-transparent outline-none text-[14px] font-semibold" />
                {changing && (
                    <button type="button" onClick={() => setChanging(false)} className="text-[11px] font-extrabold text-muted-foreground hover:text-foreground whitespace-nowrap">{t('cancel')}</button>
                )}
            </label>
            {visible.length > 0 && (
                <ul className="bb-surface overflow-hidden">
                    {visible.map((h) => (
                        <li key={h.slug}>
                            <button type="button" onClick={() => navigate(h.slug)} className="w-full flex items-center gap-2.5 px-3 h-10 text-left border-t border-muted first:border-t-0 hover:bg-muted/60">
                                <Avatar src={h.logoUrl} size={24} />
                                <span className="flex flex-col leading-tight min-w-0">
                                    <span className="text-[13px] font-bold truncate">{h.name}</span>
                                    {h.hint && <span className="text-[11px] font-semibold text-muted-foreground truncate">{h.hint}</span>}
                                </span>
                            </button>
                        </li>
                    ))}
                </ul>
            )}
            {q.trim().length >= 2 && visible.length === 0 && <p className="text-[12px] font-semibold text-muted-foreground">{t('noResults')}</p>}
        </div>
    );
}
