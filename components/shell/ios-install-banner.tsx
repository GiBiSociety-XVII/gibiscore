'use client';

import {useEffect, useState} from "react";
import {Share, X} from "lucide-react";
import {useTranslations} from "next-intl";

const KEY = 'gibiscore:ios-install:v1';

/**
 * On an iPhone or iPad in Safari, not yet on the Home Screen: one strip
 * that says how to add the site there, since that is the only way Apple
 * lets the notifications through. Dismissed once, never again.
 */
export function IosInstallBanner() {
    const t = useTranslations('Common.iosBanner');
    const [shown, setShown] = useState(false);
    useEffect(() => {
        const ios = /iP(hone|ad|od)/.test(navigator.userAgent);
        const standalone = (navigator as Navigator & {standalone?: boolean}).standalone === true || window.matchMedia('(display-mode: standalone)').matches;
        let dismissed = false;
        try {
            dismissed = !!localStorage.getItem(KEY);
        } catch {
            dismissed = false;
        }
        if (ios && !standalone && !dismissed) queueMicrotask(() => setShown(true));
    }, []);
    if (!shown) return null;
    const dismiss = () => {
        setShown(false);
        try {
            localStorage.setItem(KEY, '1');
        } catch {
            // Shown again next time: no harm.
        }
    };
    return (
        <div role="note" className="lg:hidden fixed inset-x-2 bottom-[calc(3.5rem+env(safe-area-inset-bottom)+0.5rem)] z-[45] bb-surface bg-card px-3 py-2.5 flex items-start gap-3 shadow-[4px_4px_0_rgb(var(--foreground))]">
            <span className="inline-flex w-9 h-9 shrink-0 items-center justify-center rounded-lg border-2 border-foreground bg-accent"><Share className="w-4 h-4" aria-hidden="true" /></span>
            <span className="flex flex-col gap-0.5 text-[12px] font-semibold leading-snug min-w-0">
                <span className="text-[13px] font-extrabold">{t('title')}</span>
                <span className="text-muted-foreground">{t('text')}</span>
            </span>
            <button type="button" onClick={dismiss} aria-label={t('dismiss')} className="ml-auto shrink-0 inline-flex items-center justify-center w-8 h-8 rounded-md border-2 border-foreground bg-background"><X className="w-4 h-4" /></button>
        </div>
    );
}
