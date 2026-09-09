import {cn} from "@/components/shared/ui/cn";
import type {FantaRole} from "@/lib/fantasy/scores";

export const ROLE_CLASS: Record<FantaRole, string> = {P: 'bg-amber-200', D: 'bg-emerald-200', C: 'bg-sky-200', A: 'bg-rose-200'};

export function RoleBadge({role, className}: {role: FantaRole; className?: string}) {
    return <span className={cn("inline-flex items-center justify-center w-5 h-5 rounded border border-foreground font-mono text-[11px] font-extrabold", ROLE_CLASS[role], className)}>{role}</span>;
}
