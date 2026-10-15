'use client';

import {LogOut, Settings, Sparkles, User} from "lucide-react";
import {useEffect, useState} from "react";
import {useTranslations} from "next-intl";
import {Link, usePathname, useRouter} from "@/i18n/navigation";
import {buttonClasses} from "@/components/shared/ui/button";
import {createClient} from "@/lib/db/client";

interface Who {
    email: string | null;
    name: string | null;
}

/**
 * The account in the app bar, the way GiBiArena has it. Signed out:
 * two buttons, sign in and sign up, on wide screens (sign in alone on
 * a tablet, the mobile menu carries both on a phone). Signed in: a square avatar button that
 * opens a small menu with who you are, the profile, the auction and
 * the way out. While the session is being read, a quiet placeholder.
 */
export function AccountButton() {
    const t = useTranslations('AppBar');
    const ta = useTranslations('Account');
    const path = usePathname();
    const router = useRouter();
    // Unknown until the session is read; signed out at once when the project's keys are not there (a build, a preview).
    const [who, setWho] = useState<Who | null | undefined>(() => {
        try {
            createClient();
            return undefined;
        } catch {
            return null;
        }
    });
    const [open, setOpen] = useState(false);

    useEffect(() => {
        const read = (user: {email?: string; user_metadata?: Record<string, unknown>} | null | undefined) => {
            if (!user) return null;
            const name = user.user_metadata?.username;
            return {email: user.email ?? null, name: typeof name === 'string' && name.trim() ? name.trim() : null};
        };
        // Without the project's keys (a build, a preview) there is no session: the buttons just go to sign in.
        let supabase: ReturnType<typeof createClient>;
        try {
            supabase = createClient();
        } catch {
            return;
        }
        supabase.auth
            .getSession()
            .then(({data}) => setWho(read(data.session?.user)))
            .catch(() => setWho(null));
        const {data} = supabase.auth.onAuthStateChange((_event, session) => setWho(read(session?.user)));
        return () => data.subscription.unsubscribe();
    }, []);

    const signOut = async () => {
        await createClient().auth.signOut();
        setOpen(false);
        router.push('/');
        router.refresh();
    };

    if (who === undefined) return <div className="hidden lg:block w-10 h-10 rounded-[10px] border-2 border-foreground bg-muted animate-pulse" aria-hidden="true" />;

    if (!who) {
        return (
            <div className="hidden md:flex items-center gap-2 shrink-0">
                <Link href={{pathname: '/signin', query: {next: path}}} className={buttonClasses('secondary', 'sm', 'whitespace-nowrap')}>
                    {t('login')}
                </Link>
                {/* Sign up only where the bar has the room: on a narrower screen sign in leads there too. */}
                <Link href={{pathname: '/signup', query: {next: path}}} className={buttonClasses('primary', 'sm', 'hidden xl:inline-flex whitespace-nowrap')}>
                    {t('register')}
                </Link>
            </div>
        );
    }

    return (
        <div className="relative shrink-0">
            <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} aria-haspopup="menu" aria-label={who.name ?? who.email ?? ta('title')} title={who.name ?? who.email ?? ta('title')} className="w-10 h-10 rounded-[10px] border-2 border-foreground bg-accent flex items-center justify-center text-accent-foreground font-extrabold cursor-pointer">
                <User className="w-5 h-5" aria-hidden="true" />
            </button>
            {open && (
                <>
                    <div role="menu" className="absolute right-0 mt-2 w-48 bb-surface bg-card overflow-hidden z-50">
                        <div className="p-4 border-b-2 border-foreground">
                            <p className="text-sm font-bold text-foreground truncate">{who.name ?? ta('title')}</p>
                            {who.email && <p className="text-xs text-muted-foreground truncate">{who.email}</p>}
                        </div>
                        <div className="p-2 space-y-1">
                            <Link href="/account" role="menuitem" onClick={() => setOpen(false)} className="flex items-center gap-3 px-3 py-2 text-sm font-medium text-foreground hover:bg-muted rounded-[10px] transition-colors cursor-pointer">
                                <Settings className="w-4 h-4" aria-hidden="true" />
                                {ta('profile.menu')}
                            </Link>
                            <Link href="/fantacalcio/asta" role="menuitem" onClick={() => setOpen(false)} className="flex items-center gap-3 px-3 py-2 text-sm font-medium text-foreground hover:bg-muted rounded-[10px] transition-colors cursor-pointer">
                                <Sparkles className="w-4 h-4" aria-hidden="true" />
                                {ta('toAuction')}
                            </Link>
                        </div>
                        <div className="p-2 border-t-2 border-foreground">
                            <button type="button" role="menuitem" onClick={signOut} className="w-full flex items-center gap-3 px-3 py-2 text-sm font-medium text-foreground hover:bg-muted rounded-[10px] transition-colors cursor-pointer">
                                <LogOut className="w-4 h-4" aria-hidden="true" />
                                {ta('signOut')}
                            </button>
                        </div>
                    </div>
                    <div className="fixed inset-0 z-40 cursor-pointer" onClick={() => setOpen(false)} aria-hidden="true" />
                </>
            )}
        </div>
    );
}
