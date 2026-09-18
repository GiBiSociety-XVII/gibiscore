import {defineRouting} from 'next-intl/routing';

// Italian at the plain address, English under /en; the other GiBiArena
// locales can be added here later without touching the route structure.
export const routing = defineRouting({
    locales: ['it', 'en'],
    defaultLocale: 'it',
    localePrefix: 'as-needed'
});

export type AppLocale = (typeof routing.locales)[number];

export const localeNames: Record<AppLocale, string> = {
    it: 'Italiano',
    en: 'English',
};

/** The Open Graph locale tag of each site language. */
export const ogLocales: Record<AppLocale, string> = {
    it: 'it_IT',
    en: 'en_GB',
};
