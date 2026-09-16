'use client';

import {Link} from "@/i18n/navigation";
import {useIsAdmin} from "./admin-gate";

/** The footer lockup: home for everyone, the admin panel for the administrator (as on GiBiArena). */
export function AdminLogoLink({children, className}: {children: React.ReactNode; className?: string}) {
    const who = useIsAdmin();
    return <Link href={who === 'admin' ? '/admin' : '/'} aria-label="GiBiScore" className={className}>{children}</Link>;
}
