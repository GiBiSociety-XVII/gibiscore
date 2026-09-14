'use client';

import {LogOut, Sparkles, UserRound} from "lucide-react";
import {useEffect, useRef, useState} from "react";
import {useTranslations} from "next-intl";
import {Link, usePathname, useRouter} from "@/i18n/navigation";
import {cn} from "@/components/shared/ui/cn";
import {createClient} from "@/lib/db/client";

interface Who {
    email: string | null;
    name: string | null;
}

/**
 * The account in the app bar. Signed out: the icon goes to sign in and
 * comes back here. Signed in: the icon opens a small menu with who you
 * are, the way to the auction and the way out. No page in between.
 */
export function AccountButton() {
    const t = useTranslations('AppBar');
    const ta = useTranslations('Account');
    const path = usePathname();
    const router = useRouter();
    const [who, setWho] = useState<Who | null>(null);
    const [open, setOpen] = useState(false);
    const box = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const supabase = createClient();
        const read = (user: {email?: string; user_metadata?: Record<string, unknown>} | null | undefined) => {
            if (!user) return null;
            const name = user.user_metadata?.username;
            return {email: user.email ?? null, name: typeof name === 'string' && name.trim() ? name.trim() : null};
        };
        supabase.auth.getSession().then(({data}) => setWho(read(data.session?.user))).catch(() => undefined);
        const {data} = supabase.auth.onAuthStateChange((_event, session) => setWho(read(session?.user)));
        return () => data.subscription.unsubscribe();
    }, []);

    useEffect(() => {
        if (!open) return;
        const onClick = (e: MouseEvent) => {
            if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
        };
        document.addEventListener('mousedown', onClick);
        return () => document.removeEventListener('mousedown', onClick);
    }, [open]);

    const signOut = async () => {
        await createClient().auth.signOut();
        setOpen(false);
        router.push('/');
        router.refresh();
    };

    const icon = cn("inline-flex items-center justify-center shrink-0 w-10 h-10 rounded-lg border-2 transition-colors", path.startsWith('/sign') || open || who ? "border-foreground bg-accent/40" : "border-transparent text-foreground/70 hover:text-foreground hover:bg-muted");
    if (!who) {
        return (
            <Link href={{pathname: '/signin', query: {next: path}}} aria-label={t('login')} title={t('login')} aria-current={path.startsWith('/sign') ? 'page' : undefined} className={icon}>
                <UserRound className="w-5 h-5" aria-hidden="true" />
            </Link>
        );
    }
    return (
        <div ref={box} className="relative shrink-0">
            <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} aria-haspopup="menu" aria-label={who.name ?? who.email ?? ta('title')} title={who.name ?? who.email ?? ta('title')} className={icon}>
                <UserRound className="w-5 h-5" aria-hidden="true" />
            </button>
            {open && (
                <div role="menu" className="absolute right-0 top-full mt-2 w-[min(18rem,calc(100vw-2rem))] z-50 bb-surface bg-background shadow-[6px_6px_0_rgb(var(--foreground))] p-3 flex flex-col gap-2">
                    <div className="flex items-center gap-2.5 min-w-0">
                        <span className="w-9 h-9 rounded-lg border-2 border-foreground bg-accent flex items-center justify-center shrink-0"><UserRound className="w-4 h-4" aria-hidden="true" /></span>
                        <span className="flex flex-col leading-tight min-w-0">
                            <span className="text-[13px] font-extrabold truncate">{who.name ?? ta('title')}</span>
                            {who.email && <span className="text-[11px] font-semibold text-muted-foreground truncate">{who.email}</span>}
                        </span>
                    </div>
                    <Link href="/fantacalcio/asta" role="menuitem" onClick={() => setOpen(false)} className="bb-btn bg-accent h-9 px-3 text-[12px] font-extrabold inline-flex items-center justify-center gap-1.5"><Sparkles className="w-3.5 h-3.5" aria-hidden="true" />{ta('toAuction')}</Link>
                    <button type="button" role="menuitem" onClick={signOut} className="bb-btn bg-card h-9 px-3 text-[12px] font-extrabold inline-flex items-center justify-center gap-1.5"><LogOut className="w-3.5 h-3.5" aria-hidden="true" />{ta('signOut')}</button>
                </div>
            )}
        </div>
    );
}
