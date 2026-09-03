import {getRequestConfig} from 'next-intl/server';
import {hasLocale} from 'next-intl';
import {routing} from './routing';

// Messages live next to the feature that owns them (core/<area>/i18n/<locale>),
// same convention as GiBiArena. Each JSON file is one namespace.
export default getRequestConfig(async ({requestLocale}) => {
    const requested = await requestLocale;
    const locale = hasLocale(routing.locales, requested)
        ? requested
        : routing.defaultLocale;

    const Common = (await import(`../core/home/i18n/${locale}/Common.json`)).default;
    const AppBar = (await import(`../core/home/i18n/${locale}/AppBar.json`)).default;
    const HomePage = (await import(`../core/home/i18n/${locale}/HomePage.json`)).default;

    return {
        locale,
        messages: {
            Common,
            AppBar,
            HomePage,
        },
    };
});
