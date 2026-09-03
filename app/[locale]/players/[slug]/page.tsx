import type {Metadata} from "next";
import Image from "next/image";
import {getFormatter, getTranslations, setRequestLocale} from "next-intl/server";
import {Link} from "@/i18n/navigation";
import {Badge} from "@/components/shared/ui/badge";
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
        <div className={cn("border-2 border-foreground rounded-xl p-2.5 flex flex-col gap-0.5", accent ? "bg-accent" : "bg-background")}>
            <span className="font-mono text-[22px] font-bold leading-none tabular-nums">{value}</span>
            <span className="text-xs font-bold text-muted-foreground">{label}</span>
        </div>
    );
}

function parseSeason(raw: string | string[] | undefined): number | undefined {
    const value = Array.isArray(raw) ? raw[0] : raw;
    if (!value || !/^\d{4}$/.test(value)) return undefined;
    return Number(value);
}

export default async function PlayerPage({params, searchParams}: PageProps<"/[locale]/players/[slug]">) {
    const {locale, slug} = await params;
    const {season} = await searchParams;
    setRequestLocale(locale);
    const t = await getTranslations('Pages.player');
    const tFootball = await getTranslations('Football');
    const format = await getFormatter();
    const page = await getPlayerPage(slug, parseSeason(season));

    if (!page) {
        return (
            <PageShell>
                <NotFoundBox message={t('notFound')} backHref="/competitions" backLabel="Competizioni" />
            </PageShell>
        );
    }

    const {player, team, totals} = page;
    const pos = player.position && ['goalkeeper', 'defender', 'midfielder', 'attacker'].includes(player.position) ? player.position : 'unknown';
    const isKeeper = pos === 'goalkeeper' || page.seasons.some((s) => s.position === 'goalkeeper');

    return (
        <PageShell>
            <PageTitle
                eyebrow={[tFootball(`positions.${pos as 'goalkeeper'}`), player.age !== null ? t('years', {age: player.age}) : null, player.nationality, player.height ? t('height', {cm: player.height}) : null]
                    .filter(Boolean)
                    .join(' · ')}
                title={
                    <span className="inline-flex items-center gap-4">
                        <span className="inline-flex w-12 h-12 rounded-xl border-[2.5px] border-foreground bg-muted overflow-hidden shrink-0">
                            {player.imageUrl && <Image src={player.imageUrl} alt="" width={48} height={48} className="object-cover" />}
                        </span>
                        <span className="flex flex-col gap-1">
                            <span className="inline-flex items-center gap-2 flex-wrap">
                                {player.name}
                                {player.injured && <Badge variant="outline" className="text-xs">{t('injured')}</Badge>}
                            </span>
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

            {page.availableSeasons.length > 1 && (
                <nav aria-label={t('seasonPicker')} className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-xs font-extrabold uppercase tracking-wide text-muted-foreground mr-1">{t('seasonPicker')}</span>
                    {page.availableSeasons.map((s) => (
                        <Link
                            key={s.year}
                            href={{pathname: `/players/${player.slug}`, query: s.year === page.availableSeasons[0].year ? {} : {season: s.year}}}
                            className={cn(
                                "px-2 py-0.5 rounded-lg border-2 border-foreground text-xs font-extrabold font-mono tabular-nums",
                                s.year === page.selectedSeason ? "bg-foreground text-background" : "bg-card hover:bg-accent",
                            )}
                            aria-current={s.year === page.selectedSeason ? 'page' : undefined}
                        >
                            {s.name}
                        </Link>
                    ))}
                </nav>
            )}

            <Card press className="p-3 md:p-4 flex flex-col gap-3">
                <h2 className="text-lg font-extrabold tracking-tight">{t('totals', {season: page.selectedSeasonName})}</h2>
                <div className="grid gap-2 grid-cols-2 md:grid-cols-4 xl:grid-cols-8">
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

            <Card className="p-3 md:p-4 flex flex-col gap-3 min-w-0">
                <h2 className="text-lg font-extrabold tracking-tight">{t('seasonStats')}</h2>
                {page.seasons.length === 0 ? (
                    <p className="text-sm font-semibold text-muted-foreground">{t('noSeasonStats')}</p>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-[13px]">
                            <thead>
                                <tr className="text-muted-foreground text-[11px] font-extrabold tracking-wider uppercase">
                                    <th className="px-1.5 py-1 text-left">{t('seasonTable.season')}</th>
                                    <th className="px-1.5 py-1 text-left">{t('seasonTable.team')}</th>
                                    <th className="px-1.5 py-1 text-left">{t('seasonTable.competition')}</th>
                                    <th className="px-1.5 py-1 text-right font-mono">{t('seasonTable.apps')}</th>
                                    <th className="px-1.5 py-1 text-right font-mono">{t('seasonTable.lineups')}</th>
                                    <th className="px-1.5 py-1 text-right font-mono">{t('seasonTable.minutes')}</th>
                                    <th className="px-1.5 py-1 text-right font-mono">{t('seasonTable.rating')}</th>
                                    <th className="px-1.5 py-1 text-right font-mono">{t('seasonTable.goals')}</th>
                                    <th className="px-1.5 py-1 text-right font-mono">{t('seasonTable.assists')}</th>
                                    {isKeeper ? (
                                        <>
                                            <th className="px-1.5 py-1 text-right font-mono">{t('seasonTable.conceded')}</th>
                                            <th className="px-1.5 py-1 text-right font-mono">{t('seasonTable.saves')}</th>
                                        </>
                                    ) : (
                                        <>
                                            <th className="px-1.5 py-1 text-right font-mono">{t('seasonTable.shots')}</th>
                                            <th className="px-1.5 py-1 text-right font-mono">{t('seasonTable.keyPasses')}</th>
                                        </>
                                    )}
                                    <th className="px-1.5 py-1 text-right font-mono">{t('seasonTable.passAccuracy')}</th>
                                    <th className="px-1.5 py-1 text-right font-mono">{t('seasonTable.cards')}</th>
                                    <th className="px-1.5 py-1 text-right font-mono">{t('seasonTable.penalties')}</th>
                                </tr>
                            </thead>
                            <tbody>
                                {page.seasons.map((s) => (
                                    <tr key={`${s.seasonYear}-${s.team.id}-${s.competition.id}`} className={cn("border-t-2 border-muted font-semibold", s.seasonYear === page.selectedSeason && "bg-accent/30")}>
                                        <td className="px-1.5 py-1 font-mono tabular-nums whitespace-nowrap">
                                            <Link href={{pathname: `/players/${player.slug}`, query: {season: s.seasonYear}}} className="hover:underline decoration-accent decoration-[3px] underline-offset-4">{s.seasonName}</Link>
                                        </td>
                                        <td className="px-1.5 py-1 whitespace-nowrap">
                                            <Link href={`/teams/${s.team.slug}`} className="inline-flex items-center gap-1.5 hover:underline decoration-accent decoration-[3px] underline-offset-4">
                                                <TeamCrest team={s.team} size={18} />
                                                {s.team.name}
                                            </Link>
                                        </td>
                                        <td className="px-1.5 py-1 whitespace-nowrap">
                                            <Link href={`/competitions/${s.competition.slug}`} className="hover:underline decoration-accent decoration-[3px] underline-offset-4">{s.competition.name}</Link>
                                        </td>
                                        <td className="px-1.5 py-1 text-right font-mono tabular-nums">{s.appearances}</td>
                                        <td className="px-1.5 py-1 text-right font-mono tabular-nums">{s.lineups}</td>
                                        <td className="px-1.5 py-1 text-right font-mono tabular-nums">{s.minutes}</td>
                                        <td className="px-1.5 py-1 text-right font-mono tabular-nums">{s.rating !== null ? s.rating.toFixed(2) : '–'}</td>
                                        <td className="px-1.5 py-1 text-right font-mono tabular-nums font-extrabold">{s.goals}</td>
                                        <td className="px-1.5 py-1 text-right font-mono tabular-nums">{s.assists}</td>
                                        {isKeeper ? (
                                            <>
                                                <td className="px-1.5 py-1 text-right font-mono tabular-nums">{s.goalsConceded ?? '–'}</td>
                                                <td className="px-1.5 py-1 text-right font-mono tabular-nums">{s.saves ?? '–'}</td>
                                            </>
                                        ) : (
                                            <>
                                                <td className="px-1.5 py-1 text-right font-mono tabular-nums">{s.shots !== null ? `${s.shots} (${s.shotsOn ?? 0})` : '–'}</td>
                                                <td className="px-1.5 py-1 text-right font-mono tabular-nums">{s.keyPasses ?? '–'}</td>
                                            </>
                                        )}
                                        <td className="px-1.5 py-1 text-right font-mono tabular-nums">{s.passAccuracy !== null ? `${s.passAccuracy}%` : '–'}</td>
                                        <td className="px-1.5 py-1 text-right font-mono tabular-nums">{s.yellowCards} / {s.redCards}</td>
                                        <td className="px-1.5 py-1 text-right font-mono tabular-nums">{isKeeper ? s.penaltiesSaved : `${s.penaltiesScored}/${s.penaltiesScored + s.penaltiesMissed}`}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
                <p className="text-xs font-semibold text-muted-foreground">{t('seasonHint')}</p>
            </Card>

            <Card className="p-3 md:p-4 flex flex-col gap-3 min-w-0">
                <h2 className="text-lg font-extrabold tracking-tight">{t('matches')}</h2>
                {page.matches.length === 0 ? (
                    <p className="text-sm font-semibold text-muted-foreground">{t('noMatches')}</p>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-[13px]">
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
                                            <td className="px-1.5 py-1 whitespace-nowrap text-muted-foreground">{format.dateTime(new Date(m.fixture.startingAt), {day: 'numeric', month: 'short'})}</td>
                                            <td className="px-1.5 py-1">
                                                <Link href={`/matches/${m.fixture.id}`} className="inline-flex items-center gap-2 hover:underline decoration-accent decoration-[3px] underline-offset-4">
                                                    <span className="text-xs text-muted-foreground w-4">{isHome ? 'C' : 'T'}</span>
                                                    <TeamCrest team={opponent} size={20} />
                                                    <span className="truncate">{opponent.name}</span>
                                                    <span className="font-mono tabular-nums">{score}</span>
                                                </Link>
                                            </td>
                                            <td className="px-1.5 py-1 text-right font-mono tabular-nums">{m.minutes ?? '–'}</td>
                                            <td className="px-1.5 py-1 text-right font-mono tabular-nums">{m.rating !== null ? m.rating.toFixed(1) : '–'}</td>
                                            <td className="px-1.5 py-1 text-right font-mono tabular-nums font-extrabold">{m.fantasy !== null ? m.fantasy.toFixed(1) : '–'}</td>
                                            <td className="px-1.5 py-1 text-right font-mono tabular-nums">{m.goals || ''}</td>
                                            <td className="px-1.5 py-1 text-right font-mono tabular-nums">{m.assists || ''}</td>
                                            <td className="px-1.5 py-1 text-right">
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
