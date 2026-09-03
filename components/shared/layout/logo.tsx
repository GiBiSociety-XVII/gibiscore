import {cn} from "@/components/shared/ui/cn";

/** Placeholder mark until the real GiBiScore logo is ready. */
export function LogoMark({className}: {className?: string}) {
    return (
        <span
            aria-hidden="true"
            className={cn(
                "flex h-12 w-12 items-center justify-center rounded-xl border-[2.5px] border-foreground bg-accent shadow-[4px_4px_0_rgb(var(--foreground))]",
                className,
            )}
        >
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="9" />
                <path d="M12 3v4M12 17v4M3 12h4M17 12h4" />
                <path d="M8 8l3 2v4l-3 2M16 8l-3 2v4l3 2" />
            </svg>
        </span>
    );
}
