import {useFormatter, useTranslations} from "next-intl";
import {Badge} from "@/components/shared/ui/badge";
import {Card} from "@/components/shared/ui/card";
import type {FixtureSummary} from "@/lib/football/types";
import {TeamCrest} from "./team-crest";

function StatusBadge({fixture}: {fixture: FixtureSummary}) {
    const t = useTranslations('HomePage.status');
    const format = useFormatter();
    const start = new Date(fixture.startingAt);

    switch (fixture.state) {
        case 'live':
        case 'extra_time':
        case 'penalties':
            return <Badge variant="accent">{t('live', {minute: fixture.minute ?? 0})}</Badge>;
        case 'half_time':
            return <Badge variant="outline">{t('halfTime')}</Badge>;
        case 'finished':
            return <Badge variant="muted">{t('finished')}</Badge>;
        default: {
            const time = format.dateTime(start, {hour: '2-digit', minute: '2-digit'});
            const isToday = start.toDateString() === new Date().toDateString();
            return (
                <Badge variant="muted">
                    {isToday
                        ? t('today', {time})
                        : t('scheduled', {date: format.dateTime(start, {day: 'numeric', month: 'short'}), time})}
                </Badge>
            );
        }
    }
}

export function MatchCard({fixture}: {fixture: FixtureSummary}) {
    const t = useTranslations('HomePage');
    const hasScore = fixture.homeScore !== null && fixture.awayScore !== null;

    return (
        <Card press className="p-5 flex flex-col gap-4">
            <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-muted-foreground">
                    {fixture.leagueName}{fixture.round ? ` · ${t('matchday', {round: fixture.round})}` : ''}
                </span>
                <StatusBadge fixture={fixture} />
            </div>

            <div className="flex items-center justify-between gap-3">
                <div className="flex flex-col items-center gap-2 flex-1 min-w-0">
                    <TeamCrest team={fixture.home} />
                    <span className="font-extrabold text-[15px] truncate max-w-full">{fixture.home.name}</span>
                </div>
                <div className="font-mono text-[40px] font-bold tracking-tight tabular-nums">
                    {hasScore ? (
                        <>{fixture.homeScore} – {fixture.awayScore}</>
                    ) : (
                        <span className="text-muted-foreground">vs</span>
                    )}
                </div>
                <div className="flex flex-col items-center gap-2 flex-1 min-w-0">
                    <TeamCrest team={fixture.away} />
                    <span className="font-extrabold text-[15px] truncate max-w-full">{fixture.away.name}</span>
                </div>
            </div>

            <div className="flex justify-between gap-2 text-[13px] font-semibold text-muted-foreground border-t-2 border-muted pt-3">
                {fixture.stats ? (
                    <>
                        <span>{t('stats.possession', {value: fixture.stats.homePossession ?? 0})}</span>
                        <span>{t('stats.shots', {home: fixture.stats.homeShots ?? 0, away: fixture.stats.awayShots ?? 0})}</span>
                        <span>{t('stats.xg', {home: fixture.stats.homeXg ?? 0, away: fixture.stats.awayXg ?? 0})}</span>
                    </>
                ) : fixture.form ? (
                    <>
                        <span>{t('stats.form', {form: fixture.form.home ?? '–'})}</span>
                        <span>{t('stats.form', {form: fixture.form.away ?? '–'})}</span>
                    </>
                ) : (
                    <span>&nbsp;</span>
                )}
            </div>
        </Card>
    );
}
