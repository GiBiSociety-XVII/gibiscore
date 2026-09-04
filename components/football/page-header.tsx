import type {ReactNode} from "react";
import {cn} from "@/components/shared/ui/cn";

/** Entity header (competition, team, player): visual, title, one line of facts, optional right side. */
export function PageHeader({visual, title, meta, aside, className}: {visual?: ReactNode; title: ReactNode; meta?: ReactNode; aside?: ReactNode; className?: string}) {
    return (
        <header className={cn("bb-surface px-3 py-2.5 flex items-center gap-3", className)}>
            {visual && <span className="shrink-0">{visual}</span>}
            <div className="flex flex-col min-w-0 gap-0.5">
                <h1 className="text-lg md:text-xl font-extrabold tracking-tight leading-tight truncate">{title}</h1>
                {meta && <div className="text-[12px] font-semibold text-muted-foreground truncate flex items-center gap-1.5 flex-wrap">{meta}</div>}
            </div>
            {aside && <div className="ml-auto shrink-0">{aside}</div>}
        </header>
    );
}

export function NotFoundBox({message, backHref, backLabel}: {message: string; backHref: string; backLabel: string}) {
    return (
        <div className="bb-surface p-5 flex flex-col gap-3">
            <p className="font-bold">{message}</p>
            <a href={backHref} className="bb-btn bg-card px-4 py-2 text-sm self-start">{backLabel}</a>
        </div>
    );
}
