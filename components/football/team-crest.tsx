import Image from "next/image";
import type {TeamSummary} from "@/lib/football/types";
import {cn} from "@/components/shared/ui/cn";

/**
 * Team badge. Small sizes (lists) skip the image optimizer: the provider
 * serves tiny PNGs already and a scores page can carry hundreds of them.
 */
export function TeamCrest({team, size = 44, className}: {team: TeamSummary; size?: number; className?: string}) {
    const small = size <= 28;
    return (
        <span
            className={cn("flex items-center justify-center shrink-0 overflow-hidden", small ? "" : "rounded-full border-[2.5px] border-foreground bg-muted", className)}
            style={{width: size, height: size}}
        >
            {team.logoUrl ? (
                <Image src={team.logoUrl} alt="" width={size} height={size} className="object-contain" unoptimized={small} loading="lazy" />
            ) : (
                <span className="text-[10px] font-extrabold text-muted-foreground">{team.shortCode ?? ''}</span>
            )}
        </span>
    );
}
