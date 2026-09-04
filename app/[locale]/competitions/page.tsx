import type {Metadata} from "next";
import Image from "next/image";
import {getTranslations, setRequestLocale} from "next-intl/server";
import {Link} from "@/i18n/navigation";
import {SiteShell, Panel} from "@/components/shell/site-shell";
import {Flag} from "@/components/football/flag";
import {PageHeader} from "@/components/football/page-header";
import {getNavigation} from "@/lib/football/data/navigation";

export const revalidate = 600;

export async function generateMetadata(): Promise<Metadata> {
    const t = await getTranslations('Pages.competitions');
    return {title: t('metaTitle'), description: t('metaDescription')};
}

function matches(query: string, ...values: Array<string | null | undefined>): boolean {
    const q = query.trim().toLowerCase();
    return q === '' || values.some((v) => v?.toLowerCase().includes(q));
}

export default async function CompetitionsPage({params, searchParams}: PageProps<"/[locale]/competitions">) {
    const {locale} = await params;
    const {q} = await searchParams;
    setRequestLocale(locale);
    const t = await getTranslations('Pages.competitions');
    const all = await getNavigation();
    const query = (Array.isArray(q) ? q[0] : q) ?? '';
    // Header search lands here: keep only what matches the query.
    const nav = query
        ? {
              ...all,
              pinned: all.pinned.filter((c) => matches(query, c.name, c.country)),
              countries: all.countries
                  .map((country) => ({...country, competitions: matches(query, country.name) ? country.competitions : country.competitions.filter((c) => matches(query, c.name))}))
                  .filter((country) => country.competitions.length > 0),
          }
        : all;

    return (
        <SiteShell wide>
            <PageHeader title={query ? t('searchTitle', {query}) : t('title')} meta={all.total > 0 ? t('count', {count: all.total}) : undefined} />
            {all.total === 0 ? (
                <p className="text-sm font-semibold text-muted-foreground">{t('empty')}</p>
            ) : (
                <>
                    {nav.pinned.length > 0 && (
                    <Panel title={t('featured')}>
                        <ul className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-px bg-muted">
                            {nav.pinned.map((c) => (
                                <li key={c.slug} className="bg-card">
                                    <Link href={`/competitions/${c.slug}`} className="flex items-center gap-2 px-3 h-11 hover:bg-muted/60">
                                        <span className="inline-flex w-6 h-6 items-center justify-center shrink-0">
                                            {c.logoUrl ? <Image src={c.logoUrl} alt="" width={22} height={22} unoptimized className="object-contain" /> : <Flag code={c.countryCode} size={18} />}
                                        </span>
                                        <span className="flex flex-col min-w-0 leading-tight">
                                            <span className="text-[13px] font-extrabold truncate">{c.name}</span>
                                            <span className="text-[10px] font-semibold text-muted-foreground truncate">{c.country}</span>
                                        </span>
                                    </Link>
                                </li>
                            ))}
                        </ul>
                    </Panel>
                    )}
                    {nav.countries.length === 0 && query && <p className="text-sm font-semibold text-muted-foreground">{t('noResults')}</p>}
                    {nav.countries.length > 0 && (
                    <Panel title={t('byCountry')}>
                        <div className="columns-1 md:columns-2 xl:columns-3 gap-0 [column-fill:balance]">
                            {nav.countries.map((country) => (
                                <section key={country.name} className="break-inside-avoid border-b border-muted">
                                    <h3 className="flex items-center gap-2 px-3 h-8 text-[12px] font-extrabold uppercase tracking-wide bg-muted/50">
                                        <Flag code={country.code} logoUrl={country.competitions[0]?.logoUrl} size={16} />
                                        {country.name}
                                        <span className="ml-auto font-mono text-[10px] text-muted-foreground">{country.competitions.length}</span>
                                    </h3>
                                    <ul className="py-1">
                                        {country.competitions.map((c) => (
                                            <li key={c.slug}>
                                                <Link href={`/competitions/${c.slug}`} className="flex items-center px-3 h-7 text-[13px] font-semibold hover:bg-muted/60 truncate">{c.name}</Link>
                                            </li>
                                        ))}
                                    </ul>
                                </section>
                            ))}
                        </div>
                    </Panel>
                    )}
                </>
            )}
        </SiteShell>
    );
}
