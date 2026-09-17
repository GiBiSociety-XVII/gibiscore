'use client';

import {useEffect, useState} from "react";
import {Radio, Sparkles, TrendingUp, X} from "lucide-react";
import {useTranslations} from "next-intl";
import {Link} from "@/i18n/navigation";

const KEY = 'gibiscore:welcome:v1';

/**
 * Three doors for whoever lands on the front page for the first time:
 * live, predictions, fantasy, one line each. Dismissed once, it stays
 * dismissed on that browser. Nothing is drawn until the browser says
 * whether it was dismissed, so returning visitors never see it flash.
 */
export function WelcomeStrip() {
    const t = useTranslations('HomePage.welcome');
    const [shown, setShown] = useState(false);
    useEffect(() => {
        try {
            if (!localStorage.getItem(KEY)) queueMicrotask(() => setShown(true));
        } catch {
            queueMicrotask(() => setShown(true));
        }
    }, []);
    if (!shown) return null;
    const dismiss = () => {
        setShown(false);
        try {
            localStorage.setItem(KEY, '1');
        } catch {
            // A browser without storage shows it again next time: no harm.
        }
    };
    const doors = [
        {key: 'live', href: '/live' as const, Icon: Radio},
        {key: 'predictions', href: '/predictions' as const, Icon: TrendingUp},
        {key: 'fantasy', href: '/fantacalcio' as const, Icon: Sparkles},
    ];
    return (
        <section data-tour="welcome" className="bb-surface overflow-hidden" aria-label={t('title')}>
            <div className="flex items-center justify-between gap-2 px-3 h-9 border-b-2 border-foreground bg-card">
                <h2 className="text-[13px] font-extrabold uppercase tracking-wide truncate">{t('title')}</h2>
                <button type="button" onClick={dismiss} className="bb-btn bg-background h-7 px-2.5 text-[11px] font-extrabold inline-flex items-center gap-1"><X className="w-3.5 h-3.5" aria-hidden="true" />{t('dismiss')}</button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 md:divide-x divide-muted">
                {doors.map(({key, href, Icon}) => (
                    <Link key={key} href={href} className="flex flex-col gap-1 px-3 py-2.5 hover:bg-muted/60">
                        <span className="inline-flex items-center gap-1.5 text-[13px] font-extrabold"><Icon className="w-4 h-4" aria-hidden="true" />{t(`${key}.title`)}</span>
                        <span className="text-[12px] font-semibold text-muted-foreground leading-snug">{t(`${key}.text`)}</span>
                        <span className="text-[12px] font-extrabold underline decoration-accent decoration-[2px] underline-offset-2">{t(`${key}.cta`)}</span>
                    </Link>
                ))}
            </div>
        </section>
    );
}
