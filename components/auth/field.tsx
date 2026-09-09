import type {InputHTMLAttributes, ReactNode} from "react";
import {Input} from "@/components/shared/ui/input";

/** A labelled input with an icon inside, on the left, and an optional hint below. */
export function Field({id, label, icon, hint, ...props}: {id: string; label: string; icon: ReactNode; hint?: string} & InputHTMLAttributes<HTMLInputElement>) {
    return (
        <div>
            <label htmlFor={id} className="block text-sm font-bold text-foreground mb-2">
                {label}
            </label>
            <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-foreground [&>svg]:w-5 [&>svg]:h-5" aria-hidden="true">
                    {icon}
                </span>
                <Input id={id} className="w-full pl-10" {...props} />
            </div>
            {hint && <p className="text-xs font-semibold text-muted-foreground mt-1">{hint}</p>}
        </div>
    );
}

/** The error box of a form. */
export function FormError({children}: {children: ReactNode}) {
    return (
        <div role="alert" className="p-3 bg-card border-2 border-foreground rounded-[10px]">
            <p className="text-sm text-foreground font-semibold">{children}</p>
        </div>
    );
}

/** A line with a caption in the middle, between the form and the other way in. */
export function Divider({children}: {children: ReactNode}) {
    return (
        <div className="relative my-6">
            <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t-2 border-foreground/20" />
            </div>
            <div className="relative flex justify-center text-sm">
                <span className="px-2 bg-card font-semibold text-muted-foreground">{children}</span>
            </div>
        </div>
    );
}

export const outlineLink = "block w-full py-2.5 px-4 rounded-[10px] border-2 border-foreground text-foreground font-bold hover:bg-muted transition-colors text-center";
