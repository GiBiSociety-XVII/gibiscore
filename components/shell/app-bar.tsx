'use client';

import {Search} from "lucide-react";
import {useTranslations} from "next-intl";
import {Link, usePathname} from "@/i18n/navigation";
import {cn} from "@/components/shared/ui/cn";
import {LogoMark} from "@/components/shared/layout/logo";

// URLs are English like on GiBiArena; labels come from AppBar.json.
const NAV_ITEMS = [
    {key: 'scores', href: '/', match: (p: string) => p === '/' || p.startsWith('/scores')},
    {key: 'live', href: '/live', match: (p: string) => p.startsWith('/live')},
    {key: 'competitions', href: '/competitions', match: (p: string) => p.startsWith('/competitions')},
] as const;

/** Ink bar, always visible: brand, three sections, search. */
export default function AppBar() {
    const path = usePathname();
    const t = useTranslations("AppBar");

    return (
        <header className="sticky top-0 z-50 w-full bg-foreground text-background border-b-[2.5px] border-foreground">
            <div className="w-full max-w-[1600px] mx-auto px-2 md:px-4">
                <div className="flex h-12 items-center gap-2 md:gap-4">
                    <Link href="/" className="flex items-center gap-2 shrink-0">
                        <LogoMark className="h-8 w-8 rounded-lg border-background shadow-[3px_3px_0_rgb(var(--accent))]" />
                        <span className="text-base font-black tracking-tight">GiBiScore</span>
                    </Link>

                    <nav aria-label={t('sectionsLabel')} className="flex items-center gap-0.5 ml-1 md:ml-3 overflow-x-auto">
                        {NAV_ITEMS.map(({key, href, match}) => {
                            const active = match(path);
                            return (
                                <Link
                                    key={key}
                                    href={href}
                                    aria-current={active ? 'page' : undefined}
                                    className={cn(
                                        "px-2.5 md:px-3 h-8 inline-flex items-center rounded-md text-[13px] font-extrabold whitespace-nowrap transition-colors",
                                        active ? "bg-accent text-accent-foreground" : "text-background/80 hover:text-background hover:bg-background/10",
                                    )}
                                >
                                    {key === 'live' && <span className={cn("w-1.5 h-1.5 rounded-full mr-1.5", active ? "bg-foreground" : "bg-accent")} aria-hidden="true" />}
                                    {t(`nav.${key}`)}
                                </Link>
                            );
                        })}
                    </nav>

                    <form action="/competitions" method="get" className="ml-auto hidden md:flex items-center gap-2 h-8 px-2.5 w-[220px] rounded-md bg-background/10 text-background/70 focus-within:bg-background focus-within:text-foreground transition-colors">
                        <Search className="w-4 h-4 shrink-0" />
                        <input
                            type="search"
                            name="q"
                            placeholder={t('search')}
                            aria-label={t('search')}
                            className="w-full bg-transparent outline-none text-[13px] font-semibold placeholder:text-current"
                        />
                    </form>
                </div>
            </div>
        </header>
    );
}
