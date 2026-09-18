import Image from "next/image";
import type {TeamSummary} from "@/lib/football/types";
import {cn} from "@/components/shared/ui/cn";

/** Two or three letters for a club without a logo: its code, else the first letters of its name. */
function initials(team: TeamSummary): string {
    if (team.shortCode && team.shortCode.trim()) return team.shortCode.trim().slice(0, 3).toUpperCase();
    // Club prefixes (FC, AC, US...) say nothing: the letters come from the name proper.
    const words = team.name.split(/\s+/).filter((w) => w.length > 1 && !/^(fc|sc|ac|as|us|ss|cf|sv|bk|if|ff|fk|cd|cs|sk|nk|ks|kf|fk)$/i.test(w));
    const base = words.length > 0 ? words : team.name.split(/\s+/);
    return (base.length >= 2 ? base.slice(0, 3).map((w) => w[0]).join('') : base[0].slice(0, 3)).toUpperCase();
}

/**
 * Team badge. Small sizes (lists) skip the image optimizer: the provider
 * serves tiny PNGs already and a scores page can carry hundreds of them.
 * Without a logo, a black badge with the club's letters: no grey holes in
 * the lists of the minor leagues.
 */
export function TeamCrest({team, size = 44, className}: {team: TeamSummary; size?: number; className?: string}) {
    const small = size <= 28;
    if (!team.logoUrl) {
        return (
            <span
                className={cn("flex items-center justify-center shrink-0 rounded-full bg-foreground text-background font-extrabold leading-none select-none", !small && "border-[2.5px] border-foreground", className)}
                style={{width: size, height: size, fontSize: Math.max(8, Math.round(size * 0.34))}}
                aria-hidden="true"
            >
                {initials(team)}
            </span>
        );
    }
    return (
        <span
            className={cn("flex items-center justify-center shrink-0 overflow-hidden", small ? "" : "rounded-full border-[2.5px] border-foreground bg-muted", className)}
            style={{width: size, height: size}}
        >
            <Image src={team.logoUrl} alt="" width={size} height={size} className="object-contain" unoptimized={small} loading="lazy" />
        </span>
    );
}
