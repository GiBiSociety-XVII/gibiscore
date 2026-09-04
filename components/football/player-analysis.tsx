import {useTranslations} from "next-intl";
import {cn} from "@/components/shared/ui/cn";
import {Panel} from "@/components/shell/panel";
import type {PositionBenchmark} from "@/lib/football/data/study";
import type {PlayerSeasonStat} from "@/lib/football/types";

function Bar({value, reference, higherIsBetter = true}: {value: number; reference: number; higherIsBetter?: boolean}) {
    const max = Math.max(value, reference, 0.01) * 1.15;
    const better = higherIsBetter ? value >= reference : value <= reference;
    return (
        <span className="relative block h-2 rounded bg-muted overflow-hidden">
            <span className={cn("absolute left-0 top-0 h-full rounded", better ? "bg-accent" : "bg-foreground/40")} style={{width: `${(value / max) * 100}%`}} />
            <span className="absolute top-0 h-full w-0.5 bg-foreground" style={{left: `${(reference / max) * 100}%`}} aria-hidden="true" />
        </span>
    );
}

/** Per-90 profile of the selected season against the average of the same role in that competition. */
export function PlayerAnalysis({stat, benchmark, competitionName}: {stat: PlayerSeasonStat | null; benchmark: PositionBenchmark | null; competitionName: string | null}) {
    const t = useTranslations('Football.analysis');
    const tPos = useTranslations('Football.positions');
    if (!stat || stat.minutes < 90) return null;
    const p90 = (v: number | null) => (v === null ? null : Math.round((v / (stat.minutes / 90)) * 100) / 100);
    const rows: Array<{label: string; value: number | null; ref: number | null; digits: number; suffix?: string; higher?: boolean}> = [
        {label: t('goals90'), value: p90(stat.goals), ref: benchmark?.goals90 ?? null, digits: 2},
        {label: t('assists90'), value: p90(stat.assists), ref: benchmark?.assists90 ?? null, digits: 2},
        {label: t('shots90'), value: p90(stat.shots), ref: benchmark?.shots90 ?? null, digits: 2},
        {label: t('keyPasses90'), value: p90(stat.keyPasses), ref: benchmark?.keyPasses90 ?? null, digits: 2},
        {label: t('passAccuracy'), value: stat.passAccuracy, ref: benchmark?.passAccuracy ?? null, digits: 0, suffix: '%'},
        {label: t('rating'), value: stat.rating, ref: benchmark?.rating ?? null, digits: 2},
    ];
    const conversion = stat.shots && stat.shots > 0 ? Math.round((stat.goals / stat.shots) * 100) : null;
    const minutesPerGoal = stat.goals > 0 ? Math.round(stat.minutes / stat.goals) : null;
    return (
        <Panel title={t('title')}>
            <div className="grid grid-cols-3 gap-px bg-muted">
                <div className="bg-card px-3 py-2"><span className="font-mono text-[18px] font-bold tabular-nums">{p90((stat.goals + stat.assists))?.toFixed(2)}</span><span className="block text-[10px] font-bold uppercase tracking-wide text-muted-foreground">{t('involvement90')}</span></div>
                <div className="bg-card px-3 py-2"><span className="font-mono text-[18px] font-bold tabular-nums">{conversion !== null ? `${conversion}%` : '–'}</span><span className="block text-[10px] font-bold uppercase tracking-wide text-muted-foreground">{t('conversion')}</span></div>
                <div className="bg-card px-3 py-2"><span className="font-mono text-[18px] font-bold tabular-nums">{minutesPerGoal ?? '–'}</span><span className="block text-[10px] font-bold uppercase tracking-wide text-muted-foreground">{t('minutesPerGoal')}</span></div>
            </div>
            <ul className="flex flex-col divide-y divide-muted border-t border-muted">
                {rows.map((r) => (
                    <li key={r.label} className="px-3 py-2 flex flex-col gap-1">
                        <span className="flex items-baseline justify-between text-[12px]">
                            <span className="font-bold">{r.label}</span>
                            <span className="font-mono tabular-nums">
                                <b>{r.value !== null ? `${r.value.toFixed(r.digits)}${r.suffix ?? ''}` : '–'}</b>
                                {r.ref !== null && <span className="text-muted-foreground"> · {t('avg')} {r.ref.toFixed(r.digits)}{r.suffix ?? ''}</span>}
                            </span>
                        </span>
                        {r.value !== null && r.ref !== null && <Bar value={r.value} reference={r.ref} higherIsBetter={r.higher ?? true} />}
                    </li>
                ))}
            </ul>
            <p className="px-3 py-2 text-[11px] font-semibold text-muted-foreground border-t border-muted">
                {benchmark ? t('hint', {role: tPos(benchmark.position as 'goalkeeper'), competition: competitionName ?? '', players: benchmark.players}) : t('hintNoBenchmark')}
            </p>
        </Panel>
    );
}
