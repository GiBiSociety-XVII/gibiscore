'use client';

import {useEffect, useRef} from "react";
import {useFavorites} from "@/lib/favorites";

/**
 * Moves the blocks of the starred competitions to the top of the scores
 * list, in a "Preferiti" group, without re-rendering the list: the page
 * stays static and the order is the user's.
 */
export function FavoritesFirst({label}: {label: string}) {
    const {favorites} = useFavorites();
    const anchor = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const host = anchor.current;
        if (!host) return;
        const list = host.parentElement;
        if (!list) return;
        // Put every block back where it came from, then pull the favourites.
        for (const block of [...host.querySelectorAll<HTMLElement>('[data-block]')]) {
            const home = block.dataset.home ? document.getElementById(block.dataset.home) : null;
            if (home) home.appendChild(block);
            else host.remove();
        }
        const wanted = favorites
            .map((slug) => list.querySelector<HTMLElement>(`[data-group] [data-block][data-slug="${CSS.escape(slug)}"]`))
            .filter((b): b is HTMLElement => b !== null);
        for (const block of wanted) {
            const group = block.parentElement;
            if (group && !group.id) group.id = `grp-${Math.random().toString(36).slice(2, 8)}`;
            if (group) block.dataset.home = group.id;
            host.appendChild(block);
        }
        host.hidden = wanted.length === 0;
    }, [favorites]);

    return (
        <div ref={anchor} data-group hidden className="border-2 border-foreground rounded-lg overflow-hidden">
            <div className="flex items-center gap-1.5 px-2 h-7 bg-foreground text-background text-[11px] font-extrabold uppercase tracking-wide">
                <span className="w-1.5 h-1.5 rounded-full bg-accent" aria-hidden="true" />
                {label}
            </div>
        </div>
    );
}
