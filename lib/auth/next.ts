import {routing} from '@/i18n/routing';

/** A path with the locale prefix next-intl expects: none for the default locale (`localePrefix: 'as-needed'`). */
export function localePath(locale: string, path: string): string {
    return locale === routing.defaultLocale ? path : `/${locale}${path}`;
}

/** Where to go after signing in: a same-site path from `?next=`, or the auction. */
export function safeNext(raw: string | string[] | undefined, locale: string): string {
    const n = typeof raw === 'string' ? raw : '';
    return n.startsWith('/') && !n.startsWith('//') && !n.includes('\\') ? n : localePath(locale, '/fantacalcio/asta');
}
