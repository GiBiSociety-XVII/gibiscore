'use client';

import {Search} from "lucide-react";
import {useTranslations} from "next-intl";
import {Link, usePathname} from "@/i18n/navigation";
import {buttonClasses} from "@/components/shared/ui/button";
import {cn} from "@/components/shared/ui/cn";
import {LogoMark} from "./logo";

const NAV_ITEMS = [
    {key: 'live', href: '/'},
    {key: 'serieA', href: '/serie-a'},
    {key: 'teams', href: '/squadre'},
    {key: 'players', href: '/giocatori'},
    {key: 'rankings', href: '/classifiche'},
] as const;

export default function AppBar() {
    const path = usePathname();
    const t = useTranslations("AppBar");

    return (
        <header className="sticky top-0 z-50 w-full bg-background border-b-[2.5px] border-foreground">
            <div className="w-full px-4 md:px-8">
                <div className="flex h-20 items-center justify-between gap-3">
                    <div className="flex items-center gap-4 min-w-0">
                        <Link href="/" className="flex items-center gap-2.5 group shrink-0">
                            <LogoMark className="group-hover:opacity-80 transition-opacity" />
                            <span className="text-[22px] font-black tracking-tight">GiBiScore</span>
                        </Link>

                        <nav aria-label={t('sectionsLabel')} className="hidden lg:flex items-center gap-1 ml-2">
                            {NAV_ITEMS.map(({key, href}) => {
                                const active = href === '/' ? path === '/' : path.startsWith(href);
                                return (
                                    <Link
                                        key={key}
                                        href={href}
                                        className={cn(
                                            "px-4 py-2.5 rounded-[10px] text-base font-bold transition-colors hover:bg-muted",
                                            active ? "bg-muted text-foreground" : "text-foreground/70 hover:text-foreground",
                                        )}
                                    >
                                        {t(`nav.${key}`)}
                                    </Link>
                                );
                            })}
                        </nav>
                    </div>

                    <div className="flex items-center gap-3 shrink-0">
                        <label className="hidden md:flex items-center gap-2 bb-input px-3.5 py-2.5 w-[220px] text-sm text-muted-foreground cursor-text">
                            <Search className="w-4 h-4 text-foreground shrink-0" />
                            <input
                                type="search"
                                placeholder={t('search')}
                                className="w-full bg-transparent outline-none placeholder:text-muted-foreground text-foreground"
                                aria-label={t('search')}
                            />
                        </label>
                        <Link href="/account" className={buttonClasses('secondary', 'default')}>
                            {t('login')}
                        </Link>
                    </div>
                </div>
            </div>
        </header>
    );
}
