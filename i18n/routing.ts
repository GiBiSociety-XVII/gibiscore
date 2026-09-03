import {defineRouting} from 'next-intl/routing';

// Italian only at launch. English (and the other GiBiArena locales) can be
// added here later without touching the route structure.
export const routing = defineRouting({
    locales: ['it'],
    defaultLocale: 'it',
    localePrefix: 'as-needed'
});

export type AppLocale = (typeof routing.locales)[number];

export const localeNames: Record<AppLocale, string> = {
    it: 'Italiano',
};
