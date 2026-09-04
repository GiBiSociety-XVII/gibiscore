import type {ReactNode} from "react";
import Footer from "@/components/shared/layout/footer";
import {getNavigation, type Navigation} from "@/lib/football/data/navigation";
import AppBar from "./app-bar";
import {PinnedChips, Sidebar} from "./sidebar";

/**
 * Scores-site frame: ink app bar, sticky competitions column on the left,
 * content in the middle, optional contextual rail on the right (wide
 * screens). Everything reads from the cached navigation, so pages stay
 * statically renderable.
 */
export async function SiteShell({children, rail, wide = false, navigation}: {children: ReactNode; rail?: ReactNode; wide?: boolean; navigation?: Navigation}) {
    const nav = navigation ?? (await getNavigation());
    return (
        <div className="min-h-screen flex flex-col bg-background">
            <AppBar />
            <div className="flex-1 w-full max-w-[1600px] mx-auto px-2 md:px-4 py-3 flex gap-3 items-start">
                <aside className="hidden lg:block w-[228px] shrink-0 sticky top-[60px] max-h-[calc(100vh-72px)] overflow-y-auto [scrollbar-width:thin]">
                    <Sidebar nav={nav} />
                </aside>
                <main className="flex-1 min-w-0 flex flex-col gap-3">
                    <PinnedChips nav={nav} />
                    {children}
                </main>
                {rail && !wide && (
                    <aside className="hidden xl:flex w-[300px] shrink-0 sticky top-[60px] flex-col gap-3 max-h-[calc(100vh-72px)] overflow-y-auto [scrollbar-width:thin]">
                        {rail}
                    </aside>
                )}
            </div>
            <Footer />
        </div>
    );
}

/** Panel used by the rail and by secondary boxes: card with a compact title row. */
export function Panel({title, action, children, className}: {title?: ReactNode; action?: ReactNode; children: ReactNode; className?: string}) {
    return (
        <section className={`bb-surface overflow-hidden ${className ?? ''}`}>
            {title && (
                <div className="flex items-center justify-between gap-2 px-3 h-9 border-b-2 border-foreground bg-card">
                    <h2 className="text-[13px] font-extrabold uppercase tracking-wide truncate">{title}</h2>
                    {action}
                </div>
            )}
            {children}
        </section>
    );
}
