'use client';

import {useEffect, useState} from "react";
import {ArrowLeft, Shield} from "lucide-react";
import {useTranslations} from "next-intl";
import {Link} from "@/i18n/navigation";
import {createClient} from "@/lib/db/client";
import {isAdminId} from "@/lib/admin";

type Who = 'checking' | 'admin' | 'denied';

/** Who is signed in on this browser, against the admin id; follows sign-ins and sign-outs. */
export function useIsAdmin(): Who {
    const [who, setWho] = useState<Who>('checking');
    useEffect(() => {
        let supabase: ReturnType<typeof createClient>;
        try {
            supabase = createClient();
        } catch {
            // Without the project's keys (a build, a preview) there is no session at all.
            queueMicrotask(() => setWho('denied'));
            return;
        }
        supabase.auth.getSession().then(({data}) => setWho(isAdminId(data.session?.user.id) ? 'admin' : 'denied')).catch(() => setWho('denied'));
        const {data} = supabase.auth.onAuthStateChange((_event, session) => setWho(isAdminId(session?.user.id) ? 'admin' : 'denied'));
        return () => data.subscription.unsubscribe();
    }, []);
    return who;
}

/**
 * The admin pages behind one check: the content renders only for the
 * administrator's session, anyone else sees the reserved-access notice.
 * (What writes goes through routes that check the session server-side.)
 */
export function AdminGate({children}: {children: React.ReactNode}) {
    const t = useTranslations('Admin');
    const who = useIsAdmin();
    if (who === 'checking') return <p className="text-sm font-semibold text-muted-foreground">…</p>;
    if (who === 'denied') {
        return (
            <div className="max-w-md mx-auto px-4 py-16 text-center flex flex-col items-center gap-3">
                <span className="inline-flex w-14 h-14 items-center justify-center rounded-full border-2 border-foreground bg-red-100"><Shield className="w-7 h-7 text-red-700" aria-hidden="true" /></span>
                <h1 className="text-xl font-extrabold">{t('deniedTitle')}</h1>
                <p className="text-[13px] font-semibold text-muted-foreground">{t('deniedText')}</p>
                <Link href="/" className="bb-btn bg-card h-9 px-3 inline-flex items-center gap-2 text-[12px] font-extrabold"><ArrowLeft className="w-4 h-4" aria-hidden="true" />{t('backHome')}</Link>
            </div>
        );
    }
    return <>{children}</>;
}
