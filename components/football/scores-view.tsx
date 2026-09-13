import {ChevronLeft, ChevronRight} from "lucide-react";
import {getFormatter, getTranslations} from "next-intl/server";
import {Link} from "@/i18n/navigation";
import {cn} from "@/components/shared/ui/cn";
import {shiftDay, type ScoresPage} from "@/lib/football/data/scores";
import {AutoRefresh} from "./auto-refresh";
import {DatePicker} from "./date-picker";
import {LiveScores} from "./live-scores";

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
    const labels = {all: t('filters.all'), live: t('filters.live'), finished: t('filters.finished'), scheduled: t('filters.scheduled')};
    // The rows move on their own (LiveScores polls); the rest of the page (date strip, rail) follows every two minutes.
    const refresh = isLive || (page.date === page.today && page.liveCount + page.scheduledCount > 0);
    return (
        <div className="bb-surface overflow-hidden">
            <AutoRefresh seconds={120} enabled={refresh} />
            <DateStrip page={page} />
            <div className="p-1.5 md:p-2 flex flex-col gap-2">
                <LiveScores page={page} labels={labels} emptyText={isLive ? t('emptyLive') : t('emptyDay')} favoritesLabel={t('favoritesGroup')} />
            </div>
        </div>
    );
}
