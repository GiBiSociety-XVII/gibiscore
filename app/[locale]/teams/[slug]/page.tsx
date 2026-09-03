import type {Metadata} from "next";
import {getTranslations, setRequestLocale} from "next-intl/server";
import {Link} from "@/i18n/navigation";
import {Card} from "@/components/shared/ui/card";
import {Badge} from "@/components/shared/ui/badge";
import {TeamCrest} from "@/components/home/team-crest";
import {MatchList} from "@/components/football/match-list";
import {NotFoundBox, PageShell, PageTitle} from "@/components/football/page-shell";
import {getTeamPage} from "@/lib/football/data/teams";

export const revalidate = 120;

export async function generateMetadata({params}: PageProps<"/[locale]/teams/[slug]">): Promise<Metadata> {
    const {slug} = await params;
    const t = await getTranslations('Pages.team');
    const page = await getTeamPage(slug);
    if (!page) return {title: t('notFound')};
    return {title: page.team.name, description: t('metaDescription', {name: page.team.name})};
}

const POSITIONS = ['goalkeeper', 'defender', 'midfielder', 'attacker'] as const;

export default async function TeamPage({params}: PageProps<"/[locale]/teams/[slug]">) {
    const {locale, slug} = await params;
    setRequestLocale(locale);
    const t = await getTranslations('Pages.team');
    const tFootball = await getTranslations('Football');
    const page = await getTeamPage(slug);

    if (!page) {
        return (
            <PageShell>
                <NotFoundBox message={t('notFound')} backHref="/competitions" backLabel="Competizioni" />
            </PageShell>
        );
    }

    const {team} = page;
    const squadByPosition = POSITIONS.map((pos) => ({pos, players: page.squad.filter((p) => p.position === pos)}));
    const others = page.squad.filter((p) => !POSITIONS.includes(p.position as (typeof POSITIONS)[number]));

    return (
        <PageShell>
            <PageTitle
                eyebrow={[team.country, team.venue, team.founded ? t('founded', {year: team.founded}) : null].filter(Boolean).join(' · ')}
                title={
                    <span className="inline-flex items-center gap-3">
                        <TeamCrest team={team} size={44} />
                        {team.name}
                    </span>
                }
            />

            {page.standings.length > 0 && (
                <section className="grid gap-3 grid-cols-1 md:grid-cols-2 xl:grid-cols-3">
                    {page.standings.map((s) => (
                        <Link key={`${s.competition.id}-${s.season.id}`} href={`/competitions/${s.competition.slug}`} className="block">
                            <Card press className="p-3 flex items-center gap-3">
                                <span className="inline-flex items-center justify-center w-10 h-10 rounded-xl border-[2.5px] border-foreground bg-accent font-mono text-xl font-bold tabular-nums">{s.row.position}</span>
                                <span className="flex flex-col gap-0.5 min-w-0">
                                    <span className="font-extrabold truncate">{s.competition.name}</span>
                                    <span className="text-sm font-semibold text-muted-foreground">
                                        {t('position', {position: s.row.position, total: s.totalTeams})} · {s.row.points} {tFootball('table.points').toLowerCase()} · {s.row.played} {tFootball('table.played').toLowerCase()}
                                    </span>
                                </span>
                            </Card>
                        </Link>
                    ))}
                </section>
            )}

            {page.live.length > 0 && <MatchList title={t('live')} fixtures={page.live} highlightTeamId={team.id} showCompetition />}

            <div className="grid gap-4 grid-cols-1 xl:grid-cols-2 items-start">
                <MatchList title={t('upcoming')} fixtures={page.upcoming} highlightTeamId={team.id} showCompetition />
                <MatchList title={t('recent')} fixtures={page.recent} highlightTeamId={team.id} showCompetition />
            </div>

            <div className="grid gap-4 grid-cols-1 xl:grid-cols-[7fr_5fr] items-start">
                <Card className="p-3 md:p-4 flex flex-col gap-3 min-w-0">
                    <h2 className="text-lg font-extrabold tracking-tight">{t('squad')}</h2>
                    {page.squad.length === 0 ? (
                        <p className="text-sm font-semibold text-muted-foreground">{tFootball('empty.noSquad')}</p>
                    ) : (
                        <div className="grid gap-4 grid-cols-1 md:grid-cols-2">
                            {[...squadByPosition, {pos: 'unknown' as const, players: others}]
                                .filter((g) => g.players.length > 0)
                                .map((g) => (
                                    <div key={g.pos} className="flex flex-col gap-1 min-w-0">
                                        <h3 className="text-xs font-extrabold uppercase tracking-wide text-muted-foreground">{tFootball(`positions.${g.pos}`)}</h3>
                                        <ul className="flex flex-col">
                                            {g.players.map((p) => (
                                                <li key={p.id} className="flex items-center gap-2 py-1 border-t-2 border-muted first:border-t-0">
                                                    <span className="font-mono text-xs font-bold tabular-nums w-6 text-right text-muted-foreground">{p.number ?? ''}</span>
                                                    <Link href={`/players/${p.slug}`} className="font-bold text-[13px] truncate hover:underline decoration-accent decoration-[3px] underline-offset-4">{p.name}</Link>
                                                    {p.age !== null && <span className="ml-auto text-xs font-semibold text-muted-foreground whitespace-nowrap">{p.age}</span>}
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                ))}
                        </div>
                    )}
                </Card>

                <Card className="p-3 md:p-4 flex flex-col gap-3 min-w-0">
                    <h2 className="text-lg font-extrabold tracking-tight">{t('sidelined')}</h2>
                    {page.sidelined.length === 0 ? (
                        <p className="text-sm font-semibold text-muted-foreground">–</p>
                    ) : (
                        <ul className="flex flex-col">
                            {page.sidelined.map((s) => (
                                <li key={s.player.id} className="flex items-center gap-3 py-1.5 border-t-2 border-muted first:border-t-0">
                                    <Link href={`/players/${s.player.slug}`} className="font-bold text-[13px] truncate hover:underline decoration-accent decoration-[3px] underline-offset-4">{s.player.name}</Link>
                                    <Badge variant={s.category === 'suspension' ? 'ink' : 'outline'} className="ml-auto whitespace-nowrap">{s.description ?? s.category}</Badge>
                                </li>
                            ))}
                        </ul>
                    )}
                </Card>
            </div>
        </PageShell>
    );
}
