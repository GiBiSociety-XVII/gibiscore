import AppBar from "@/components/shell/app-bar";

/** Shown while a page streams in: same frame as the site, grey blocks in place of content. */
export default function Loading() {
    return (
        <div className="min-h-screen flex flex-col bg-background">
            <AppBar />
            <div className="flex-1 w-full max-w-[1600px] mx-auto px-2 md:px-4 py-3 flex gap-3 items-start animate-pulse" aria-busy="true">
                <div className="hidden lg:block w-[228px] shrink-0 h-[480px] rounded-2xl bg-muted" />
                <div className="flex-1 min-w-0 flex flex-col gap-3">
                    <div className="h-12 rounded-xl bg-muted" />
                    <div className="h-[360px] rounded-2xl bg-muted" />
                </div>
                <div className="hidden xl:block w-[300px] shrink-0 h-[320px] rounded-2xl bg-muted" />
            </div>
        </div>
    );
}
