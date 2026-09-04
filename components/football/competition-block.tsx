import Image from "next/image";
import {ChevronRight} from "lucide-react";
import {Link} from "@/i18n/navigation";
import type {CompetitionFixtures} from "@/lib/football/types";
import {FavoriteStar} from "./favorite-star";
import {Flag} from "./flag";
import {MatchRow} from "./match-row";

/** Header line (flag, country, competition, favourite star) plus its rows, as in a scores app. */
export function CompetitionBlock({group, showCountry = true}: {group: CompetitionFixtures; showCountry?: boolean}) {
    const c = group.competition;
    return (
        <section data-block data-slug={c.slug} className="flex flex-col border-t-2 border-foreground first:border-t-0">
            <div className="flex items-center gap-1 pl-2 pr-1 h-8 bg-muted/60 text-[12px] font-extrabold">
                <Link href={`/competitions/${c.slug}`} className="group flex-1 min-w-0 flex items-center gap-2 h-full hover:underline decoration-accent decoration-[3px] underline-offset-2">
                    {c.logoUrl && !c.countryCode ? (
                        <Image src={c.logoUrl} alt="" width={16} height={16} unoptimized className="object-contain shrink-0" />
                    ) : (
                        <Flag code={c.countryCode} logoUrl={c.logoUrl} size={16} />
                    )}
                    {showCountry && c.country && <span className="text-muted-foreground uppercase tracking-wide">{c.country}:</span>}
                    <span className="truncate">{c.name}</span>
                </Link>
                <FavoriteStar slug={c.slug} />
                <Link href={`/competitions/${c.slug}`} aria-hidden="true" tabIndex={-1} className="inline-flex w-6 h-6 items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted">
                    <ChevronRight className="w-3.5 h-3.5" />
                </Link>
            </div>
            <div className="flex flex-col">
                {group.fixtures.map((f) => <MatchRow key={f.id} fixture={f} />)}
            </div>
        </section>
    );
}
