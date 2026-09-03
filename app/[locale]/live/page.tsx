import type {Metadata} from "next";
import {ChevronLeft, ChevronRight} from "lucide-react";
import {getFormatter, getTranslations, setRequestLocale} from "next-intl/server";
import {Link} from "@/i18n/navigation";
import {Badge} from "@/components/shared/ui/badge";
import {cn} from "@/components/shared/ui/cn";
import {MatchList} from "@/components/football/match-list";
import {PageShell, PageTitle} from "@/components/football/page-shell";
import {getLivePage, type CountryFixtures} from "@/lib/football/data/live";
import type {CompetitionFixtures} from "@/lib/football/types";

export const revalidate = 60;

export async function generateMetadata(): Promise<Metadata> {
    const t = await getTranslations('Pages.live');
    return {title: t('metaTitle'), description: t('metaDescription')};
}

function shiftDay(day: string, delta: number): string {
    const d = new Date(`${day}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() + delta);
    return d.toISOString().slice(0, 10);
}

function CompetitionSection({group}: {group: CompetitionFixtures}) {
    return (
        <section className="flex flex-col gap-1.5">
            <Link href={`/competitions/${group.competition.slug}`} className="text-sm font-extrabold uppercase tracking-wide hover:underline decoration-accent decoration-[3px] underline-offset-4 self-start">
                {group.competition.country ? `${group.competition.country} · ` : ''}{group.competition.name}
            </Link>
            <MatchList fixtures={group.fixtures} />
        </section>
    );
}

function CountryBlock({block, open}: {block: CountryFixtures; open: boolean}) {
    const count = block.competitions.reduce((s, c) => s + c.fixtures.length, 0);
    return (
        <details className="bb-surface overflow-hidden group" open={open}>
            <summary className="cursor-pointer list-none flex items-center justify-between gap-3 px-3 md:px-4 py-2 font-extrabold text-[14px] hover:bg-muted/60">
                <span>{block.country}</span>
                <span className="text-xs font-bold text-muted-foreground">{count} · {block.competitions.length}</span>
            </summary>
            <div className="flex flex-col gap-3 p-3 border-t-[2.5px] border-foreground bg-background/60">
                {block.competitions.map((c) => (
                    <div key={c.competition.slug} className="flex flex-col gap-2">
                        <Link href={`/competitions/${c.competition.slug}`} className="text-xs font-extrabold uppercase tracking-wide hover:underline decoration-accent decoration-[3px] underline-offset-4 self-start">
                            {c.competition.name}
                        </Link>
                        <MatchList fixtures={c.fixtures} />
                    </div>
                ))}
            </div>
        </details>
    );
}

export default async function LivePage({params, searchParams}: PageProps<"/[locale]/live">) {
    const {locale} = await params;
    setRequestLocale(locale);
    const t = await getTranslations('Pages.live');
    const format = await getFormatter();
    const {date} = await searchParams;
    const requested = typeof date === 'string' ? date : null;
    const page = await getLivePage(requested);

    const isLive = page.mode === 'live';
    const dayLabel = format.dateTime(new Date(`${page.date}T12:00:00Z`), {weekday: 'long', day: 'numeric', month: 'long'});
    const navBtn = (active: boolean) => cn("bb-btn px-3 py-1.5 text-[13px] whitespace-nowrap", active ? "bg-accent" : "bg-card");

    return (
        <PageShell>
            <PageTitle
                title={isLive ? t('title') : t('dayTitle', {date: dayLabel})}
                aside={
                    <Badge variant="ink">
                        <span className="w-2 h-2 rounded-full bg-accent" aria-hidden="true" />
                        {isLive ? t('liveBadge', {count: page.liveCount}) : t('totalBadge', {count: page.total})}
                    </Badge>
                }
            />

            {/* Day navigation: live only, previous / today / next, and a date picker (plain GET form, no JS). */}
            <div className="flex flex-wrap items-center gap-2">
                <Link href="/live" className={navBtn(isLive)}>{t('liveOnly')}</Link>
                <span className="w-px h-8 bg-foreground/20 mx-1 hidden md:block" />
                <Link href={`/live?date=${shiftDay(page.date, -1)}`} className={navBtn(false)} aria-label={t('previousDay')}>
                    <ChevronLeft className="w-4 h-4" /> {t('previousDay')}
                </Link>
                <Link href={`/live?date=${page.today}`} className={navBtn(!isLive && page.date === page.today)}>{t('today')}</Link>
                <Link href={`/live?date=${shiftDay(page.date, 1)}`} className={navBtn(false)} aria-label={t('nextDay')}>
                    {t('nextDay')} <ChevronRight className="w-4 h-4" />
                </Link>
                <form method="get" action="/live" className="flex items-center gap-2 ml-auto">
                    <label className="sr-only" htmlFor="live-date">{t('pickDate')}</label>
                    <input id="live-date" type="date" name="date" defaultValue={page.date} className="bb-input px-3 py-1.5 text-[13px] font-bold" />
                    <button type="submit" className="bb-btn bg-card px-3 py-1.5 text-[13px]">{t('go')}</button>
                </form>
            </div>

            {page.total === 0 ? (
                <p className="text-sm font-semibold text-muted-foreground">{isLive ? t('emptyLive') : t('emptyDay')}</p>
            ) : (
                <>
                    {page.featured.length > 0 && (
                        <div className="flex flex-col gap-4">
                            <h2 className="text-lg font-extrabold tracking-tight">{t('featured')}</h2>
                            {page.featured.map((g) => <CompetitionSection key={g.competition.slug} group={g} />)}
                        </div>
                    )}
                    {page.countries.length > 0 && (
                        <div className="flex flex-col gap-3">
                            <h2 className="text-lg font-extrabold tracking-tight">{t('otherCompetitions')}</h2>
                            {page.countries.map((block) => (
                                <CountryBlock key={block.country} block={block} open={isLive} />
                            ))}
                        </div>
                    )}
                </>
            )}
        </PageShell>
    );
}
