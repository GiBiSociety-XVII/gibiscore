'use client';

import {useEffect, useState} from 'react';

/**
 * The page could not be built (usually the database not answering in
 * time): say so and offer a retry. Its own words, in the language of the
 * page: an error boundary cannot lean on the machinery that just failed.
 */
const WORDS = {
    it: {title: 'Pagina non disponibile in questo momento', text: 'I dati non hanno risposto in tempo. Riprova tra qualche secondo.', retry: 'Riprova'},
    en: {title: 'Page not available right now', text: 'The data did not answer in time. Try again in a few seconds.', retry: 'Try again'},
};

export default function LocaleError({error, reset}: {error: Error & {digest?: string}; reset: () => void}) {
    const [lang, setLang] = useState<keyof typeof WORDS>('it');
    useEffect(() => {
        console.error('[page]', error);
        // The language is the one on <html>, written by the layout.
        const found = document.documentElement.lang;
        if (found in WORDS) queueMicrotask(() => setLang(found as keyof typeof WORDS));
        // Told to the site, so the administrator sees it without the platform's logs.
        void fetch('/api/errors', {
            method: 'POST',
            headers: {'content-type': 'application/json'},
            body: JSON.stringify({message: error.message, digest: error.digest ?? null, path: window.location.pathname, locale: found}),
            keepalive: true,
        }).catch(() => undefined);
    }, [error]);
    const w = WORDS[lang];
    return (
        <main className="max-w-xl mx-auto px-4 py-16 flex flex-col gap-4">
            <h1 className="text-xl font-extrabold tracking-tight">{w.title}</h1>
            <p className="text-[14px] font-semibold text-muted-foreground">{w.text}</p>
            <button type="button" onClick={reset} className="bb-btn bg-accent px-4 h-10 self-start text-[13px] font-extrabold">{w.retry}</button>
        </main>
    );
}
