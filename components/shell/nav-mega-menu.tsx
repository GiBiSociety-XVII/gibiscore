'use client';

import {useEffect, useRef, useState, type ReactNode} from "react";
import {ArrowRight, ChevronDown} from "lucide-react";
import {Link, usePathname} from "@/i18n/navigation";
import {cn} from "@/components/shared/ui/cn";

export interface MegaMenuItem {
    label: string;
    href: string;
    hint?: string;
}

export interface MegaMenuColumn {
    title: string;
    items: MegaMenuItem[];
}

/** Dropdown panel in the gibiarena.com style: header with icon, columns with accent rule, one accent call to action. */
export function NavMegaMenu({label, icon, overviewHref, overviewLabel, columns, active}: {label: string; icon?: ReactNode; overviewHref: string; overviewLabel: string; columns: MegaMenuColumn[]; active: boolean}) {
    const wrapper = useRef<HTMLDivElement>(null);
    const pathname = usePathname();
    // The panel remembers the page it was opened on: navigating away closes it without an effect.
    const [openedOn, setOpenedOn] = useState<string | null>(null);
    const open = openedOn === pathname;
    const setOpen = (next: boolean | ((prev: boolean) => boolean)) => setOpenedOn((prev) => ((typeof next === 'function' ? next(prev === pathname) : next) ? pathname : null));

    useEffect(() => {
        function onClickOutside(e: MouseEvent) {
            if (wrapper.current && !wrapper.current.contains(e.target as Node)) setOpenedOn(null);
        }
        function onKeyDown(e: KeyboardEvent) {
            if (e.key === 'Escape') setOpenedOn(null);
        }
        document.addEventListener('mousedown', onClickOutside);
        document.addEventListener('keydown', onKeyDown);
        return () => {
            document.removeEventListener('mousedown', onClickOutside);
            document.removeEventListener('keydown', onKeyDown);
        };
    }, []);

    return (
        <div className="md:relative" ref={wrapper}>
            <button
                type="button"
                onClick={() => setOpen((v) => !v)}
                aria-expanded={open}
                className={cn(
                    "inline-flex items-center gap-1.5 h-9 md:h-10 px-2.5 md:px-3.5 rounded-lg text-[14px] md:text-[17px] font-bold whitespace-nowrap transition-colors",
                    active ? "text-foreground bg-accent/40 border-2 border-foreground" : "text-foreground/70 hover:text-foreground",
                    open && !active && "bg-muted text-foreground",
                )}
            >
                {label}
                <ChevronDown className={cn("w-4 h-4 transition-transform", open && "rotate-180")} />
            </button>

            {open && (
                <div className="fixed left-3 right-3 top-[72px] md:absolute md:left-0 md:right-auto md:top-full md:mt-3 md:w-[640px] bb-surface bg-card overflow-hidden z-50 shadow-[6px_6px_0_rgb(var(--foreground))]">
                    <div className="flex items-center gap-3 px-5 py-3.5 bg-muted border-b-2 border-foreground">
                        {icon && <span className="inline-flex w-10 h-10 items-center justify-center rounded-[9px] border-2 border-foreground bg-card shrink-0">{icon}</span>}
                        <span className="text-lg font-extrabold text-foreground">{label}</span>
                    </div>
                    <div className="p-5">
                        <div className={cn("grid gap-x-8 gap-y-5", columns.length >= 3 ? "grid-cols-2 md:grid-cols-3" : "grid-cols-2")}>
                            {columns.map((col) => (
                                <div key={col.title}>
                                    <p className="text-[11px] font-extrabold uppercase tracking-widest text-muted-foreground mb-2 pb-1.5 border-b-2 border-accent">{col.title}</p>
                                    <div className="flex flex-col gap-0.5">
                                        {col.items.map((item) => (
                                            <Link
                                                key={item.href + item.label}
                                                href={item.href}
                                                onClick={() => setOpen(false)}
                                                className="group flex items-center justify-between gap-2 px-3 py-2 -mx-3 rounded-[9px] text-[15px] font-semibold text-foreground hover:bg-muted transition-colors"
                                            >
                                                <span className="flex flex-col leading-tight">
                                                    {item.label}
                                                    {item.hint && <span className="text-[11px] font-semibold text-muted-foreground">{item.hint}</span>}
                                                </span>
                                                <ArrowRight className="w-4 h-4 text-muted-foreground opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 transition-all shrink-0" />
                                            </Link>
                                        ))}
                                    </div>
                                </div>
                            ))}
                        </div>
                        <Link
                            href={overviewHref}
                            onClick={() => setOpen(false)}
                            className="mt-5 flex items-center justify-center gap-2 w-full px-4 py-3 rounded-[10px] border-2 border-foreground bg-accent text-accent-foreground text-[15px] font-bold hover:opacity-90 transition-opacity"
                        >
                            {overviewLabel}
                            <ArrowRight className="w-4 h-4" />
                        </Link>
                    </div>
                </div>
            )}
        </div>
    );
}
