'use client';

import {useState, type ReactNode} from "react";
import {cn} from "@/components/shared/ui/cn";

export interface TabItem {
    id: string;
    label: ReactNode;
    content: ReactNode;
    /** Small counter shown next to the label. */
    count?: number;
}

/**
 * Tabs rendered entirely on the server (all panels are in the HTML, only
 * one is visible), switched on the client without navigation: the page
 * stays cacheable and switching is instant.
 */
export function Tabs({items, defaultId, className}: {items: TabItem[]; defaultId?: string; className?: string}) {
    const [active, setActive] = useState(defaultId && items.some((i) => i.id === defaultId) ? defaultId : items[0]?.id);
    return (
        <div className={cn("flex flex-col gap-3", className)}>
            <div role="tablist" className="flex gap-1 overflow-x-auto border-b-2 border-foreground [scrollbar-width:none]">
                {items.map((item) => {
                    const selected = item.id === active;
                    return (
                        <button
                            key={item.id}
                            role="tab"
                            type="button"
                            aria-selected={selected}
                            aria-controls={`tab-${item.id}`}
                            onClick={() => setActive(item.id)}
                            className={cn(
                                "relative inline-flex items-center gap-1.5 h-9 px-3 text-[13px] font-extrabold whitespace-nowrap -mb-[2px] border-b-[3px] transition-colors",
                                selected ? "border-accent text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
                            )}
                        >
                            {item.label}
                            {item.count !== undefined && item.count > 0 && (
                                <span className={cn("font-mono text-[10px] px-1 rounded border", selected ? "bg-accent border-foreground" : "bg-muted border-transparent")}>{item.count}</span>
                            )}
                        </button>
                    );
                })}
            </div>
            {items.map((item) => (
                <div key={item.id} id={`tab-${item.id}`} role="tabpanel" hidden={item.id !== active} className="flex flex-col gap-3 min-w-0">
                    {item.content}
                </div>
            ))}
        </div>
    );
}
