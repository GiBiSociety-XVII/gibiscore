'use client';

import {useEffect} from "react";
import {useRouter} from "@/i18n/navigation";

/**
 * Re-fetches the server-rendered page every `seconds` while the tab is
 * visible, so live scores and minutes move without a manual reload. The
 * pages themselves are cached (ISR), so a refresh costs one cached fetch.
 */
export function AutoRefresh({seconds = 60, enabled = true, aroundIso, windowHours = 3}: {seconds?: number; enabled?: boolean; /** Also refresh within `windowHours` of this kick-off (ISO date). */ aroundIso?: string; windowHours?: number}) {
    const router = useRouter();
    useEffect(() => {
        const near = aroundIso !== undefined && Math.abs(Date.parse(aroundIso) - Date.now()) < windowHours * 3_600_000;
        if (!enabled && !near) return;
        const tick = () => {
            if (document.visibilityState === 'visible') router.refresh();
        };
        const id = window.setInterval(tick, seconds * 1000);
        document.addEventListener('visibilitychange', tick);
        return () => {
            window.clearInterval(id);
            document.removeEventListener('visibilitychange', tick);
        };
    }, [router, seconds, enabled, aroundIso, windowHours]);
    return null;
}
