import Image from "next/image";
import {useTranslations} from "next-intl";
import {Link} from "@/i18n/navigation";
import {FavoriteStar} from "@/components/football/favorite-star";
import {Flag} from "@/components/football/flag";
import type {Navigation} from "@/lib/football/data/navigation";

/** Left column: pinned competitions, then every country with its leagues. */
export function Sidebar({nav}: {nav: Navigation}) {
    const t = useTranslations('Common.sidebar');
    return (
        <nav aria-label={t('label')} className="bb-surface p-1.5 flex flex-col gap-1 text-[13px]">
            <h2 className="px-2 pt-1.5 pb-0.5 text-[10px] font-extrabold uppercase tracking-wider text-muted-foreground">{t('pinned')}</h2>
            <ul className="flex flex-col">
                {nav.pinned.map((c) => (
                    <li key={c.slug} className="flex items-center group/row">
                        <Link href={`/competitions/${c.slug}`} className="flex-1 min-w-0 flex items-center gap-2 px-2 h-7 rounded-md font-bold hover:bg-muted">
                            <span className="inline-flex w-[18px] h-[18px] items-center justify-center shrink-0">
                                {c.logoUrl ? <Image src={c.logoUrl} alt="" width={18} height={18} unoptimized className="object-contain" /> : <Flag code={c.countryCode} size={16} />}
                            </span>
                            <span className="truncate">{c.name}</span>
                        </Link>
                        <FavoriteStar slug={c.slug} />
                    </li>
                ))}
            </ul>

            <h2 className="px-2 pt-2 pb-0.5 text-[10px] font-extrabold uppercase tracking-wider text-muted-foreground border-t border-muted mt-1">{t('countries')}</h2>
            <ul className="flex flex-col">
                {nav.countries.map((country) => (
                    <li key={country.name}>
                        <details className="group">
                            <summary className="flex items-center gap-2 px-2 h-7 rounded-md font-bold cursor-pointer list-none hover:bg-muted [&::-webkit-details-marker]:hidden">
                                <Flag code={country.code} logoUrl={country.competitions[0]?.logoUrl} size={16} />
                                <span className="truncate">{country.name}</span>
                                <span className="ml-auto text-[11px] font-mono font-semibold text-muted-foreground group-open:hidden">{country.competitions.length}</span>
                            </summary>
                            <ul className="flex flex-col pb-1">
                                {country.competitions.map((c) => (
                                    <li key={c.slug}>
                                        <Link href={`/competitions/${c.slug}`} className="flex items-center gap-2 pl-8 pr-2 h-6 rounded-md text-xs font-semibold text-foreground/80 hover:bg-muted hover:text-foreground">
                                            <span className="truncate">{c.name}</span>
                                        </Link>
                                    </li>
                                ))}
                            </ul>
                        </details>
                    </li>
                ))}
            </ul>
        </nav>
    );
}

/** Mobile: pinned competitions as a scrollable chip row. */
export function PinnedChips({nav}: {nav: Navigation}) {
    const t = useTranslations('Common.sidebar');
    return (
        <div className="lg:hidden -mx-2 px-2 flex gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none]">
            {nav.pinned.map((c) => (
                <Link key={c.slug} href={`/competitions/${c.slug}`} className="shrink-0 inline-flex items-center gap-1.5 h-7 px-2.5 rounded-md border-2 border-foreground bg-card text-xs font-extrabold whitespace-nowrap">
                    {c.logoUrl && <Image src={c.logoUrl} alt="" width={14} height={14} unoptimized className="object-contain" />}
                    {c.name}
                </Link>
            ))}
            <Link href="/competitions" className="shrink-0 inline-flex items-center h-7 px-2.5 rounded-md border-2 border-foreground bg-foreground text-background text-xs font-extrabold whitespace-nowrap">
                {t('all')}
            </Link>
        </div>
    );
}
