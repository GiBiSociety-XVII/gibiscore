import {InputHTMLAttributes, forwardRef} from "react";
import {cn} from "./cn";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
    ({className, ...props}, ref) => (
        <input ref={ref} className={cn("bb-input px-4 py-2.5 text-sm", className)} {...props} />
    ),
);
Input.displayName = "Input";
