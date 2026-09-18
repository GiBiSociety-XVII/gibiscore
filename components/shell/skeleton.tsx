import type {ReactNode} from "react";
import AppBar from "@/components/shell/app-bar";
import {cn} from "@/components/shared/ui/cn";

/** A grey block the shape of what is coming. */
export function Block({className}: {className?: string}) {
    return <div className={cn("rounded-xl bg-muted", className)} aria-hidden="true" />;
}

/** A list of rows, the shape of matches, standings, tickets. */
export function Rows({count = 6, height = 'h-9', className}: {count?: number; height?: string; className?: string}) {
    return (
        <div className={cn("bb-surface overflow-hidden flex flex-col", className)} aria-hidden="true">
            <div className="h-9 bg-muted/70 border-b-2 border-foreground/20" />
            {Array.from({length: count}, (_, i) => <div key={i} className={cn(height, "border-t border-muted/60 first:border-t-0 flex items-center gap-3 px-3")}><Block className="h-3 w-10" /><Block className="h-3 flex-1" /><Block className="h-3 w-12" /></div>)}
        </div>
    );
}

/**
 * The frame a page skeleton sits in: the real app bar, the same columns
 * as the site, and the page's own blocks pulsing in the middle. Used by
 * every loading.tsx so the layout never jumps when the page arrives.
 */
export function SkeletonFrame({children, wide = false}: {children: ReactNode; wide?: boolean}) {
    return (
        <div className="min-h-screen flex flex-col bg-background pb-16 lg:pb-0">
            <AppBar />
            <div className="flex-1 w-full max-w-[1600px] mx-auto px-2 md:px-4 py-3 flex gap-3 items-start animate-pulse" aria-busy="true">
                <div className="hidden lg:block w-[228px] shrink-0 h-[480px] rounded-2xl bg-muted" />
                <main className="flex-1 min-w-0 flex flex-col gap-3">{children}</main>
                {!wide && <div className="hidden xl:block w-[300px] shrink-0 h-[320px] rounded-2xl bg-muted" />}
            </div>
        </div>
    );
}

/** The header of an entity page: crest, title, one line of facts. */
export function HeaderSkeleton({visual = false}: {visual?: boolean}) {
    return (
        <div className="bb-surface px-3 py-2.5 flex items-center gap-3" aria-hidden="true">
            {visual && <Block className="w-11 h-11 rounded-full" />}
            <div className="flex flex-col gap-1.5 flex-1">
                <Block className="h-5 w-48" />
                <Block className="h-3 w-72 max-w-full" />
            </div>
            <Block className="h-8 w-24 hidden sm:block" />
        </div>
    );
}
