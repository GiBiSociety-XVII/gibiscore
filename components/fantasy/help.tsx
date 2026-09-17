'use client';

import {useEffect, useRef, useState} from "react";
import {HelpCircle} from "lucide-react";
import {cn} from "@/components/shared/ui/cn";

/**
 * A "?" that explains on hover and on a tap: the words leave the screen,
 * not the help. On a click the explanation opens in a bubble under the
 * icon (a finger has no hover), closed by a tap elsewhere or Escape.
 * `boxed` is the square button of the football panels.
 */
export function Help({text, className, boxed = false}: {text: string; className?: string; boxed?: boolean}) {
    const [open, setOpen] = useState(false);
    const [alignLeft, setAlignLeft] = useState(false);
    const root = useRef<HTMLSpanElement>(null);
    useEffect(() => {
        if (!open) return;
        const away = (e: PointerEvent) => {
            if (!root.current?.contains(e.target as Node)) setOpen(false);
        };
        const key = (e: KeyboardEvent) => {
            if (e.key === 'Escape') setOpen(false);
        };
        document.addEventListener('pointerdown', away);
        document.addEventListener('keydown', key);
        return () => {
            document.removeEventListener('pointerdown', away);
            document.removeEventListener('keydown', key);
        };
    }, [open]);
    const toggle = (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        // The bubble hangs from the icon's right edge, unless that would push it off the left of the screen.
        const box = root.current?.getBoundingClientRect();
        setAlignLeft(!!box && box.right < 300);
        setOpen((v) => !v);
    };
    return (
        <span ref={root} className={cn("relative inline-flex align-middle shrink-0", className)}>
            <button
                type="button"
                onClick={toggle}
                aria-expanded={open}
                aria-label={text}
                title={text}
                className={cn(
                    "inline-flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent/40 cursor-help",
                    boxed ? "w-6 h-6 rounded-md border border-foreground/40 bg-card" : "w-4 h-4 rounded-full border border-foreground/40",
                    open && "bg-accent text-foreground",
                )}
            >
                <HelpCircle className={boxed ? "w-3.5 h-3.5" : "w-3 h-3"} aria-hidden="true" />
            </button>
            {open && (
                <span role="tooltip" className={cn("absolute top-full mt-1.5 z-[70] w-72 max-w-[calc(100vw-2rem)] rounded-lg border-2 border-foreground bg-background p-2.5 text-[12px] font-semibold leading-snug text-left text-foreground normal-case tracking-normal whitespace-pre-line shadow-[4px_4px_0_0_var(--color-foreground)]", alignLeft ? "left-0" : "right-0")}>
                    {text}
                </span>
            )}
        </span>
    );
}
