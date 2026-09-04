'use client';

import {Search} from "lucide-react";
import {useEffect, useState} from "react";
import {useTranslations} from "next-intl";
import {useRouter} from "@/i18n/navigation";

interface Hit {
    name: string;
    slug: string;
    logoUrl: string | null;
    hint: string | null;
}

/** Search box that writes the chosen player's slug into the compare URL. */
export function PlayerPicker({param, other, otherParam, placeholder}: {param: 'a' | 'b'; other: string | null; otherParam: 'a' | 'b'; placeholder: string}) {
    const t = useTranslations('Pages.compare');
    const router = useRouter();
    const [q, setQ] = useState('');
    const [hits, setHits] = useState<Hit[]>([]);

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

    const choose = (slug: string) => {
        const params = new URLSearchParams();
        params.set(param, slug);
        if (other) params.set(otherParam, other);
        router.push(`/compare?${params.toString()}`);
    };
    const visible = q.trim().length >= 2 ? hits : [];

    return (
        <div className="flex flex-col gap-1.5">
            <label className="flex items-center gap-2 bb-input px-3 h-10">
                <Search className="w-4 h-4 shrink-0" />
                <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={placeholder} aria-label={placeholder} autoComplete="off" className="w-full bg-transparent outline-none text-[14px] font-semibold" />
            </label>
            {visible.length > 0 && (
                <ul className="bb-surface overflow-hidden">
                    {visible.map((h) => (
                        <li key={h.slug}>
                            <button type="button" onClick={() => choose(h.slug)} className="w-full flex items-center gap-2.5 px-3 h-10 text-left border-t border-muted first:border-t-0 hover:bg-muted/60">
                                <span className="inline-flex w-6 h-6 rounded-full bg-muted overflow-hidden shrink-0">
                                    {h.logoUrl && (
                                        // eslint-disable-next-line @next/next/no-img-element
                                        <img src={h.logoUrl} alt="" width={24} height={24} loading="lazy" className="object-cover w-full h-full" />
                                    )}
                                </span>
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
