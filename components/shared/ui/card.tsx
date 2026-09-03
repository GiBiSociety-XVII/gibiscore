import {HTMLAttributes} from "react";
import {cn} from "./cn";

interface CardProps extends HTMLAttributes<HTMLDivElement> {
    press?: boolean;
}

export function Card({className, press = false, ...props}: CardProps) {
    return <div className={cn("bb-surface", press && "bb-press", className)} {...props} />;
}
