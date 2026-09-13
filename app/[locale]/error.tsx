'use client';

import {useEffect} from 'react';

/** The page could not be built (usually the database not answering in time): say so and offer a retry. */
export default function LocaleError({error, reset}: {error: Error & {digest?: string}; reset: () => void}) {
    useEffect(() => {
        console.error('[page]', error);
    }, [error]);
    return (
        <main className="max-w-xl mx-auto px-4 py-16 flex flex-col gap-4">
            <h1 className="text-xl font-extrabold tracking-tight">Pagina non disponibile in questo momento</h1>
            <p className="text-[14px] font-semibold text-muted-foreground">I dati non hanno risposto in tempo. Riprova tra qualche secondo.</p>
            <button type="button" onClick={reset} className="bb-btn bg-accent px-4 h-10 self-start text-[13px] font-extrabold">Riprova</button>
        </main>
    );
}
