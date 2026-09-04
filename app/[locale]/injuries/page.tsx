import type {Metadata} from "next";
import Image from "next/image";
import {getTranslations, setRequestLocale} from "next-intl/server";
import {Link} from "@/i18n/navigation";
import {SiteShell, Panel} from "@/components/shell/site-shell";
import {AbsenceList} from "@/components/football/absences";
import {Flag} from "@/components/football/flag";
import {PageHeader} from "@/components/football/page-header";
import {Tabs} from "@/components/football/tabs";
import {TeamCrest} from "@/components/football/team-crest";
import {getSidelined} from "@/lib/football/data/injuries";

export const revalidate = 1800;

export async function generateMetadata(): Promise<Metadata> {
    const t = await getTranslations('Pages.injuries');
    return {title: t('metaTitle'), description: t('metaDescription')};
}

export default async function InjuriesPage({params}: PageProps<"/[locale]/injuries">) {
    const {locale} = await params;
    setRequestLocale(locale);
    const t = await getTranslations('Pages.injuries');
    const tAbs = await getTranslations('Football.absences');
    const blocks = await getSidelined();

    return (
        <SiteShell wide>
            <PageHeader title={t('title')} meta={t('intro')} />
            {blocks.length > 0 && <p className="text-[12px] font-semibold text-muted-foreground -mt-1">{tAbs('hint')}</p>}
            {blocks.length === 0 ? (
                <p className="text-sm font-semibold text-muted-foreground">{t('empty')}</p>
            ) : (
                <Tabs
                    items={blocks.map((b) => ({
                        id: b.competition.slug,
                        count: b.total,
                        label: (
                            <span className="inline-flex items-center gap-1.5">
                                {b.competition.logoUrl ? <Image src={b.competition.logoUrl} alt="" width={14} height={14} unoptimized className="object-contain" /> : <Flag code={b.competition.countryCode} size={14} />}
                                {b.competition.name}
                            </span>
                        ),
                        content: (
                            <div className="grid gap-3 grid-cols-1 md:grid-cols-2 2xl:grid-cols-3 items-start">
                                {b.teams.map((entry) => (
                                    <Panel
                                        key={entry.team.id}
                                        title={
                                            <Link href={`/teams/${entry.team.slug}`} className="inline-flex items-center gap-2 hover:underline decoration-accent decoration-[2px] underline-offset-2">
                                                <TeamCrest team={entry.team} size={18} />
                                                {entry.team.name}
                                            </Link>
                                        }
                                        action={<span className="font-mono text-[11px] text-muted-foreground">{entry.players.length}</span>}
                                    >
                                        <AbsenceList entries={entry.players} />
                                    </Panel>
                                ))}
                            </div>
                        ),
                    }))}
                />
            )}
        </SiteShell>
    );
}
