import {useTranslations} from "next-intl";
import {Card} from "@/components/shared/ui/card";
import type {TeamMatchStats} from "@/lib/football/types";

const ROWS: Array<{key: keyof TeamMatchStats; percent?: boolean; decimals?: number}> = [
    {key: 'possession', percent: true},
    {key: 'xg', decimals: 2},
    {key: 'shotsTotal'},
    {key: 'shotsOnTarget'},
    {key: 'corners'},
    {key: 'fouls'},
    {key: 'passesTotal'},
    {key: 'passAccuracy', percent: true},
    {key: 'yellowCards'},
    {key: 'redCards'},
];

function fmt(v: number | null, percent?: boolean, decimals?: number): string {
    if (v === null) return '–';
    const n = decimals !== undefined ? v.toFixed(decimals) : String(Math.round(v * 10) / 10);
    return percent ? `${n}%` : n;
}

export function TeamStats({home, away, title}: {home: TeamMatchStats | null; away: TeamMatchStats | null; title: string}) {
    const t = useTranslations('Football.stats');
    const tEmpty = useTranslations('Football.empty');
    const rows = ROWS.filter((r) => (home?.[r.key] ?? null) !== null || (away?.[r.key] ?? null) !== null);

    return (
        <Card className="p-4 md:p-6 flex flex-col gap-4">
            <h2 className="text-[22px] font-extrabold tracking-tight">{title}</h2>
            {rows.length === 0 ? (
                <p className="text-sm font-semibold text-muted-foreground">{tEmpty('noStats')}</p>
            ) : (
                <div className="flex flex-col gap-3">
                    {rows.map(({key, percent, decimals}) => {
                        const h = home?.[key] ?? 0;
                        const a = away?.[key] ?? 0;
                        const total = h + a || 1;
                        return (
                            <div key={key} className="flex flex-col gap-1">
                                <div className="flex items-center justify-between text-sm font-bold">
                                    <span className="font-mono tabular-nums">{fmt(home?.[key] ?? null, percent, decimals)}</span>
                                    <span className="text-xs font-extrabold uppercase tracking-wide text-muted-foreground">{t(key)}</span>
                                    <span className="font-mono tabular-nums">{fmt(away?.[key] ?? null, percent, decimals)}</span>
                                </div>
                                <div className="flex gap-1 h-2.5 rounded-full overflow-hidden border-2 border-foreground">
                                    <div className="bg-accent" style={{width: `${(h / total) * 100}%`}} />
                                    <div className="bg-foreground" style={{width: `${(a / total) * 100}%`}} />
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </Card>
    );
}
