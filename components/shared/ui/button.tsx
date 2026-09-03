import {ButtonHTMLAttributes, forwardRef} from "react";
import {cn} from "./cn";

export type ButtonVariant = "primary" | "secondary" | "ghost";
export type ButtonSize = "sm" | "default" | "lg" | "icon";

const variantClasses: Record<ButtonVariant, string> = {
    primary: "bg-accent text-accent-foreground",
    secondary: "bg-card text-foreground",
    ghost: "border-transparent shadow-none bg-transparent text-foreground hover:bg-muted",
};

const sizeClasses: Record<ButtonSize, string> = {
    sm: "px-4 py-2 text-xs",
    default: "px-6 py-3 text-sm",
    lg: "px-7 py-3.5 text-base",
    icon: "p-2.5",
};

export function buttonClasses(
    variant: ButtonVariant = "primary",
    size: ButtonSize = "default",
    className?: string,
) {
    return cn("bb-btn", variantClasses[variant], sizeClasses[size], className);
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
    variant?: ButtonVariant;
    size?: ButtonSize;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
    ({className, variant = "primary", size = "default", ...props}, ref) => (
        <button ref={ref} className={buttonClasses(variant, size, className)} {...props} />
    ),
);
Button.displayName = "Button";
