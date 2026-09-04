import type {ReactNode} from "react";
import {cn} from "@/components/shared/ui/cn";

/** Card with a compact title row, used by rails and secondary boxes. `scroll` caps the body height and scrolls it. */
export function Panel({title, action, children, className, scroll = false}: {title?: ReactNode; action?: ReactNode; children: ReactNode; className?: string; scroll?: boolean}) {
    return (
        <section className={cn("bb-surface overflow-hidden flex flex-col shrink-0", className)}>
            {title && (
                <div className="flex items-center justify-between gap-2 px-3 h-9 border-b-2 border-foreground bg-card shrink-0">
                    <h2 className="text-[13px] font-extrabold uppercase tracking-wide truncate">{title}</h2>
                    {action}
                </div>
            )}
            <div className={cn(scroll && "max-h-[360px] overflow-y-auto [scrollbar-width:thin]")}>{children}</div>
        </section>
    );
}
