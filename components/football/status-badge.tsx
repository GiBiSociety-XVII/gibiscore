import {useFormatter, useTranslations} from "next-intl";
import {Badge} from "@/components/shared/ui/badge";
import type {FixtureSummary} from "@/lib/football/types";
import {LiveMinute} from "./live-minute";

/** Compact state pill: LIVE 67', INTERVALLO, FINALE, OGGI 20:45, 12 set 15:00. */
export function StatusBadge({fixture, className}: {fixture: Pick<FixtureSummary, 'state' | 'minute' | 'extraMinute' | 'syncedAt' | 'startingAt'>; className?: string}) {
    const t = useTranslations('Football.status');
    const format = useFormatter();
    const start = new Date(fixture.startingAt);

    switch (fixture.state) {
        case 'live':
            return <Badge variant="accent" className={className}>{fixture.minute !== null ? <>{t('livePrefix')} <LiveMinute fixture={fixture} fallback="" /></> : t('liveNoMinute')}</Badge>;
        case 'extra_time':
            return <Badge variant="accent" className={className}>{fixture.minute !== null ? <>{t('extraTimePrefix')} <LiveMinute fixture={fixture} fallback="" /></> : t('liveNoMinute')}</Badge>;
        case 'penalties':
            return <Badge variant="accent" className={className}>{t('penalties')}</Badge>;
        case 'half_time':
            return <Badge variant="outline" className={className}>{t('halfTime')}</Badge>;
        case 'finished':
            return <Badge variant="muted" className={className}>{t('finished')}</Badge>;
        case 'postponed':
            return <Badge variant="outline" className={className}>{t('postponed')}</Badge>;
        case 'cancelled':
            return <Badge variant="outline" className={className}>{t('cancelled')}</Badge>;
        case 'abandoned':
            return <Badge variant="outline" className={className}>{t('abandoned')}</Badge>;
        default: {
            const time = format.dateTime(start, {hour: '2-digit', minute: '2-digit'});
            const today = format.dateTime(new Date(), {day: 'numeric', month: 'numeric', year: 'numeric'}) === format.dateTime(start, {day: 'numeric', month: 'numeric', year: 'numeric'});
            return (
                <Badge variant="muted" className={className}>
                    {today ? t('today', {time}) : t('scheduled', {date: format.dateTime(start, {day: 'numeric', month: 'short'}), time})}
                </Badge>
            );
        }
    }
}
