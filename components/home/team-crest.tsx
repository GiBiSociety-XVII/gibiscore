import Image from "next/image";
import type {TeamSummary} from "@/lib/football/types";
import {cn} from "@/components/shared/ui/cn";

export function TeamCrest({team, size = 44, className}: {team: TeamSummary; size?: number; className?: string}) {
    return (
        <span
            className={cn("flex items-center justify-center rounded-full border-[2.5px] border-foreground bg-muted overflow-hidden shrink-0", className)}
            style={{width: size, height: size}}
        >
            {team.logoUrl ? (
                <Image src={team.logoUrl} alt={team.name} width={size} height={size} className="object-contain" />
            ) : (
                <span className="text-[10px] font-extrabold text-muted-foreground">{team.shortCode ?? ''}</span>
            )}
        </span>
    );
}
