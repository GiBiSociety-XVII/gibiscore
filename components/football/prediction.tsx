import {useTranslations} from "next-intl";
import {cn} from "@/components/shared/ui/cn";
import {Panel} from "@/components/shell/panel";
import type {MatchPrediction, PredictionFactor} from "@/lib/football/prediction";
import type {TeamSummary} from "@/lib/football/types";

/** 1-X-2 probabilities as one segmented bar. */
export function OutcomeBar({prediction, className, labels = true}: {prediction: MatchPrediction; className?: string; labels?: boolean}) {
    const t = useTranslations('Football.prediction');
    const cells: Array<{key: '1' | 'X' | '2'; pct: number; label: string}> = [
        {key: '1', pct: prediction.home, label: t('home')},
        {key: 'X', pct: prediction.draw, label: t('draw')},
        {key: '2', pct: prediction.away, label: t('away')},
    ];
    return (
        <div className={cn("flex w-full h-6 rounded overflow-hidden border-2 border-foreground font-mono text-[11px] font-extrabold tabular-nums", className)} role="img" aria-label={`1 ${prediction.home}% · X ${prediction.draw}% · 2 ${prediction.away}%`}>
            {cells.map((c) => (
                <span
                    key={c.key}
                    style={{width: `${c.pct}%`}}
                    className={cn("flex items-center justify-center whitespace-nowrap overflow-hidden border-r-2 border-foreground last:border-r-0", c.key === prediction.pick ? "bg-accent text-foreground" : c.key === 'X' ? "bg-muted" : "bg-card")}
                >
                    {c.pct >= 12 && (labels ? `${c.label} ${c.pct}%` : `${c.pct}%`)}
                </span>
            ))}
        </div>
    );
}

function FactorLine({factor, home, away}: {factor: PredictionFactor; home: TeamSummary; away: TeamSummary}) {
    const t = useTranslations('Football.prediction.factors');
    const winner = factor.side === 'away' ? away.name : home.name;
    const loser = factor.side === 'away' ? home.name : away.name;
    const v = factor.values;
    const winnerValue = factor.side === 'away' ? v.away : v.home;
    const loserValue = factor.side === 'away' ? v.home : v.away;
    if (factor.key === 'homeAdvantage') return <li>{factor.side === 'none' ? t('homeAdvantageNone') : t('homeAdvantage', {homeWins: v.homeWins, draws: v.draws, awayWins: v.awayWins})}</li>;
    if (factor.key === 'sample') return <li>{t('sample', {matches: v.matches})}</li>;
    return <li>{t(factor.key, {winner, loser, winnerValue, loserValue, league: v.league ?? ''})}</li>;
}

/** Full pre-match panel: outcome bar, expected goals, over/under, likely scores and reasons. */
export function PredictionPanel({prediction, home, away, title}: {prediction: MatchPrediction | null; home: TeamSummary; away: TeamSummary; title?: string}) {
    const t = useTranslations('Football.prediction');
    if (!prediction) return null;
    const stat = (label: string, value: string, highlight = false) => (
        <div key={label} className="flex flex-col items-center justify-center px-2 py-1.5 border-t border-muted">
            <span className={cn("font-mono text-base font-extrabold tabular-nums px-1 rounded", highlight && "bg-accent/40")}>{value}</span>
            <span className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground text-center leading-tight">{label}</span>
        </div>
    );
    return (
        <Panel title={title ?? t('preTitle')} action={<span className="text-[11px] font-bold text-muted-foreground">{t(`confidence.${prediction.confidence}`)}</span>}>
            <div className="px-3 pt-2.5 pb-2">
                <div className="flex justify-between text-[11px] font-extrabold mb-1">
                    <span className="truncate">{home.name}</span>
                    <span className="truncate text-right">{away.name}</span>
                </div>
                <OutcomeBar prediction={prediction} />
                <div className="mt-1.5 text-[11px] font-semibold text-muted-foreground text-center">
                    {t('pick')}: <span className="font-mono font-extrabold text-foreground bg-accent px-1 rounded">{prediction.pick}</span> · {t('sample', {count: prediction.sample})}
                </div>
            </div>
            <div className="grid grid-cols-3 sm:grid-cols-6">
                {stat(`${t('expectedGoals')} ${home.shortCode ?? ''}`.trim(), prediction.lambda.home.toFixed(2))}
                {stat(`${t('expectedGoals')} ${away.shortCode ?? ''}`.trim(), prediction.lambda.away.toFixed(2))}
                {stat(t('over15'), `${prediction.over15}%`)}
                {stat(t('over25'), `${prediction.over25}%`, prediction.over25 >= 50)}
                {stat(t('over35'), `${prediction.over35}%`)}
                {stat(t('btts'), `${prediction.btts}%`, prediction.btts >= 50)}
            </div>
            <div className="border-t border-muted px-3 py-2">
                <span className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">{t('likelyScores')}</span>
                <ul className="flex flex-wrap gap-1.5 mt-1">
                    {prediction.scores.map((s, i) => (
                        <li key={`${s.home}-${s.away}`} className={cn("inline-flex items-center gap-1.5 px-2 h-7 rounded border-2 border-foreground font-mono text-[12px] font-extrabold tabular-nums", i === 0 ? "bg-accent" : "bg-card")}>
                            {s.home}-{s.away}
                            <span className="text-[10px] text-muted-foreground">{s.pct.toFixed(1)}%</span>
                        </li>
                    ))}
                </ul>
            </div>
            {prediction.factors.length > 0 && (
                <div className="border-t border-muted px-3 py-2">
                    <span className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">{t('why')}</span>
                    <ul className="mt-1 flex flex-col gap-1 text-[12px] font-semibold leading-snug list-disc pl-4">
                        {prediction.factors.map((f) => <FactorLine key={f.key} factor={f} home={home} away={away} />)}
                    </ul>
                </div>
            )}
            <p className="px-3 py-2 text-[11px] font-semibold text-muted-foreground border-t border-muted">{t('hint')}</p>
        </Panel>
    );
}
