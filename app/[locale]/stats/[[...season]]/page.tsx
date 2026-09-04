import type {Metadata} from "next";
import Image from "next/image";
import {getTranslations, setRequestLocale} from "next-intl/server";
import {Link} from "@/i18n/navigation";
import {SiteShell, Panel} from "@/components/shell/site-shell";
import {Flag} from "@/components/football/flag";
import {PageHeader} from "@/components/football/page-header";
import {Rankings} from "@/components/football/rankings";
import {Tabs} from "@/components/football/tabs";
import {getStatsPage} from "@/lib/football/data/stats";

export const revalidate = 600;

export async function generateMetadata({params}: PageProps<"/[locale]/stats/[[...season]]">): Promise<Metadata> {
    const {season} = await params;
    const t = await getTranslations('Pages.stats');
    const year = parseYear(season);
    return {title: year ? `${t('metaTitle')} ${year}/${year + 1}` : t('metaTitle'), description: t('metaDescription')};
}

function parseYear(raw: string[] | undefined): number | undefined {
    const v = raw?.[0];
    return v && /^\d{4}$/.test(v) ? Number(v) : undefined;
}

export default async function StatsPage({params}: PageProps<"/[locale]/stats/[[...season]]">) {
    const {locale, season} = await params;
    setRequestLocale(locale);
    const t = await getTranslations('Pages.stats');
    const page = await getStatsPage(parseYear(season));
    const blocks = page.blocks;
    // Only the default season lives at /stats: a one-off competition (Supercoppa 2025) can still be "current" in an older year.
    const seasonHref = (year: number) => (year === page.defaultYear ? '/stats' : `/stats/${year}`);

    return (
        <SiteShell wide>
            <PageHeader
                title={t('title')}
                meta={t('intro')}
                aside={
                    page.years.length > 1 ? (
                        <nav aria-label={t('seasonPicker')} className="flex items-center gap-1 flex-wrap justify-end">
                            {page.years.slice(0, 6).map((y) => (
                                <Link
                                    key={y.year}
                                    href={seasonHref(y.year)}
                                    aria-current={y.year === page.year ? 'page' : undefined}
                                    className={`px-2 h-7 inline-flex items-center rounded-md border-2 border-foreground text-[12px] font-extrabold font-mono tabular-nums ${y.year === page.year ? 'bg-foreground text-background' : 'bg-card hover:bg-accent'}`}
                                >
                                    {y.label}
                                </Link>
                            ))}
                        </nav>
                    ) : null
                }
            />
            {blocks.length === 0 ? (
                <p className="text-sm font-semibold text-muted-foreground">{t('empty')}</p>
            ) : (
                <Tabs
                    items={blocks.map((b) => ({
                        id: b.competition.slug,
                        label: (
                            <span className="inline-flex items-center gap-1.5">
                                {b.competition.logoUrl ? <Image src={b.competition.logoUrl} alt="" width={14} height={14} unoptimized className="object-contain" /> : <Flag code={b.competition.countryCode} size={14} />}
                                {b.competition.name}
                            </span>
                        ),
                        content: (
                            <>
                                <div className="flex items-center justify-between gap-2 text-[12px] font-semibold text-muted-foreground px-1">
                                    <span>{b.competition.country ? `${b.competition.country} · ` : ''}{b.season.name}</span>
                                    <Link href={`/competitions/${b.competition.slug}`} className="font-extrabold text-foreground underline decoration-accent decoration-[2px] underline-offset-2">{b.competition.name} →</Link>
                                </div>
                                {b.rankings.scorers.length + b.rankings.assists.length === 0 ? (
                                    <p className="text-sm font-semibold text-muted-foreground">{t('empty')}</p>
                                ) : (
                                    <div className="grid gap-3 grid-cols-1 xl:grid-cols-2 items-start">
                                        <Panel title={t('scorers')}><div className="px-1"><Rankings kind="scorers" players={b.rankings.scorers} /></div></Panel>
                                        <Panel title={t('assists')}><div className="px-1"><Rankings kind="assists" players={b.rankings.assists} /></div></Panel>
                                    </div>
                                )}
                            </>
                        ),
                    }))}
                />
            )}
        </SiteShell>
    );
}
