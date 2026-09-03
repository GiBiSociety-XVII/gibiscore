import type {Metadata} from "next";
import Image from "next/image";
import {ArrowRight} from "lucide-react";
import {getTranslations, setRequestLocale} from "next-intl/server";
import {Link} from "@/i18n/navigation";
import {Card} from "@/components/shared/ui/card";
import {PageShell, PageTitle} from "@/components/football/page-shell";
import {listCompetitions, type CompetitionListItem} from "@/lib/football/data/competitions";

export const revalidate = 600;

export async function generateMetadata(): Promise<Metadata> {
    const t = await getTranslations('Pages.competitions');
    return {title: t('metaTitle'), description: t('metaDescription')};
}

function CompetitionCard({c, seasonLabel}: {c: CompetitionListItem; seasonLabel: string | null}) {
    return (
        <Link href={`/competitions/${c.slug}`} className="block">
            <Card press className="p-3 flex items-center gap-2.5 h-full">
                <span className="flex w-10 h-10 items-center justify-center rounded-xl border-[2.5px] border-foreground bg-card overflow-hidden shrink-0">
                    {c.logoUrl ? <Image src={c.logoUrl} alt="" width={28} height={28} className="object-contain" /> : null}
                </span>
                <span className="flex flex-col gap-0.5 min-w-0">
                    <span className="font-extrabold truncate">{c.name}</span>
                    <span className="text-xs font-semibold text-muted-foreground truncate">{[c.country, seasonLabel].filter(Boolean).join(' · ')}</span>
                </span>
                <ArrowRight className="w-4 h-4 ml-auto shrink-0" />
            </Card>
        </Link>
    );
}

export default async function CompetitionsPage({params}: PageProps<"/[locale]/competitions">) {
    const {locale} = await params;
    setRequestLocale(locale);
    const t = await getTranslations('Pages.competitions');
    const list = await listCompetitions();
    const seasonLabel = (c: CompetitionListItem) => (c.season ? t('season', {season: c.season.name}) : null);

    return (
        <PageShell>
            <PageTitle title={t('title')} eyebrow={list.total > 0 ? t('count', {count: list.total}) : undefined} />
            {list.total === 0 ? (
                <p className="text-sm font-semibold text-muted-foreground">{t('empty')}</p>
            ) : (
                <>
                    {list.featured.length > 0 && (
                        <section className="flex flex-col gap-3">
                            <h2 className="text-lg font-extrabold tracking-tight">{t('featured')}</h2>
                            <div className="grid gap-3 grid-cols-1 md:grid-cols-2 xl:grid-cols-3">
                                {list.featured.map((c) => <CompetitionCard key={c.id} c={c} seasonLabel={seasonLabel(c)} />)}
                            </div>
                        </section>
                    )}
                    {list.countries.length > 0 && (
                        <section className="flex flex-col gap-3">
                            <h2 className="text-lg font-extrabold tracking-tight">{t('byCountry')}</h2>
                            <div className="flex flex-col gap-2">
                                {list.countries.map((block) => (
                                    <details key={block.country} className="bb-surface overflow-hidden">
                                        <summary className="cursor-pointer list-none flex items-center justify-between gap-3 px-3 md:px-4 py-2 font-extrabold text-[14px] hover:bg-muted/60">
                                            <span>{block.country}</span>
                                            <span className="text-xs font-bold text-muted-foreground">{t('count', {count: block.competitions.length})}</span>
                                        </summary>
                                        <div className="grid gap-2.5 grid-cols-1 md:grid-cols-2 xl:grid-cols-3 p-3 border-t-[2.5px] border-foreground bg-background/60">
                                            {block.competitions.map((c) => <CompetitionCard key={c.id} c={c} seasonLabel={seasonLabel(c)} />)}
                                        </div>
                                    </details>
                                ))}
                            </div>
                        </section>
                    )}
                </>
            )}
        </PageShell>
    );
}
