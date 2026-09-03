import type {Metadata} from "next";
import Image from "next/image";
import {ArrowRight} from "lucide-react";
import {getTranslations, setRequestLocale} from "next-intl/server";
import {Link} from "@/i18n/navigation";
import {Card} from "@/components/shared/ui/card";
import {PageShell, PageTitle} from "@/components/football/page-shell";
import {listCompetitions} from "@/lib/football/data/competitions";

export const revalidate = 300;

export async function generateMetadata(): Promise<Metadata> {
    const t = await getTranslations('Pages.competitions');
    return {title: t('metaTitle'), description: t('metaDescription')};
}

export default async function CompetitionsPage({params}: PageProps<"/[locale]/competitions">) {
    const {locale} = await params;
    setRequestLocale(locale);
    const t = await getTranslations('Pages.competitions');
    const competitions = await listCompetitions();

    return (
        <PageShell>
            <PageTitle title={t('title')} />
            {competitions.length === 0 ? (
                <p className="text-sm font-semibold text-muted-foreground">{t('empty')}</p>
            ) : (
                <div className="grid gap-5 grid-cols-1 md:grid-cols-2 xl:grid-cols-3">
                    {competitions.map((c) => (
                        <Link key={c.id} href={`/competitions/${c.slug}`} className="block">
                            <Card press className="p-5 flex items-center gap-4 h-full">
                                <span className="flex w-14 h-14 items-center justify-center rounded-xl border-[2.5px] border-foreground bg-card overflow-hidden shrink-0">
                                    {c.logoUrl ? <Image src={c.logoUrl} alt={c.name} width={40} height={40} className="object-contain" /> : null}
                                </span>
                                <span className="flex flex-col gap-1 min-w-0">
                                    <span className="text-lg font-extrabold truncate">{c.name}</span>
                                    <span className="text-sm font-semibold text-muted-foreground">
                                        {c.country ? `${c.country} · ` : ''}{c.season ? t('season', {season: c.season.name}) : ''}
                                    </span>
                                </span>
                                <ArrowRight className="w-5 h-5 ml-auto shrink-0" />
                            </Card>
                        </Link>
                    ))}
                </div>
            )}
        </PageShell>
    );
}
