'use client';

import {Search} from "lucide-react";
import {useTranslations} from "next-intl";
import {Link, usePathname} from "@/i18n/navigation";
import {cn} from "@/components/shared/ui/cn";
import {BrandIcon, BrandLockup} from "@/components/shared/layout/logo";

// URLs are English like on GiBiArena; labels come from AppBar.json.
const NAV_ITEMS = [
    {key: 'scores', href: '/', match: (p: string) => p === '/' || p.startsWith('/scores')},
    {key: 'live', href: '/live', match: (p: string) => p.startsWith('/live')},
    {key: 'competitions', href: '/competitions', match: (p: string) => p.startsWith('/competitions')},
    {key: 'stats', href: '/stats', match: (p: string) => p.startsWith('/stats')},
] as const;

/** Same bar as gibiarena.com: lockup, big section links, bordered pills on the right. */
export default function AppBar() {
    const path = usePathname();
    const t = useTranslations("AppBar");

    return (
        <header className="sticky top-0 z-50 w-full bg-background border-b-[2.5px] border-foreground">
            <div className="w-full max-w-[1600px] mx-auto px-3 md:px-6">
                <div className="flex h-16 md:h-20 items-center gap-3 md:gap-6">
                    <Link href="/" className="flex items-center shrink-0" aria-label="GiBiScore">
                        <BrandLockup height={48} className="hidden sm:block h-10 md:h-12 w-auto" />
                        <BrandIcon size={40} className="sm:hidden" alt="GiBiScore" />
                    </Link>

                    <nav aria-label={t('sectionsLabel')} className="flex items-center gap-1 md:gap-2 overflow-x-auto [scrollbar-width:none]">
                        {NAV_ITEMS.map(({key, href, match}) => {
                            const active = match(path);
                            return (
                                <Link
                                    key={key}
                                    href={href}
                                    aria-current={active ? 'page' : undefined}
                                    className={cn(
                                        "inline-flex items-center h-9 md:h-10 px-2.5 md:px-3.5 rounded-lg text-[14px] md:text-[17px] font-bold whitespace-nowrap transition-colors",
                                        active ? "text-foreground bg-accent/40 border-2 border-foreground" : "text-foreground/70 hover:text-foreground hover:bg-muted",
                                    )}
                                >
                                    {key === 'live' && <span className={cn("w-2 h-2 rounded-full mr-1.5 border border-foreground", active ? "bg-foreground" : "bg-accent")} aria-hidden="true" />}
                                    {t(`nav.${key}`)}
                                </Link>
                            );
                        })}
                    </nav>

                    <form action="/search" method="get" className="ml-auto flex items-center gap-2 h-10 md:h-12 px-3 md:px-4 w-11 md:w-[240px] rounded-xl border-[2.5px] border-foreground bg-card text-muted-foreground shadow-[4px_4px_0_rgb(var(--foreground))] focus-within:text-foreground focus-within:shadow-[2px_2px_0_rgb(var(--foreground))] focus-within:translate-x-[2px] focus-within:translate-y-[2px] transition-all">
                        <Search className="w-4 h-4 shrink-0 text-foreground" />
                        <input
                            type="search"
                            name="q"
                            placeholder={t('search')}
                            aria-label={t('search')}
                            className="hidden md:block w-full bg-transparent outline-none text-[14px] font-bold placeholder:text-muted-foreground text-foreground"
                        />
                    </form>
                </div>
            </div>
        </header>
    );
}
