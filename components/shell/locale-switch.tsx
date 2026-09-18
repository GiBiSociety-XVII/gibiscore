'use client';

import {Suspense} from "react";
import {useLocale, useTranslations} from "next-intl";
import {useSearchParams} from "next/navigation";
import {usePathname, useRouter} from "@/i18n/navigation";
import {cn} from "@/components/shared/ui/cn";
import {localeNames, routing, type AppLocale} from "@/i18n/routing";

/**
 * The other language of the site, as a small code in the app bar: the
 * same page opens in it (the query string comes along), and next-intl
 * remembers the choice in its cookie for the visits after.
 */
export function LocaleSwitch({className}: {className?: string}) {
    // The query string is read from the URL: on a static page that needs a boundary of its own.
    return (
        <Suspense fallback={<span className={cn("inline-block w-8 h-10", className)} aria-hidden="true" />}>
            <Switch className={className} />
        </Suspense>
    );
}

function Switch({className}: {className?: string}) {
    const t = useTranslations('Common.locale');
    const locale = useLocale() as AppLocale;
    const pathname = usePathname();
    const search = useSearchParams();
    const router = useRouter();
    const next = routing.locales.find((l) => l !== locale) ?? locale;
    if (next === locale) return null;
    const go = () => {
        const query = search.toString();
        // The pathname is the current page's, without the locale prefix: any route of the site.
        router.replace((query ? `${pathname}?${query}` : pathname) as Parameters<typeof router.replace>[0], {locale: next});
    };
    return (
        <button
            type="button"
            onClick={go}
            lang={next}
            aria-label={t('switchTo', {language: localeNames[next]})}
            title={t('switchTo', {language: localeNames[next]})}
            className={cn("inline-flex items-center justify-center shrink-0 h-10 px-2 rounded-lg border-2 border-transparent font-mono text-[13px] font-extrabold uppercase text-foreground/70 hover:text-foreground hover:bg-muted transition-colors", className)}
        >
            {next}
        </button>
    );
}
