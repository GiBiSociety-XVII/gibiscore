import type {Metadata} from "next";
import Image from "next/image";
import {getTranslations, setRequestLocale} from "next-intl/server";
import {Badge} from "@/components/shared/ui/badge";
import {MatchList} from "@/components/football/match-list";
import {NotFoundBox, PageShell, PageTitle} from "@/components/football/page-shell";
import {StandingsTable} from "@/components/football/standings-table";
import {getCompetitionPage} from "@/lib/football/data/competitions";
import {roundLabel} from "@/lib/football/data/shared";

export const revalidate = 120;

export async function generateMetadata({params}: PageProps<"/[locale]/competitions/[slug]">): Promise<Metadata> {
    const {slug} = await params;
    const t = await getTranslations('Pages.competition');
    const page = await getCompetitionPage(slug);
    if (!page) return {title: t('notFound')};
    return {
        title: page.competition.name,
        description: t('metaDescription', {name: page.competition.name, season: page.season?.name ?? ''}),
    };
}

export default async function CompetitionPage({params}: PageProps<"/[locale]/competitions/[slug]">) {
    const {locale, slug} = await params;
    setRequestLocale(locale);
    const t = await getTranslations('Pages.competition');
    const tFootball = await getTranslations('Football');
    const page = await getCompetitionPage(slug);

    if (!page) {
        return (
            <PageShell>
                <NotFoundBox message={t('notFound')} backHref="/competitions" backLabel={t('backToList')} />
            </PageShell>
        );
    }

    const {competition, season} = page;

    return (
        <PageShell>
            <PageTitle
                eyebrow={[competition.country, season ? tFootball('labels.season', {season: season.name}) : null].filter(Boolean).join(' · ')}
                title={
                    <span className="inline-flex items-center gap-3">
                        {competition.logoUrl && (
                            <span className="inline-flex w-10 h-10 items-center justify-center rounded-xl border-[2.5px] border-foreground bg-card overflow-hidden">
                                <Image src={competition.logoUrl} alt="" width={30} height={30} className="object-contain" />
                            </span>
                        )}
                        {competition.name}
                    </span>
                }
                aside={page.live.length > 0 ? <Badge variant="accent">{t('live')} · {page.live.length}</Badge> : null}
            />

            {page.live.length > 0 && <MatchList title={t('live')} fixtures={page.live} />}

            <div className="grid gap-4 grid-cols-1 xl:grid-cols-[7fr_5fr] items-start">
                <StandingsTable groups={page.standings} title={t('standings')} />
                <div className="flex flex-col gap-4 min-w-0">
                    <section className="flex flex-col gap-2">
                        <h2 className="text-lg font-extrabold tracking-tight">{t('upcoming')}</h2>
                        {page.upcoming.length === 0 ? (
                            <MatchList fixtures={[]} />
                        ) : (
                            page.upcoming.map((r) => <MatchList key={r.round} title={roundLabel(r.round) || undefined} fixtures={r.fixtures} />)
                        )}
                    </section>
                    <section className="flex flex-col gap-2">
                        <h2 className="text-lg font-extrabold tracking-tight">{t('results')}</h2>
                        {page.results.length === 0 ? (
                            <MatchList fixtures={[]} />
                        ) : (
                            page.results.map((r) => <MatchList key={r.round} title={roundLabel(r.round) || undefined} fixtures={r.fixtures} />)
                        )}
                    </section>
                </div>
            </div>
        </PageShell>
    );
}
