import type {Metadata} from "next";
import Image from "next/image";
import {getFormatter, getTranslations, setRequestLocale} from "next-intl/server";
import {Link} from "@/i18n/navigation";
import {cn} from "@/components/shared/ui/cn";
import {SiteShell, Panel} from "@/components/shell/site-shell";
import {NotFoundBox, PageHeader} from "@/components/football/page-header";
import {RatingTrend} from "@/components/football/rating-trend";
import {Tabs} from "@/components/football/tabs";
import {TeamCrest} from "@/components/football/team-crest";
import {getPlayerPage} from "@/lib/football/data/players";

export const revalidate = 300;

function parseSeason(raw: string[] | undefined): number | undefined {
    const value = raw?.[0];
    if (!value || !/^\d{4}$/.test(value)) return undefined;
    return Number(value);
}

export async function generateMetadata({params}: PageProps<"/[locale]/players/[slug]/[[...season]]">): Promise<Metadata> {
    const {slug, season} = await params;
    const t = await getTranslations('Pages.player');
    const page = await getPlayerPage(slug, parseSeason(season));
    if (!page) return {title: t('notFound')};
    return {title: page.player.name, description: t('metaDescription', {name: page.player.name})};
}

function Stat({value, label, accent = false}: {value: string | number; label: string; accent?: boolean}) {
    return (
        <div className={cn("flex flex-col gap-0.5 px-3 py-2 border-l border-muted first:border-l-0 min-w-[84px]", accent && "bg-accent/40")}>
            <span className="font-mono text-[20px] font-bold leading-none tabular-nums">{value}</span>
            <span className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">{label}</span>
        </div>
    );
}

const cellClass = "px-1.5 py-1 text-right font-mono tabular-nums";

export default async function PlayerPage({params}: PageProps<"/[locale]/players/[slug]/[[...season]]">) {
    const {locale, slug, season} = await params;
    setRequestLocale(locale);
    const t = await getTranslations('Pages.player');
    const tFootball = await getTranslations('Football');
    const format = await getFormatter();
    const page = await getPlayerPage(slug, parseSeason(season));

    if (!page) {
        return (
            <SiteShell>
                <NotFoundBox message={t('notFound')} backHref="/competitions" backLabel="Competizioni" />
            </SiteShell>
        );
    }

    const {player, team, totals} = page;
    const pos = player.position && ['goalkeeper', 'defender', 'midfielder', 'attacker'].includes(player.position) ? player.position : 'unknown';
    const isKeeper = pos === 'goalkeeper' || page.seasons.some((s) => s.position === 'goalkeeper');
    const seasonHref = (year: number) => (year === page.availableSeasons[0]?.year ? `/players/${player.slug}` : `/players/${player.slug}/${year}`);

    const seasonsTab = (
        <Panel title={t('seasonStats')}>
            {page.seasons.length === 0 ? (
                <p className="px-3 py-3 text-[13px] font-semibold text-muted-foreground">{t('noSeasonStats')}</p>
            ) : (
                <div className="overflow-x-auto">
                    <table className="w-full text-[13px]">
                        <thead>
                            <tr className="text-muted-foreground text-[10px] font-extrabold tracking-wider uppercase">
                                <th className="px-1.5 py-1 text-left">{t('seasonTable.season')}</th>
                                <th className="px-1.5 py-1 text-left">{t('seasonTable.team')}</th>
                                <th className="px-1.5 py-1 text-left">{t('seasonTable.competition')}</th>
                                {(['apps', 'lineups', 'minutes', 'rating', 'goals', 'assists'] as const).map((k) => <th key={k} className="px-1.5 py-1 text-right font-mono">{t(`seasonTable.${k}`)}</th>)}
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
                                <tr key={`${s.seasonYear}-${s.team.id}-${s.competition.id}`} className={cn("border-t border-muted font-semibold", s.seasonYear === page.selectedSeason && "bg-accent/25")}>
                                    <td className="px-1.5 py-1 font-mono tabular-nums whitespace-nowrap">
                                        <Link href={seasonHref(s.seasonYear)} className="hover:underline decoration-accent decoration-[3px] underline-offset-2">{s.seasonName}</Link>
                                    </td>
                                    <td className="px-1.5 py-1 whitespace-nowrap">
                                        <Link href={`/teams/${s.team.slug}`} className="inline-flex items-center gap-1.5 hover:underline decoration-accent decoration-[3px] underline-offset-2">
                                            <TeamCrest team={s.team} size={16} />
                                            {s.team.name}
                                        </Link>
                                    </td>
                                    <td className="px-1.5 py-1 whitespace-nowrap">
                                        <Link href={`/competitions/${s.competition.slug}`} className="hover:underline decoration-accent decoration-[3px] underline-offset-2">{s.competition.name}</Link>
                                    </td>
                                    <td className={cellClass}>{s.appearances}</td>
                                    <td className={cellClass}>{s.lineups}</td>
                                    <td className={cellClass}>{s.minutes}</td>
                                    <td className={cellClass}>{s.rating !== null ? s.rating.toFixed(2) : '–'}</td>
                                    <td className={cn(cellClass, "font-extrabold")}>{s.goals}</td>
                                    <td className={cellClass}>{s.assists}</td>
                                    {isKeeper ? (
                                        <>
                                            <td className={cellClass}>{s.goalsConceded ?? '–'}</td>
                                            <td className={cellClass}>{s.saves ?? '–'}</td>
                                        </>
                                    ) : (
                                        <>
                                            <td className={cellClass}>{s.shots !== null ? `${s.shots} (${s.shotsOn ?? 0})` : '–'}</td>
                                            <td className={cellClass}>{s.keyPasses ?? '–'}</td>
                                        </>
                                    )}
                                    <td className={cellClass}>{s.passAccuracy !== null ? `${s.passAccuracy}%` : '–'}</td>
                                    <td className={cellClass}>{s.yellowCards} / {s.redCards}</td>
                                    <td className={cellClass}>{isKeeper ? s.penaltiesSaved : `${s.penaltiesScored}/${s.penaltiesScored + s.penaltiesMissed}`}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
            <p className="px-3 py-2 text-[11px] font-semibold text-muted-foreground border-t border-muted">{t('seasonHint')}</p>
        </Panel>
    );

    const matchesTab = (
        <Panel title={`${t('matches')} · ${page.selectedSeasonName}`}>
            {page.matches.length === 0 ? (
                <p className="px-3 py-3 text-[13px] font-semibold text-muted-foreground">{t('noMatches')}</p>
            ) : (
                <div className="overflow-x-auto">
                    <table className="w-full text-[13px]">
                        <thead>
                            <tr className="text-muted-foreground text-[10px] font-extrabold tracking-wider uppercase">
                                <th className="px-1.5 py-1 text-left">Data</th>
                                <th className="px-1.5 py-1 text-left">Partita</th>
                                {(['minutes', 'rating', 'goals', 'assists', 'cards'] as const).map((k) => <th key={k} className="px-1.5 py-1 text-right font-mono">{tFootball(`playerTable.${k}`)}</th>)}
                            </tr>
                        </thead>
                        <tbody>
                            {page.matches.map((m) => {
                                const opponent = m.teamId === m.fixture.home.id ? m.fixture.away : m.fixture.home;
                                const isHome = m.teamId === m.fixture.home.id;
                                const score = m.fixture.homeScore !== null && m.fixture.awayScore !== null ? `${m.fixture.homeScore}-${m.fixture.awayScore}` : '';
                                return (
                                    <tr key={m.fixture.id} className="border-t border-muted font-semibold">
                                        <td className="px-1.5 py-1 whitespace-nowrap text-muted-foreground">{format.dateTime(new Date(m.fixture.startingAt), {day: 'numeric', month: 'short'})}</td>
                                        <td className="px-1.5 py-1">
                                            <Link href={`/matches/${m.fixture.id}`} className="inline-flex items-center gap-2 hover:underline decoration-accent decoration-[3px] underline-offset-2">
                                                <span className="text-[11px] text-muted-foreground w-3">{isHome ? 'C' : 'T'}</span>
                                                <TeamCrest team={opponent} size={16} />
                                                <span className="truncate">{opponent.name}</span>
                                                <span className="font-mono tabular-nums">{score}</span>
                                            </Link>
                                        </td>
                                        <td className={cellClass}>{m.minutes ?? '–'}</td>
                                        <td className={cellClass}>{m.rating !== null ? m.rating.toFixed(1) : '–'}</td>
                                        <td className={cellClass}>{m.goals || ''}</td>
                                        <td className={cellClass}>{m.assists || ''}</td>
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
        </Panel>
    );

    return (
        <SiteShell>
            <PageHeader
                visual={
                    <span className="inline-flex w-12 h-12 rounded-xl border-[2.5px] border-foreground bg-muted overflow-hidden">
                        {player.imageUrl && <Image src={player.imageUrl} alt="" width={48} height={48} className="object-cover" />}
                    </span>
                }
                title={
                    <span className="inline-flex items-center gap-2">
                        {player.name}
                        {player.injured && <span className="bb-badge bg-card text-[10px]">{t('injured')}</span>}
                    </span>
                }
                meta={
                    <>
                        {team && (
                            <Link href={`/teams/${team.slug}`} className="inline-flex items-center gap-1.5 text-foreground hover:underline decoration-accent decoration-[3px] underline-offset-2">
                                <TeamCrest team={team} size={16} />
                                {team.name}{player.number !== null ? ` #${player.number}` : ''}
                            </Link>
                        )}
                        <span>
                            {[tFootball(`positions.${pos as 'goalkeeper'}`), player.age !== null ? t('years', {age: player.age}) : null, player.nationality, player.height ? t('height', {cm: player.height}) : null]
                                .filter(Boolean)
                                .join(' · ')}
                        </span>
                    </>
                }
                aside={
                    page.availableSeasons.length > 1 ? (
                        <nav aria-label={t('seasonPicker')} className="flex items-center gap-1 flex-wrap justify-end">
                            {page.availableSeasons.slice(0, 5).map((s) => (
                                <Link
                                    key={s.year}
                                    href={seasonHref(s.year)}
                                    aria-current={s.year === page.selectedSeason ? 'page' : undefined}
                                    className={cn("px-2 h-6 inline-flex items-center rounded-md border-2 border-foreground text-[11px] font-extrabold font-mono tabular-nums", s.year === page.selectedSeason ? "bg-foreground text-background" : "bg-card hover:bg-accent")}
                                >
                                    {s.name}
                                </Link>
                            ))}
                        </nav>
                    ) : null
                }
            />

            <section className="bb-surface overflow-hidden">
                <div className="px-3 h-8 flex items-center text-[12px] font-extrabold uppercase tracking-wide border-b-2 border-foreground bg-card">{t('totals', {season: page.selectedSeasonName})}</div>
                <div className="flex overflow-x-auto">
                    <Stat value={totals.matches} label={t('matchesPlayed')} />
                    <Stat value={totals.minutes} label={t('minutes')} />
                    <Stat value={totals.goals} label={t('goals')} />
                    <Stat value={totals.assists} label={t('assists')} />
                    <Stat value={`${totals.yellowCards}/${totals.redCards}`} label={t('cards')} />
                    <Stat value={totals.averageRating !== null ? totals.averageRating.toFixed(2) : '–'} label={t('averageRating')} accent />
                    <RatingTrend matches={page.matches} average={totals.averageRating} label={t('ratingTrend')} />
                </div>
            </section>

            <Tabs items={[{id: 'seasons', label: t('tabs.seasons'), content: seasonsTab, count: page.seasons.length}, {id: 'matches', label: t('tabs.matches'), content: matchesTab, count: page.matches.length}]} />
        </SiteShell>
    );
}
