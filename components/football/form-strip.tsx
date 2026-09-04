import {Link} from "@/i18n/navigation";
import {cn} from "@/components/shared/ui/cn";
import type {FormEntry} from "@/lib/football/types";

/** Five little results, oldest to newest: V lime, N grey, P ink. Each links to its match. */
export function FormStrip({entries, className}: {entries: FormEntry[]; className?: string}) {
    if (entries.length === 0) return null;
    const ordered = [...entries].reverse();
    return (
        <span className={cn("inline-flex gap-0.5", className)}>
            {ordered.map((e) => (
                <Link
                    key={e.fixtureId}
                    href={`/matches/${e.fixtureId}`}
                    title={`${e.home ? 'vs' : '@'} ${e.opponent.name} ${e.score}`}
                    className={cn(
                        "inline-flex w-4 h-4 items-center justify-center rounded text-[9px] font-extrabold hover:ring-2 ring-foreground",
                        e.result === 'W' && "bg-accent",
                        e.result === 'D' && "bg-muted",
                        e.result === 'L' && "bg-foreground text-background",
                    )}
                >
                    {e.result === 'W' ? 'V' : e.result === 'D' ? 'N' : 'P'}
                </Link>
            ))}
        </span>
    );
}
