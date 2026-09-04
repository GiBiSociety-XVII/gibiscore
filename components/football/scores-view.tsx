import {ChevronLeft, ChevronRight} from "lucide-react";
import {getFormatter, getTranslations} from "next-intl/server";
import {Link} from "@/i18n/navigation";
import {cn} from "@/components/shared/ui/cn";
import {shiftDay, type ScoresPage} from "@/lib/football/data/scores";
import {CompetitionBlock} from "./competition-block";
import {DatePicker} from "./date-picker";
import {ScoreFilters} from "./score-filters";

function dayHref(day: string, today: string): string {
    return day === today ? '/' : `/scores/${day}`;
}

/** Date strip: previous, five days around the shown one, next, calendar, live toggle. */
async function DateStrip({page}: {page: ScoresPage}) {
    const t = await getTranslations('Pages.scores');
    const format = await getFormatter();
    const days = [-2, -1, 0, 1, 2].map((d) => shiftDay(page.date, d));
    const label = (day: string) => {
        if (day === page.today) return t('today');
        if (day === shiftDay(page.today, -1)) return t('yesterday');
        if (day === shiftDay(page.today, 1)) return t('tomorrow');
        return format.dateTime(new Date(`${day}T12:00:00Z`), {weekday: 'short', day: 'numeric', month: 'numeric'});
    };
    const isLive = page.mode === 'live';
    return (
        <div className="flex items-center gap-1 px-1.5 h-10 border-b-2 border-foreground bg-card">
            <Link href={dayHref(shiftDay(page.date, -1), page.today)} aria-label={t('previousDay')} className="inline-flex w-7 h-7 items-center justify-center rounded-md hover:bg-muted">
                <ChevronLeft className="w-4 h-4" />
            </Link>
            <div className="flex-1 flex items-center gap-0.5 overflow-x-auto [scrollbar-width:none]">
                {days.map((day) => {
                    const active = !isLive && day === page.date;
                    const outer = day === days[0] || day === days[days.length - 1];
                    return (
                        <Link
                            key={day}
                            href={dayHref(day, page.today)}
                            aria-current={active ? 'date' : undefined}
                            className={cn(
                                "h-7 px-2 items-center rounded-md text-xs font-extrabold whitespace-nowrap capitalize",
                                outer ? "hidden sm:inline-flex" : "inline-flex",
                                active ? "bg-foreground text-background" : "hover:bg-muted text-foreground/80",
                                day === page.today && !active && "text-foreground underline decoration-accent decoration-[3px] underline-offset-2",
                            )}
                        >
                            {label(day)}
                        </Link>
                    );
                })}
            </div>
            <Link href={dayHref(shiftDay(page.date, 1), page.today)} aria-label={t('nextDay')} className="inline-flex w-7 h-7 items-center justify-center rounded-md hover:bg-muted">
                <ChevronRight className="w-4 h-4" />
            </Link>
            <DatePicker value={page.date} today={page.today} label={t('pickDate')} />
            <Link
                href="/live"
                className={cn("inline-flex items-center gap-1.5 h-7 px-2.5 rounded-md border-2 border-foreground text-xs font-extrabold whitespace-nowrap", isLive ? "bg-accent" : "bg-card hover:bg-accent/40")}
            >
                <span className={cn("w-1.5 h-1.5 rounded-full", page.liveCount > 0 ? "bg-foreground" : "bg-muted-foreground")} aria-hidden="true" />
                LIVE{page.liveCount > 0 ? ` ${page.liveCount}` : ''}
            </Link>
        </div>
    );
}

/** The scores list of a day (or of the matches in play): the core of the site. */
export async function ScoresView({page}: {page: ScoresPage}) {
    const t = await getTranslations('Pages.scores');
    const isLive = page.mode === 'live';
    const counts = {all: page.total, live: page.liveCount, finished: page.finishedCount, scheduled: page.scheduledCount};
    const labels = {all: t('filters.all'), live: t('filters.live'), finished: t('filters.finished'), scheduled: t('filters.scheduled')};

    return (
        <div className="bb-surface overflow-hidden">
            <DateStrip page={page} />
            <div className="p-1.5 md:p-2 flex flex-col gap-2">
                {isLive ? (
                    <p className="text-xs font-bold text-muted-foreground px-1">{t('liveHint', {count: page.liveCount})}</p>
                ) : (
                    <ScoreFilters counts={counts} labels={labels}>
                        <ScoresList page={page} emptyText={t('emptyDay')} />
                    </ScoreFilters>
                )}
                {isLive && <ScoresList page={page} emptyText={t('emptyLive')} />}
            </div>
        </div>
    );
}

function ScoresList({page, emptyText}: {page: ScoresPage; emptyText: string}) {
    if (page.total === 0) return <p className="px-2 py-6 text-center text-[13px] font-semibold text-muted-foreground">{emptyText}</p>;
    return (
        <div className="flex flex-col gap-2">
            {page.pinned.length > 0 && (
                <div data-group className="border-2 border-foreground rounded-lg overflow-hidden">
                    {page.pinned.map((g) => <CompetitionBlock key={g.competition.slug} group={g} />)}
                </div>
            )}
            {page.countries.map((c) => (
                <div key={c.country} data-group className="border-2 border-foreground/30 rounded-lg overflow-hidden">
                    {c.competitions.map((g) => <CompetitionBlock key={g.competition.slug} group={g} />)}
                </div>
            ))}
            <p data-empty className="hidden px-2 py-6 text-center text-[13px] font-semibold text-muted-foreground">{emptyText}</p>
        </div>
    );
}
