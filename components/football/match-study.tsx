import {useTranslations} from "next-intl";
import {cn} from "@/components/shared/ui/cn";
import {Panel} from "@/components/shell/panel";
import type {SeasonStudy, TeamStudy} from "@/lib/football/data/study";

/** Pre-match study: season profiles of both teams side by side, league rate in the middle. */
export function MatchStudy({study, homeId, awayId}: {study: SeasonStudy | null; homeId: number; awayId: number}) {
    const t = useTranslations('Football.study');
    const home = study?.teams.find((x) => x.team.id === homeId) ?? null;
    const away = study?.teams.find((x) => x.team.id === awayId) ?? null;
    if (!study || (!home && !away)) return null;
    const per = (x: TeamStudy | null, pick: (x: TeamStudy) => number | null | undefined, digits = 2) => {
        if (!x) return '–';
        const v = pick(x);
        return v === null || v === undefined ? '–' : v.toFixed(digits);
    };
    const rows: Array<{label: string; home: string; away: string; league?: string; higherIsBetter: boolean | null}> = [
        {label: t('goalsForPerMatch'), home: per(home, (x) => x.goalsFor / x.played), away: per(away, (x) => x.goalsFor / x.played), league: (study.goalsPerMatch / 2).toFixed(2), higherIsBetter: true},
        {label: t('goalsAgainstPerMatch'), home: per(home, (x) => x.goalsAgainst / x.played), away: per(away, (x) => x.goalsAgainst / x.played), league: (study.goalsPerMatch / 2).toFixed(2), higherIsBetter: false},
        {label: t('xgFor'), home: per(home, (x) => x.xgFor), away: per(away, (x) => x.xgFor), higherIsBetter: true},
        {label: t('xgAgainst'), home: per(home, (x) => x.xgAgainst), away: per(away, (x) => x.xgAgainst), higherIsBetter: false},
        {label: t('possession'), home: home?.possession !== null && home ? `${home.possession}%` : '–', away: away?.possession !== null && away ? `${away.possession}%` : '–', higherIsBetter: true},
        {label: t('shots'), home: per(home, (x) => x.shots, 1), away: per(away, (x) => x.shots, 1), higherIsBetter: true},
        {label: t('over25'), home: home ? `${home.over25Pct}%` : '–', away: away ? `${away.over25Pct}%` : '–', league: `${study.over25Pct}%`, higherIsBetter: null},
        {label: t('btts'), home: home ? `${home.bttsPct}%` : '–', away: away ? `${away.bttsPct}%` : '–', league: `${study.bttsPct}%`, higherIsBetter: null},
        {label: t('cleanSheets'), home: home ? `${home.cleanSheets}/${home.played}` : '–', away: away ? `${away.cleanSheets}/${away.played}` : '–', higherIsBetter: null},
        {label: t('failedToScore'), home: home ? `${home.failedToScore}/${home.played}` : '–', away: away ? `${away.failedToScore}/${away.played}` : '–', higherIsBetter: null},
    ];
    const num = (v: string) => Number(v.replace('%', ''));
    const win = (r: (typeof rows)[number]): 'home' | 'away' | null => {
        if (r.higherIsBetter === null) return null;
        const h = num(r.home);
        const a = num(r.away);
        if (!Number.isFinite(h) || !Number.isFinite(a) || h === a) return null;
        return (h > a) === r.higherIsBetter ? 'home' : 'away';
    };
    return (
        <Panel title={t('matchTitle')}>
            <table className="w-full text-[13px]">
                <tbody>
                    {rows.map((r) => {
                        const w = win(r);
                        return (
                            <tr key={r.label} className="border-t border-muted first:border-t-0">
                                <td className="px-3 py-1.5 w-1/3 text-right font-mono font-extrabold tabular-nums"><span className={cn("inline-block px-1.5 rounded", w === 'home' && "bg-accent/40")}>{r.home}</span></td>
                                <td className="px-2 py-1.5 text-center whitespace-nowrap">
                                    <span className="block text-[11px] font-bold uppercase tracking-wide text-muted-foreground">{r.label}</span>
                                    {r.league && <span className="block font-mono text-[10px] text-muted-foreground">{t('leagueAvg')} {r.league}</span>}
                                </td>
                                <td className="px-3 py-1.5 w-1/3 text-left font-mono font-extrabold tabular-nums"><span className={cn("inline-block px-1.5 rounded", w === 'away' && "bg-accent/40")}>{r.away}</span></td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>
            <p className="px-3 py-2 text-[11px] font-semibold text-muted-foreground border-t border-muted">{t('matchHint')}</p>
        </Panel>
    );
}
