'use client';

import {BarChart3, CalendarDays, Radio, Sparkles, Trophy} from "lucide-react";
import {useTranslations} from "next-intl";
import {Link, usePathname} from "@/i18n/navigation";
import {cn} from "@/components/shared/ui/cn";

/** Bottom tab bar on phones, as on GiBiArena: the four sections and the fantasy tools (search sits in the app bar). */
export function MobileTabs() {
    const path = usePathname();
    const t = useTranslations('AppBar.nav');
    const tabs = [
        {key: 'scores', href: '/', icon: CalendarDays, active: path === '/' || path.startsWith('/scores')},
        {key: 'live', href: '/live', icon: Radio, active: path.startsWith('/live')},
        {key: 'competitions', href: '/competitions', icon: Trophy, active: path.startsWith('/competitions')},
        {key: 'stats', href: '/stats', icon: BarChart3, active: path.startsWith('/stats') || path.startsWith('/injuries') || path.startsWith('/compare') || path.startsWith('/predictions')},
        {key: 'fantasy', href: '/fantacalcio', icon: Sparkles, active: path.startsWith('/fantacalcio')},
    ] as const;
    return (
        <nav aria-label={t('scores')} className="lg:hidden fixed bottom-0 inset-x-0 z-40 bg-background border-t-[2.5px] border-foreground pb-[env(safe-area-inset-bottom)]">
            <ul className="grid grid-cols-5">
                {tabs.map(({key, href, icon: Icon, active}) => (
                    <li key={key}>
                        <Link href={href} aria-current={active ? 'page' : undefined} className={cn("flex flex-col items-center justify-center gap-0.5 h-14 text-[10px] font-extrabold uppercase tracking-wide", active ? "text-foreground" : "text-muted-foreground")}>
                            <span className={cn("inline-flex w-9 h-6 items-center justify-center rounded-lg", active && "bg-accent border-2 border-foreground")}>
                                <Icon className="w-4 h-4" />
                            </span>
                            {t(key)}
                        </Link>
                    </li>
                ))}
            </ul>
        </nav>
    );
}
