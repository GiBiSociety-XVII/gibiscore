import type {ReactNode} from "react";
import Footer from "@/components/shared/layout/footer";
import {getNavigation, type Navigation} from "@/lib/football/data/navigation";
import AppBar from "./app-bar";
import {MobileTabs} from "./mobile-tabs";
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
        <div className="min-h-screen flex flex-col bg-background pb-16 lg:pb-0">
            <AppBar />
            <div className="flex-1 w-full max-w-[1600px] mx-auto px-2 md:px-4 py-3 flex gap-3 items-start">
                <aside className="hidden lg:block w-[228px] shrink-0 sticky top-[92px] max-h-[calc(100vh-104px)] overflow-y-auto [scrollbar-width:thin]">
                    <Sidebar nav={nav} />
                </aside>
                <main className="flex-1 min-w-0 flex flex-col gap-3">
                    <PinnedChips nav={nav} />
                    {children}
                </main>
                {rail && !wide && (
                    <aside className="hidden xl:flex w-[300px] shrink-0 flex-col gap-3 self-start">
                        {rail}
                    </aside>
                )}
            </div>
            <Footer />
            <MobileTabs />
        </div>
    );
}

export {Panel} from "./panel";
