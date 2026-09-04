import {cn} from "@/components/shared/ui/cn";

/** The GiBiScore ball: lime, ink pentagon, five seams. */
function Ball({className}: {className?: string}) {
    return (
        <svg viewBox="0 0 100 100" className={className} aria-hidden="true">
            <circle cx="50" cy="50" r="46" fill="rgb(var(--accent))" stroke="rgb(var(--foreground))" strokeWidth="7" />
            <polygon points="50,31 68,44 61,65 39,65 32,44" fill="rgb(var(--foreground))" />
            <g stroke="rgb(var(--foreground))" strokeWidth="7" strokeLinecap="round">
                <line x1="50" y1="31" x2="50" y2="6" />
                <line x1="68" y1="44" x2="92" y2="36" />
                <line x1="61" y1="65" x2="77" y2="86" />
                <line x1="39" y1="65" x2="23" y2="86" />
                <line x1="32" y1="44" x2="8" y2="36" />
            </g>
        </svg>
    );
}

/**
 * GiBiScore mark: tilted ink block with a lime offset block behind, "GS"
 * in heavy Geist and the ball in the corner. Same family as the GiBiArena
 * mark, its own identity. Bitmap versions live in public/brand.
 */
export function LogoMark({size = 36, className}: {size?: number; className?: string}) {
    return (
        <span aria-hidden="true" className={cn("relative inline-block shrink-0", className)} style={{width: size, height: size}}>
            <span className="absolute inset-0 rounded-[22%] bg-accent" style={{transform: `rotate(-6deg) translate(${size * 0.08}px, ${size * 0.08}px)`}} />
            <span className="absolute inset-0 rounded-[22%] bg-foreground flex items-center justify-center" style={{transform: 'rotate(-6deg)'}}>
                <span className="font-black text-background leading-none select-none" style={{fontSize: size * 0.5, letterSpacing: '-0.05em', marginLeft: -size * 0.05, marginTop: size * 0.04}}>
                    GS
                </span>
                <span className="absolute" style={{right: size * 0.1, top: size * 0.1, width: size * 0.24, height: size * 0.24}}>
                    <Ball />
                </span>
            </span>
        </span>
    );
}
