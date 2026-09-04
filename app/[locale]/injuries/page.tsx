import type {Metadata} from "next";
import Image from "next/image";
import {getFormatter, getTranslations, setRequestLocale} from "next-intl/server";
import {Link} from "@/i18n/navigation";
import {Badge} from "@/components/shared/ui/badge";
import {SiteShell, Panel} from "@/components/shell/site-shell";
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
    const format = await getFormatter();
    const blocks = await getSidelined();

    return (
        <SiteShell wide>
            <PageHeader title={t('title')} meta={t('intro')} />
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
                                        <ul className="flex flex-col">
                                            {entry.players.map((p) => (
                                                <li key={p.player.id} className="flex items-center gap-2.5 px-3 h-10 border-t border-muted first:border-t-0">
                                                    <span className="inline-flex w-6 h-6 rounded-full bg-muted overflow-hidden shrink-0">
                                                        {p.player.imageUrl && <Image src={p.player.imageUrl} alt="" width={24} height={24} unoptimized className="object-cover" />}
                                                    </span>
                                                    <span className="flex flex-col leading-tight min-w-0">
                                                        <Link href={`/players/${p.player.slug}`} className="text-[13px] font-bold truncate hover:underline decoration-accent decoration-[2px] underline-offset-2">{p.player.name}</Link>
                                                        <span className="text-[11px] font-semibold text-muted-foreground truncate">
                                                            {p.description ?? t(`category.${p.category === 'suspension' ? 'suspension' : 'injury'}`)}
                                                            {p.since ? ` · ${format.dateTime(new Date(`${p.since}T12:00:00Z`), {day: 'numeric', month: 'short'})}` : ''}
                                                        </span>
                                                    </span>
                                                    <Badge variant={p.category === 'suspension' ? 'ink' : 'outline'} className="ml-auto whitespace-nowrap">{t(`category.${p.category === 'suspension' ? 'suspension' : 'injury'}`)}</Badge>
                                                </li>
                                            ))}
                                        </ul>
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
