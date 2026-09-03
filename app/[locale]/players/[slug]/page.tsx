import type {Metadata} from "next";
import Image from "next/image";
import {getFormatter, getTranslations, setRequestLocale} from "next-intl/server";
import {Link} from "@/i18n/navigation";
import {Card} from "@/components/shared/ui/card";
import {cn} from "@/components/shared/ui/cn";
import {TeamCrest} from "@/components/home/team-crest";
import {NotFoundBox, PageShell, PageTitle} from "@/components/football/page-shell";
import {getPlayerPage} from "@/lib/football/data/players";

export const revalidate = 300;

export async function generateMetadata({params}: PageProps<"/[locale]/players/[slug]">): Promise<Metadata> {
    const {slug} = await params;
    const t = await getTranslations('Pages.player');
    const page = await getPlayerPage(slug);
    if (!page) return {title: t('notFound')};
    return {title: page.player.name, description: t('metaDescription', {name: page.player.name})};
}

function Stat({value, label, accent = false}: {value: string | number; label: string; accent?: boolean}) {
    return (
        <div className={cn("border-2 border-foreground rounded-xl p-3 flex flex-col gap-1", accent ? "bg-accent" : "bg-background")}>
            <span className="font-mono text-[26px] font-bold leading-none tabular-nums">{value}</span>
            <span className="text-xs font-bold text-muted-foreground">{label}</span>
        </div>
    );
}

export default async function PlayerPage({params}: PageProps<"/[locale]/players/[slug]">) {
    const {locale, slug} = await params;
    setRequestLocale(locale);
    const t = await getTranslations('Pages.player');
    const tFootball = await getTranslations('Football');
    const format = await getFormatter();
    const page = await getPlayerPage(slug);

    if (!page) {
        return (
            <PageShell>
                <NotFoundBox message={t('notFound')} backHref="/competitions" backLabel="Competizioni" />
            </PageShell>
        );
    }

    const {player, team, totals} = page;
    const pos = player.position && ['goalkeeper', 'defender', 'midfielder', 'attacker'].includes(player.position) ? player.position : 'unknown';

    return (
        <PageShell>
            <PageTitle
                eyebrow={[tFootball(`positions.${pos as 'goalkeeper'}`), player.age !== null ? t('years', {age: player.age}) : null, player.nationality, player.height ? t('height', {cm: player.height}) : null]
                    .filter(Boolean)
                    .join(' · ')}
                title={
                    <span className="inline-flex items-center gap-4">
                        <span className="inline-flex w-16 h-16 rounded-xl border-[2.5px] border-foreground bg-muted overflow-hidden shrink-0">
                            {player.imageUrl && <Image src={player.imageUrl} alt="" width={64} height={64} className="object-cover" />}
                        </span>
                        <span className="flex flex-col gap-1">
                            <span>{player.name}</span>
                            {team && (
                                <Link href={`/teams/${team.slug}`} className="inline-flex items-center gap-2 text-base font-bold text-muted-foreground hover:underline decoration-accent decoration-[3px] underline-offset-4">
                                    <TeamCrest team={team} size={22} />
                                    {team.name}{player.number !== null ? ` · #${player.number}` : ''}
                                </Link>
                            )}
                        </span>
                    </span>
                }
            />

            <Card press className="p-5 md:p-6 flex flex-col gap-4">
                <h2 className="text-[22px] font-extrabold tracking-tight">{t('totals')}</h2>
                <div className="grid gap-3 grid-cols-2 md:grid-cols-4 xl:grid-cols-8">
                    <Stat value={totals.matches} label={t('matchesPlayed')} />
                    <Stat value={totals.minutes} label={t('minutes')} />
                    <Stat value={totals.goals} label={t('goals')} />
                    <Stat value={totals.assists} label={t('assists')} />
                    <Stat value={`${totals.yellowCards} / ${totals.redCards}`} label={t('cards')} />
                    <Stat value={totals.averageRating !== null ? totals.averageRating.toFixed(2) : '–'} label={t('averageRating')} />
                    <Stat value={totals.averageFantasy !== null ? totals.averageFantasy.toFixed(2) : '–'} label={t('averageFantasy')} accent />
                </div>
                <p className="text-xs font-semibold text-muted-foreground">{tFootball('playerTable.fantasyHint')}</p>
            </Card>

            <Card className="p-4 md:p-6 flex flex-col gap-4 min-w-0">
                <h2 className="text-[22px] font-extrabold tracking-tight">{t('matches')}</h2>
                {page.matches.length === 0 ? (
                    <p className="text-sm font-semibold text-muted-foreground">{t('noMatches')}</p>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="text-muted-foreground text-[11px] font-extrabold tracking-wider">
                                    <th className="px-1.5 py-1 text-left">DATA</th>
                                    <th className="px-1.5 py-1 text-left">PARTITA</th>
                                    <th className="px-1.5 py-1 text-right font-mono">{tFootball('playerTable.minutes')}</th>
                                    <th className="px-1.5 py-1 text-right font-mono">{tFootball('playerTable.rating')}</th>
                                    <th className="px-1.5 py-1 text-right font-mono">{tFootball('playerTable.fantasy')}</th>
                                    <th className="px-1.5 py-1 text-right font-mono">{tFootball('playerTable.goals')}</th>
                                    <th className="px-1.5 py-1 text-right font-mono">{tFootball('playerTable.assists')}</th>
                                    <th className="px-1.5 py-1 text-right font-mono">{tFootball('playerTable.cards')}</th>
                                </tr>
                            </thead>
                            <tbody>
                                {page.matches.map((m) => {
                                    const opponent = m.teamId === m.fixture.home.id ? m.fixture.away : m.fixture.home;
                                    const isHome = m.teamId === m.fixture.home.id;
                                    const score = m.fixture.homeScore !== null && m.fixture.awayScore !== null ? `${m.fixture.homeScore}–${m.fixture.awayScore}` : '';
                                    return (
                                        <tr key={m.fixture.id} className="border-t-2 border-muted font-semibold">
                                            <td className="px-1.5 py-2 whitespace-nowrap text-muted-foreground">{format.dateTime(new Date(m.fixture.startingAt), {day: 'numeric', month: 'short'})}</td>
                                            <td className="px-1.5 py-2">
                                                <Link href={`/matches/${m.fixture.id}`} className="inline-flex items-center gap-2 hover:underline decoration-accent decoration-[3px] underline-offset-4">
                                                    <span className="text-xs text-muted-foreground w-4">{isHome ? 'C' : 'T'}</span>
                                                    <TeamCrest team={opponent} size={20} />
                                                    <span className="truncate">{opponent.name}</span>
                                                    <span className="font-mono tabular-nums">{score}</span>
                                                </Link>
                                            </td>
                                            <td className="px-1.5 py-2 text-right font-mono tabular-nums">{m.minutes ?? '–'}</td>
                                            <td className="px-1.5 py-2 text-right font-mono tabular-nums">{m.rating !== null ? m.rating.toFixed(1) : '–'}</td>
                                            <td className="px-1.5 py-2 text-right font-mono tabular-nums font-extrabold">{m.fantasy !== null ? m.fantasy.toFixed(1) : '–'}</td>
                                            <td className="px-1.5 py-2 text-right font-mono tabular-nums">{m.goals || ''}</td>
                                            <td className="px-1.5 py-2 text-right font-mono tabular-nums">{m.assists || ''}</td>
                                            <td className="px-1.5 py-2 text-right">
                                                {m.yellowCards > 0 && <span className="inline-block w-2.5 h-3.5 bg-yellow-300 border border-foreground rounded-[2px] mr-0.5" />}
                                                {m.redCards > 0 && <span className="inline-block w-2.5 h-3.5 bg-red-500 border border-foreground rounded-[2px]" />}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </Card>
        </PageShell>
    );
}
