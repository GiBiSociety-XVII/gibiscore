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

export async function generateMetadata(): Promise<Metadata> {
    const t = await getTranslations('Pages.stats');
    return {title: t('metaTitle'), description: t('metaDescription')};
}

export default async function StatsPage({params}: PageProps<"/[locale]/stats">) {
    const {locale} = await params;
    setRequestLocale(locale);
    const t = await getTranslations('Pages.stats');
    const blocks = await getStatsPage();

    return (
        <SiteShell wide>
            <PageHeader title={t('title')} meta={t('intro')} />
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
                                {b.rankings.scorers.length + b.rankings.assists.length + b.rankings.ratings.length === 0 ? (
                                    <p className="text-sm font-semibold text-muted-foreground">{t('empty')}</p>
                                ) : (
                                    <div className="grid gap-3 grid-cols-1 xl:grid-cols-3 items-start">
                                        <Panel title={t('scorers')}><div className="px-1"><Rankings kind="scorers" players={b.rankings.scorers} /></div></Panel>
                                        <Panel title={t('assists')}><div className="px-1"><Rankings kind="assists" players={b.rankings.assists} /></div></Panel>
                                        <Panel title={t('ratings')}><div className="px-1"><Rankings kind="ratings" players={b.rankings.ratings} /></div></Panel>
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
