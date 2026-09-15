import {HelpCircle} from "lucide-react";
import {cn} from "@/components/shared/ui/cn";

/** A "?" that shows the explanation on hover or focus: the words leave the screen, not the help. */
export function Help({text, className}: {text: string; className?: string}) {
    return (
        <span tabIndex={0} title={text} aria-label={text} className={cn("inline-flex items-center justify-center w-4 h-4 rounded-full border border-foreground/40 text-muted-foreground cursor-help align-middle shrink-0", className)}>
            <HelpCircle className="w-3 h-3" aria-hidden="true" />
        </span>
    );
}
