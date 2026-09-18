'use client';

import {useEffect, useState} from "react";
import {Moon, Sun} from "lucide-react";
import {useTranslations} from "next-intl";
import {cn} from "@/components/shared/ui/cn";

export const THEME_KEY = 'gibiscore:theme';
type Theme = 'light' | 'dark';

/** The theme in force on this page: the class the head script (layout) put on <html>. */
function current(): Theme {
    return document.documentElement.classList.contains('dark') ? 'dark' : 'light';
}

/** Puts the theme on the page and remembers it; the meta colour follows so the phone's chrome matches. */
export function applyTheme(theme: Theme): void {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    document.documentElement.style.colorScheme = theme;
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', theme === 'dark' ? '#14131A' : '#14131A');
    try {
        localStorage.setItem(THEME_KEY, theme);
    } catch {
        // No storage: the choice lives for this page.
    }
}

/**
 * Sun or moon in the app bar: light or dark, remembered on this browser.
 * The first visit follows the system; the head script in the layout
 * applies the choice before the first paint, so nothing flashes.
 */
export function ThemeToggle({className}: {className?: string}) {
    const t = useTranslations('Common.theme');
    const [theme, setTheme] = useState<Theme | null>(null);
    useEffect(() => {
        queueMicrotask(() => setTheme(current()));
    }, []);
    const next: Theme = theme === 'dark' ? 'light' : 'dark';
    return (
        <button
            type="button"
            onClick={() => { applyTheme(next); setTheme(next); }}
            aria-label={theme === 'dark' ? t('toLight') : t('toDark')}
            title={theme === 'dark' ? t('toLight') : t('toDark')}
            className={cn("inline-flex items-center justify-center shrink-0 w-10 h-10 rounded-lg border-2 border-transparent text-foreground/70 hover:text-foreground hover:bg-muted transition-colors", className)}
        >
            {theme === 'dark' ? <Sun className="w-5 h-5" aria-hidden="true" /> : <Moon className="w-5 h-5" aria-hidden="true" />}
        </button>
    );
}
