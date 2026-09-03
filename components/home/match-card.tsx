import {useTranslations} from "next-intl";
import {Link} from "@/i18n/navigation";
import {Card} from "@/components/shared/ui/card";
import {StatusBadge} from "@/components/football/status-badge";
import type {FixtureSummary} from "@/lib/football/types";
import {TeamCrest} from "./team-crest";

export function MatchCard({fixture}: {fixture: FixtureSummary}) {
    const t = useTranslations('HomePage');
    const hasScore = fixture.homeScore !== null && fixture.awayScore !== null && fixture.state !== 'scheduled';

    return (
        <Link href={`/matches/${fixture.id}`} className="block">
            <Card press className="p-5 flex flex-col gap-4 h-full">
                <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-muted-foreground">
                        {fixture.leagueName}{fixture.round ? ` · ${t('matchday', {round: fixture.round.replace(/^Regular Season\s*-\s*/i, '')})}` : ''}
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
                            {fixture.stats.homeXg !== null && <span>{t('stats.xg', {home: fixture.stats.homeXg ?? 0, away: fixture.stats.awayXg ?? 0})}</span>}
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
        </Link>
    );
}
