'use client';

import {useTranslations} from "next-intl";
import {cn} from "@/components/shared/ui/cn";
import type {FantaRole} from "@/lib/fantasy/scores";

const ROLES: FantaRole[] = ['P', 'D', 'C', 'A'];

export interface TableManager {
    manager: number;
    name: string;
    /** Credits still to spend. */
    left: number;
    /** Slots still open per role. */
    open: Record<FantaRole, number>;
}

/**
 * The table at a glance, always on screen: every manager with the
 * credits left and the slots still open per role. The richest is marked,
 * so is anyone down to a credit a slot, who can only pick up leftovers.
 */
export function TableBar({managers, onOpen, me}: {managers: TableManager[]; onOpen: (manager: number) => void; /** The team the planning is for, marked. */ me: number}) {
    const t = useTranslations('Fantasy.table');
    const richest = managers.reduce((best, m) => (m.left > (best?.left ?? -1) ? m : best), null as TableManager | null);
    return (
        <div role="list" aria-label={t('title')} className="flex items-stretch gap-1.5 overflow-x-auto [scrollbar-width:thin] pb-1 -mb-1">
            {managers.map((m) => {
                const openSlots = ROLES.reduce((s, r) => s + m.open[r], 0);
                const done = openSlots === 0;
                const broke = !done && m.left - openSlots <= openSlots;
                const rich = richest?.manager === m.manager && !done && m.left > 0;
                const title = done ? t('done', {name: m.name}) : broke ? t('broke', {name: m.name, left: m.left, open: openSlots}) : t('hint', {name: m.name, left: m.left, open: openSlots, perSlot: Math.floor(m.left / Math.max(1, openSlots))});
                return (
                    <button
                        key={m.manager}
                        type="button"
                        role="listitem"
                        onClick={() => onOpen(m.manager)}
                        title={title}
                        className={cn(
                            "shrink-0 flex flex-col gap-0.5 rounded-lg border-2 px-2 py-1 text-left min-w-[96px] transition-colors hover:bg-muted",
                            m.manager === me ? "border-foreground bg-accent/30" : "border-foreground/30 bg-card",
                            done && "opacity-60",
                        )}
                    >
                        <span className="flex items-center gap-1 min-w-0">
                            <span className="text-[11px] font-extrabold truncate max-w-[110px]">{m.name}</span>
                            {rich && <span className="bb-badge bg-foreground text-background text-[8px] h-3.5 px-1 shrink-0" title={t('richest')}>€</span>}
                            {broke && <span className="bb-badge bg-red-200 text-[8px] h-3.5 px-1 shrink-0" title={t('brokeBadge')}>1×</span>}
                        </span>
                        <span className="flex items-baseline gap-1.5">
                            <span className={cn("font-mono text-[14px] font-extrabold tabular-nums leading-none", m.left < 0 && "text-red-700")}>{m.left}</span>
                            <span className="font-mono text-[10px] font-semibold tabular-nums text-muted-foreground leading-none">
                                {ROLES.map((r) => (
                                    <span key={r} className={cn("mr-1", m.open[r] === 0 && "opacity-40")}>{r}{m.open[r]}</span>
                                ))}
                            </span>
                        </span>
                    </button>
                );
            })}
        </div>
    );
}
