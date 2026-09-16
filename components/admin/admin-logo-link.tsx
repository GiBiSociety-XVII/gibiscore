'use client';

import {Link} from "@/i18n/navigation";
import {useIsAdmin} from "./admin-gate";

/** The GiBiSociety mark in the footer: a plain mark for everyone, the way into the admin panel for the administrator (as on GiBiArena). */
export function AdminLogoLink({children, className}: {children: React.ReactNode; className?: string}) {
    const who = useIsAdmin();
    if (who !== 'admin') return <span className={className}>{children}</span>;
    return <Link href="/admin" aria-label="Pannello admin" className={className}>{children}</Link>;
}
