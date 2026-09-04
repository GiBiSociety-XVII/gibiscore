'use client';

import {useState, type ReactNode} from "react";
import {cn} from "@/components/shared/ui/cn";

export type ScoreFilter = 'all' | 'live' | 'finished' | 'scheduled';

/**
 * Tutte / Live / Finite / Programma. Filtering is done by CSS on the
 * data-row attribute of every match line (see globals.css), so the whole
 * day's list is rendered once on the server and toggled instantly.
 */
export function ScoreFilters({
    counts,
    labels,
    initial = 'all',
    children,
}: {
    counts: Record<ScoreFilter, number>;
    labels: Record<ScoreFilter, string>;
    initial?: ScoreFilter;
    children: ReactNode;
}) {
    const [filter, setFilter] = useState<ScoreFilter>(initial);
    const options: ScoreFilter[] = ['all', 'live', 'finished', 'scheduled'];
    return (
        <div data-filter={filter} className="flex flex-col gap-2">
            <div role="tablist" className="flex gap-1 overflow-x-auto [scrollbar-width:none]">
                {options.map((option) => {
                    const selected = option === filter;
                    return (
                        <button
                            key={option}
                            role="tab"
                            type="button"
                            aria-selected={selected}
                            onClick={() => setFilter(option)}
                            className={cn(
                                "inline-flex items-center gap-1.5 h-7 px-2.5 rounded-md border-2 text-xs font-extrabold whitespace-nowrap transition-colors",
                                selected ? "bg-foreground text-background border-foreground" : "bg-card border-foreground/15 hover:border-foreground",
                                option === 'live' && !selected && counts.live > 0 && "border-accent bg-accent/30",
                            )}
                        >
                            {option === 'live' && <span className={cn("w-1.5 h-1.5 rounded-full", counts.live > 0 ? "bg-accent" : "bg-muted-foreground")} aria-hidden="true" />}
                            {labels[option]}
                            <span className="font-mono text-[10px] opacity-70">{counts[option]}</span>
                        </button>
                    );
                })}
            </div>
            {children}
        </div>
    );
}
