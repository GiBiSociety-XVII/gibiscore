import type {Metadata} from "next";
import {getTranslations, setRequestLocale} from "next-intl/server";
import {Link} from "@/i18n/navigation";
import {Badge} from "@/components/shared/ui/badge";
import {MatchList} from "@/components/football/match-list";
import {PageShell, PageTitle} from "@/components/football/page-shell";
import {getLivePage} from "@/lib/football/data/live";

export const revalidate = 60;

export async function generateMetadata(): Promise<Metadata> {
    const t = await getTranslations('Pages.live');
    return {title: t('metaTitle'), description: t('metaDescription')};
}

export default async function LivePage({params, searchParams}: PageProps<"/[locale]/live">) {
    const {locale} = await params;
    setRequestLocale(locale);
    const t = await getTranslations('Pages.live');
    const {day} = await searchParams;
    const offset = day === 'yesterday' ? -1 : day === 'tomorrow' ? 1 : 0;
    const page = await getLivePage(offset);

    const tabs = [
        {key: 'yesterday', offset: -1},
        {key: 'today', offset: 0},
        {key: 'tomorrow', offset: 1},
    ] as const;

    return (
        <PageShell>
            <PageTitle
                title={t('title')}
                aside={
                    <Badge variant="ink">
                        <span className="w-2 h-2 rounded-full bg-accent" aria-hidden="true" />
                        {t('liveBadge', {count: page.liveCount})}
                    </Badge>
                }
            />
            <nav className="flex gap-2">
                {tabs.map((tab) => (
                    <Link
                        key={tab.key}
                        href={tab.offset === 0 ? '/live' : `/live?day=${tab.key}`}
                        className={`bb-btn px-4 py-2 text-sm ${tab.offset === offset ? 'bg-accent' : 'bg-card'}`}
                    >
                        {t(tab.key)}
                    </Link>
                ))}
            </nav>
            {page.groups.length === 0 ? (
                <p className="text-sm font-semibold text-muted-foreground">{t('empty')}</p>
            ) : (
                page.groups.map((group) => (
                    <section key={group.competition.slug} className="flex flex-col gap-2">
                        <Link href={`/competitions/${group.competition.slug}`} className="text-sm font-extrabold uppercase tracking-wide hover:underline decoration-accent decoration-[3px] underline-offset-4 self-start">
                            {group.competition.name}
                        </Link>
                        <MatchList fixtures={group.fixtures} />
                    </section>
                ))
            )}
        </PageShell>
    );
}
