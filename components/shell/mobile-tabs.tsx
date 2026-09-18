'use client';

import {useEffect, useState} from "react";
import {CalendarDays, Menu, Radio, Sparkles, TrendingUp} from "lucide-react";
import {useTranslations} from "next-intl";
import {Link, usePathname} from "@/i18n/navigation";
import {cn} from "@/components/shared/ui/cn";
import {MobileMenu} from "./mobile-menu";

/**
 * Bottom tab bar on phones: the four places people go most (scores,
 * live, predictions, fantasy) and the menu with everything else
 * (competitions, statistics, account, search). Search also sits in the
 * app bar.
 */
export function MobileTabs() {
    const path = usePathname();
    const t = useTranslations('AppBar.nav');
    const [menu, setMenu] = useState(false);
    // A navigation closes the menu.
    useEffect(() => {
        queueMicrotask(() => setMenu(false));
    }, [path]);
    const menuActive = menu || ['/competitions', '/stats', '/injuries', '/compare', '/account', '/search', '/signin', '/signup'].some((p) => path.startsWith(p));
    const tabs = [
        {key: 'scores', href: '/', icon: CalendarDays, active: !menu && (path === '/' || path.startsWith('/scores'))},
        {key: 'live', href: '/live', icon: Radio, active: !menu && path.startsWith('/live')},
        {key: 'predictions', href: '/predictions', icon: TrendingUp, active: !menu && path.startsWith('/predictions')},
        {key: 'fantasy', href: '/fantacalcio', icon: Sparkles, active: !menu && path.startsWith('/fantacalcio')},
    ] as const;
    const item = (active: boolean) => cn("flex flex-col items-center justify-center gap-0.5 h-14 w-full text-[10px] font-extrabold uppercase tracking-wide", active ? "text-foreground" : "text-muted-foreground");
    const pill = (active: boolean) => cn("inline-flex w-9 h-6 items-center justify-center rounded-lg", active && "bg-accent border-2 border-foreground");
    return (
        <>
            {menu && <MobileMenu onClose={() => setMenu(false)} />}
            <nav data-tour="mobileTabs" aria-label={t('scores')} className="lg:hidden fixed bottom-0 inset-x-0 z-[70] bg-background border-t-[2.5px] border-foreground pb-[env(safe-area-inset-bottom)]">
                <ul className="grid grid-cols-5">
                    {tabs.map(({key, href, icon: Icon, active}) => (
                        <li key={key}>
                            <Link href={href} aria-current={active ? 'page' : undefined} onClick={() => setMenu(false)} className={item(active)}>
                                <span className={pill(active)}><Icon className="w-4 h-4" /></span>
                                {t(key)}
                            </Link>
                        </li>
                    ))}
                    <li>
                        <button type="button" onClick={() => setMenu((v) => !v)} aria-expanded={menu} aria-haspopup="dialog" className={item(menuActive)}>
                            <span className={pill(menuActive)}><Menu className="w-4 h-4" /></span>
                            {t('menu')}
                        </button>
                    </li>
                </ul>
            </nav>
        </>
    );
}
