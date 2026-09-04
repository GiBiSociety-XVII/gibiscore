import Image from "next/image";
import {ChevronRight} from "lucide-react";
import {Link} from "@/i18n/navigation";
import type {CompetitionFixtures} from "@/lib/football/types";
import {Flag} from "./flag";
import {MatchRow} from "./match-row";

/** Header line (flag, country, competition) plus its rows, as in a scores app. */
export function CompetitionBlock({group, showCountry = true}: {group: CompetitionFixtures; showCountry?: boolean}) {
    const c = group.competition;
    return (
        <section data-block className="flex flex-col border-t-2 border-foreground first:border-t-0">
            <Link href={`/competitions/${c.slug}`} className="group flex items-center gap-2 px-2 h-8 bg-muted/60 hover:bg-muted text-[12px] font-extrabold">
                {c.logoUrl && !c.countryCode ? (
                    <Image src={c.logoUrl} alt="" width={16} height={16} unoptimized className="object-contain shrink-0" />
                ) : (
                    <Flag code={c.countryCode} logoUrl={c.logoUrl} size={16} />
                )}
                {showCountry && c.country && <span className="text-muted-foreground uppercase tracking-wide">{c.country}:</span>}
                <span className="truncate">{c.name}</span>
                <ChevronRight className="w-3.5 h-3.5 ml-auto text-muted-foreground group-hover:text-foreground" />
            </Link>
            <div className="flex flex-col">
                {group.fixtures.map((f) => <MatchRow key={f.id} fixture={f} />)}
            </div>
        </section>
    );
}
