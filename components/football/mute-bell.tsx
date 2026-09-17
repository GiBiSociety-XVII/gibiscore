'use client';

import {useEffect, useState} from "react";
import {Bell, BellOff} from "lucide-react";
import {useTranslations} from "next-intl";
import {cn} from "@/components/shared/ui/cn";
import {cloudUser} from "@/lib/fantasy/cloud";

/**
 * On the match page, for a signed-in user: the bell that silences this
 * one match (no goal, no final, whatever the favourites say), for
 * watching it without spoilers. Nothing for a visitor.
 */
export function MuteBell({fixtureId}: {fixtureId: number}) {
    const t = useTranslations('Pages.match.mute');
    const [muted, setMuted] = useState<boolean | null>(null);
    const [busy, setBusy] = useState(false);

    useEffect(() => {
        let alive = true;
        cloudUser()
            .then((u) => (u ? fetch(`/api/notifications/mute?fixtureId=${fixtureId}`).then((r) => (r.ok ? (r.json() as Promise<{muted: boolean}>) : null)) : null))
            .then((r) => { if (alive && r) setMuted(r.muted); })
            .catch(() => undefined);
        return () => { alive = false; };
    }, [fixtureId]);

    if (muted === null) return null;
    const toggle = async () => {
        if (busy) return;
        setBusy(true);
        try {
            const res = await fetch('/api/notifications/mute', {method: 'POST', headers: {'content-type': 'application/json'}, body: JSON.stringify({fixtureId, muted: !muted})});
            if (res.ok) setMuted(((await res.json()) as {muted: boolean}).muted);
        } finally {
            setBusy(false);
        }
    };
    return (
        <button
            type="button"
            onClick={toggle}
            disabled={busy}
            aria-pressed={muted}
            title={muted ? t('unmute') : t('mute')}
            className={cn("inline-flex items-center gap-1 h-6 px-1.5 rounded-md border-2 text-[10px] font-extrabold uppercase tracking-wide whitespace-nowrap transition-colors disabled:opacity-60", muted ? "border-foreground bg-foreground text-background" : "border-foreground/30 bg-card text-muted-foreground hover:border-foreground hover:text-foreground")}
        >
            {muted ? <BellOff className="w-3 h-3" aria-hidden="true" /> : <Bell className="w-3 h-3" aria-hidden="true" />}
            {muted ? t('muted') : t('notifications')}
        </button>
    );
}
