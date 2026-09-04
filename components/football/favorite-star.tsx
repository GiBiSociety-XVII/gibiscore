'use client';

import {Star} from "lucide-react";
import {useTranslations} from "next-intl";
import {cn} from "@/components/shared/ui/cn";
import {useFavoriteTeams, useFavorites} from "@/lib/favorites";

/** Star toggle for a competition (default) or a team, kept in the browser. */
export function FavoriteStar({slug, kind = 'competition', className, size = 14}: {slug: string; kind?: 'competition' | 'team'; className?: string; size?: number}) {
    const t = useTranslations('Common.rail');
    const competitions = useFavorites();
    const teams = useFavoriteTeams();
    const store = kind === 'team' ? teams : competitions;
    const on = store.isFavorite(slug);
    return (
        <button
            type="button"
            onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                store.toggle(slug);
            }}
            aria-pressed={on}
            aria-label={on ? t('removeFavorite') : t('addFavorite')}
            title={on ? t('removeFavorite') : t('addFavorite')}
            className={cn("inline-flex items-center justify-center w-6 h-6 rounded-md hover:bg-muted transition-colors", on ? "text-foreground" : "text-muted-foreground/50 hover:text-foreground", className)}
        >
            <Star style={{width: size, height: size}} className={cn(on && "fill-accent stroke-foreground")} strokeWidth={2.5} />
        </button>
    );
}
