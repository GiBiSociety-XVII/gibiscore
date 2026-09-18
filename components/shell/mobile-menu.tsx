'use client';

import {useEffect, useState} from "react";
import {BarChart3, CalendarDays, Search, Sparkles, TrendingUp, Trophy, UserRound, X} from "lucide-react";
import {useTranslations} from "next-intl";
import {Link} from "@/i18n/navigation";
import {cn} from "@/components/shared/ui/cn";
import {createClient} from "@/lib/db/client";
import {BrandLockup} from "@/components/shared/layout/logo";
import {useNavColumns} from "./nav-sections";

interface Item {
    label: string;
    href: string;
    hint?: string;
}

/**
 * The phone menu, from the "Menu" tab of the bottom bar: every section
 * of the site on one scrolling sheet, the account on top. On desktop the
 * same links live in the app bar's dropdowns.
 */
export function MobileMenu({onClose}: {onClose: () => void}) {
    const t = useTranslations('AppBar');
    const mm = useTranslations('AppBar.mobileMenu');
    const tf = useTranslations('Fantasy');
    const {scoresColumns, competitionColumns, statsColumns} = useNavColumns();
    const [signedIn, setSignedIn] = useState<boolean | null>(null);

    useEffect(() => {
        let alive = true;
        try {
            createClient().auth.getSession().then(({data}) => { if (alive) setSignedIn(!!data.session); }).catch(() => { if (alive) setSignedIn(false); });
        } catch {
            queueMicrotask(() => setSignedIn(false));
        }
        const key = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
        document.addEventListener('keydown', key);
        // The page behind must not scroll along.
        const previous = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => {
            alive = false;
            document.removeEventListener('keydown', key);
            document.body.style.overflow = previous;
        };
    }, [onClose]);

    const sections: Array<{key: string; title: string; Icon: typeof Trophy; overview?: Item; items: Item[]}> = [
        {key: 'scores', title: t('nav.scores'), Icon: CalendarDays, items: scoresColumns.flatMap((c) => c.items)},
        {key: 'competitions', title: t('nav.competitions'), Icon: Trophy, overview: {label: t('menus.competitions.overview'), href: '/competitions'}, items: competitionColumns.flatMap((c) => c.items)},
        {key: 'predictions', title: t('nav.predictions'), Icon: TrendingUp, items: [{label: mm('predictions.list'), href: '/predictions'}, {label: mm('predictions.record'), href: '/predictions/record'}]},
        {key: 'stats', title: t('nav.stats'), Icon: BarChart3, overview: {label: t('menus.stats.overview'), href: '/stats'}, items: statsColumns.flatMap((c) => c.items)},
        {key: 'fantasy', title: tf('nav'), Icon: Sparkles, overview: {label: mm('fantasy.hub'), href: '/fantacalcio'}, items: [{label: mm('fantasy.auction'), href: '/fantacalcio/asta'}, {label: mm('fantasy.lineup'), href: '/fantacalcio/formazione'}, {label: mm('fantasy.model'), href: '/fantacalcio/modello'}]},
    ];
    const link = "flex items-center justify-between gap-2 px-3 h-11 rounded-lg border-2 border-foreground bg-card text-[14px] font-extrabold active:bg-accent";

    return (
        <div role="dialog" aria-modal="true" aria-label={mm('title')} className="lg:hidden fixed inset-0 z-[60] bg-background overflow-y-auto overscroll-contain pb-[calc(4rem+env(safe-area-inset-bottom))]">
            <div className="sticky top-0 z-10 flex items-center gap-3 px-3 h-16 bg-background border-b-[2.5px] border-foreground">
                <BrandLockup height={40} className="h-9 w-auto" />
                <span className="text-[13px] font-extrabold uppercase tracking-wide text-muted-foreground">{mm('title')}</span>
                <button type="button" onClick={onClose} aria-label={mm('close')} className="ml-auto inline-flex items-center justify-center w-10 h-10 rounded-lg border-2 border-foreground bg-card"><X className="w-5 h-5" /></button>
            </div>
            <div className="px-3 py-3 flex flex-col gap-4">
                <div className="grid grid-cols-2 gap-2">
                    <Link href="/search" onClick={onClose} className={cn(link, "bg-accent")}><span className="inline-flex items-center gap-2"><Search className="w-4 h-4" aria-hidden="true" />{t('nav.search')}</span></Link>
                    {signedIn ? (
                        <Link href="/account" onClick={onClose} className={link}><span className="inline-flex items-center gap-2"><UserRound className="w-4 h-4" aria-hidden="true" />{mm('profile')}</span></Link>
                    ) : (
                        <Link href={{pathname: '/signin', query: {next: '/account'}}} onClick={onClose} className={link}><span className="inline-flex items-center gap-2"><UserRound className="w-4 h-4" aria-hidden="true" />{t('login')}</span></Link>
                    )}
                </div>
                {sections.map(({key, title, Icon, overview, items}) => (
                    <section key={key} className="bb-surface overflow-hidden">
                        <h2 className="flex items-center gap-2 px-3 h-10 border-b-2 border-foreground bg-card text-[13px] font-extrabold uppercase tracking-wide">
                            <Icon className="w-4 h-4" aria-hidden="true" />
                            {title}
                        </h2>
                        <ul className="flex flex-col divide-y divide-muted">
                            {overview && (
                                <li>
                                    <Link href={overview.href} onClick={onClose} className="flex items-center px-3 h-11 text-[14px] font-extrabold underline decoration-accent decoration-[3px] underline-offset-2">{overview.label}</Link>
                                </li>
                            )}
                            {items.map((item) => (
                                <li key={`${item.href}:${item.label}`}>
                                    <Link href={item.href} onClick={onClose} className="flex flex-col justify-center px-3 min-h-11 py-1.5 text-[14px] font-bold active:bg-muted">
                                        {item.label}
                                        {item.hint && <span className="text-[11px] font-semibold text-muted-foreground leading-tight">{item.hint}</span>}
                                    </Link>
                                </li>
                            ))}
                        </ul>
                    </section>
                ))}
                <p className="text-[11px] font-semibold text-muted-foreground px-1">{mm('footer')}</p>
            </div>
        </div>
    );
}
