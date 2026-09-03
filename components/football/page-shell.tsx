import type {ReactNode} from "react";
import AppBar from "@/components/shared/layout/app-bar";
import Footer from "@/components/shared/layout/footer";
import {cn} from "@/components/shared/ui/cn";

/** Standard page frame: app bar, constrained main column, footer. */
export function PageShell({children, className}: {children: ReactNode; className?: string}) {
    return (
        <div className="min-h-screen flex flex-col bg-background">
            <AppBar />
            <main className={cn("flex-1 flex flex-col gap-4 md:gap-5 px-3 md:px-6 py-5 pb-10 w-full max-w-[1440px] mx-auto", className)}>{children}</main>
            <Footer />
        </div>
    );
}

export function PageTitle({eyebrow, title, aside}: {eyebrow?: ReactNode; title: ReactNode; aside?: ReactNode}) {
    return (
        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-3">
            <div className="flex flex-col gap-2 min-w-0">
                {eyebrow && <div className="text-[11px] font-extrabold uppercase tracking-wide text-muted-foreground">{eyebrow}</div>}
                <h1 className="text-2xl md:text-[30px] font-extrabold tracking-tight leading-[1.05] text-balance">{title}</h1>
            </div>
            {aside && <div className="shrink-0">{aside}</div>}
        </div>
    );
}

export function NotFoundBox({message, backHref, backLabel}: {message: string; backHref: string; backLabel: string}) {
    return (
        <div className="bb-surface p-6 flex flex-col gap-3">
            <p className="font-bold">{message}</p>
            <a href={backHref} className="bb-btn bg-card px-5 py-2.5 text-sm self-start">{backLabel}</a>
        </div>
    );
}
