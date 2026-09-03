import {HTMLAttributes} from "react";
import {cn} from "./cn";

type BadgeVariant = "accent" | "ink" | "outline" | "muted";

const variantClasses: Record<BadgeVariant, string> = {
    accent: "bg-accent text-accent-foreground",
    ink: "bg-foreground text-background",
    outline: "bg-card text-foreground",
    muted: "bg-muted text-foreground",
};

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
    variant?: BadgeVariant;
}

export function Badge({className, variant = "outline", ...props}: BadgeProps) {
    return <span className={cn("bb-badge", variantClasses[variant], className)} {...props} />;
}
