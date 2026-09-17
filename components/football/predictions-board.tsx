'use client';

import Image from "next/image";
import {useMemo, useState} from "react";
import {useFormatter, useTranslations} from "next-intl";
import {Link} from "@/i18n/navigation";
import {cn} from "@/components/shared/ui/cn";
import {Panel} from "@/components/shell/panel";
import type {BetSuggestion, LegKey} from "@/lib/football/markets";
import type {MatchPrediction} from "@/lib/football/prediction";
import type {CompetitionSummary, FixtureSummary} from "@/lib/football/types";
import {Flag} from "./flag";
import {OutcomeBar} from "./prediction";
import {TeamCrest} from "./team-crest";

export interface BoardFixture {
    fixture: FixtureSummary;
    prediction: MatchPrediction | null;
    /** The model's slips, one per tier of risk, as the match page proposes them. */
    slips: BetSuggestion[];
    /** The day of kick-off in Rome, YYYY-MM-DD. */
    day: string;
}

export interface BoardBlock {
    competition: CompetitionSummary;
    fixtures: BoardFixture[];
}

type DayFilter = 'today' | 'tomorrow' | 'both' | 'all';
const DAY_FILTERS: DayFilter[] = ['today', 'tomorrow', 'both', 'all'];

/**
 * The upcoming matches with the model's reading, filtered on the
 * client: which days, which competition. Every block is in the page
 * already; the filters only hide, so the page stays static.
 */
export function PredictionsBoard({blocks, today, tomorrow}: {blocks: BoardBlock[]; today: string; tomorrow: string}) {
    const t = useTranslations('Pages.predictions');
    const tp = useTranslations('Football.prediction');
    const tm = useTranslations('Football.markets');
    const format = useFormatter();
    const [day, setDay] = useState<DayFilter>('all');
    const [league, setLeague] = useState<number | 'all'>('all');
    const legLabel = (key: LegKey) => (key === 'btts' ? tm('labels.goal') : key === 'noBtts' ? tm('labels.noGoal') : key.startsWith('over') ? tm('labels.over', {line: `${key.slice(4, 5)},${key.slice(5)}`}) : key.startsWith('under') ? tm('labels.under', {line: `${key.slice(5, 6)},${key.slice(6)}`}) : key);
    const inDay = (d: string) => (day === 'all' ? true : day === 'today' ? d === today : day === 'tomorrow' ? d === tomorrow : d === today || d === tomorrow);
    const shown = useMemo(
        () => blocks.map((b) => ({...b, fixtures: b.fixtures.filter((f) => inDay(f.day))})).filter((b) => b.fixtures.length > 0 && (league === 'all' || b.competition.id === league)),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [blocks, day, league, today, tomorrow],
    );
    const count = shown.reduce((s, b) => s + b.fixtures.length, 0);

    return (
        <div className="flex flex-col gap-3">
            <div className="bb-surface px-3 py-2 flex flex-wrap items-center gap-2">
                <div role="tablist" aria-label={t('filters.days')} className="flex flex-wrap items-center gap-1">
                    {DAY_FILTERS.map((d) => (
                        <button key={d} type="button" role="tab" aria-selected={day === d} onClick={() => setDay(d)} className={cn("bb-btn h-8 px-3 text-[12px] font-extrabold", day === d ? "bg-foreground text-background" : "bg-card")}>
                            {t(`filters.${d}`)}
                        </button>
                    ))}
                </div>
                <select value={league} onChange={(e) => setLeague(e.target.value === 'all' ? 'all' : Number(e.target.value))} aria-label={t('filters.competition')} className="bb-input h-8 px-2 text-[12px] font-bold">
                    <option value="all">{t('filters.allCompetitions')}</option>
                    {blocks.map((b) => <option key={b.competition.id} value={b.competition.id}>{b.competition.country ? `${b.competition.country} · ` : ''}{b.competition.name}</option>)}
                </select>
                <span className="ml-auto font-mono text-[11px] font-bold text-muted-foreground">{t('filters.count', {count})}</span>
            </div>

            {shown.length === 0 ? (
                <p className="text-sm font-semibold text-muted-foreground">{tp('listEmpty')}</p>
            ) : (
                <div className="grid gap-3 grid-cols-1 xl:grid-cols-2 items-start">
                    {shown.map((b) => (
                        <Panel
                            key={b.competition.id}
                            title={
                                <Link href={`/competitions/${b.competition.slug}`} className="inline-flex items-center gap-2 hover:underline decoration-accent decoration-[2px] underline-offset-2">
                                    {b.competition.logoUrl ? <Image src={b.competition.logoUrl} alt="" width={16} height={16} unoptimized className="object-contain" /> : <Flag code={b.competition.countryCode} size={16} />}
                                    {b.competition.country ? `${b.competition.country} · ` : ''}{b.competition.name}
                                </Link>
                            }
                            action={<span className="font-mono text-[11px] text-muted-foreground">{b.fixtures.length}</span>}
                        >
                            <ul className="flex flex-col">
                                {b.fixtures.map(({fixture, prediction, slips}) => {
                                    const start = new Date(fixture.startingAt);
                                    return (
                                        <li key={fixture.id} className="border-t border-muted first:border-t-0">
                                            <Link href={`/matches/${fixture.id}`} target="_blank" rel="noopener noreferrer" className="block px-3 py-2 hover:bg-muted/50">
                                                <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2">
                                                    <span className="flex items-center justify-end gap-2 min-w-0 text-[13px] font-extrabold">
                                                        <span className={cn("truncate", prediction?.pick === '1' && "underline decoration-accent decoration-[3px] underline-offset-2")}>{fixture.home.name}</span>
                                                        <TeamCrest team={fixture.home} size={20} />
                                                    </span>
                                                    <span className="flex flex-col items-center leading-tight">
                                                        <span className="font-mono text-[12px] font-bold">{format.dateTime(start, {hour: '2-digit', minute: '2-digit'})}</span>
                                                        <span className="text-[10px] font-semibold text-muted-foreground uppercase">{format.dateTime(start, {weekday: 'short', day: 'numeric'})}</span>
                                                    </span>
                                                    <span className="flex items-center gap-2 min-w-0 text-[13px] font-extrabold">
                                                        <TeamCrest team={fixture.away} size={20} />
                                                        <span className={cn("truncate", prediction?.pick === '2' && "underline decoration-accent decoration-[3px] underline-offset-2")}>{fixture.away.name}</span>
                                                    </span>
                                                </div>
                                                {prediction ? (
                                                    <>
                                                        <div className="mt-1.5 flex items-center gap-3">
                                                            <OutcomeBar prediction={prediction} className="h-5 flex-1" />
                                                            <span className="font-mono text-[11px] font-bold text-muted-foreground whitespace-nowrap tabular-nums">
                                                                xG {prediction.lambda.home.toFixed(1)}-{prediction.lambda.away.toFixed(1)} · O2,5 {prediction.over25}%
                                                            </span>
                                                        </div>
                                                        {slips.length > 0 && (
                                                            <div className="mt-1.5 grid grid-cols-3 gap-1">
                                                                {slips.map((s) => (
                                                                    <span key={s.tier} className={cn("flex flex-col rounded border px-1.5 py-1 leading-tight min-w-0", s.tier === 'balanced' ? "border-foreground bg-accent" : "border-foreground/30 bg-card")} title={s.legs.map((l) => `${legLabel(l.key)} ${l.pct}%`).join(' · ')}>
                                                                        <span className="text-[9px] font-extrabold uppercase tracking-wide text-muted-foreground">{tm(`advice.tiers.${s.tier}`)}</span>
                                                                        <span className="text-[12px] font-extrabold truncate">{s.legs.map((l) => legLabel(l.key)).join(' + ')}</span>
                                                                        <span className="font-mono text-[10px] font-bold tabular-nums text-muted-foreground leading-tight">{s.pct}% · {tm('fair')} {s.fair.toFixed(2)}{s.odds !== null && ` · ${tm('book')} ${s.legs.length > 1 ? '≈' : ''}${s.odds.toFixed(2)}`}</span>
                                                                    </span>
                                                                ))}
                                                            </div>
                                                        )}
                                                    </>
                                                ) : (
                                                    <p className="mt-1 text-[11px] font-semibold text-muted-foreground">{tp('empty')}</p>
                                                )}
                                            </Link>
                                        </li>
                                    );
                                })}
                            </ul>
                        </Panel>
                    ))}
                </div>
            )}
        </div>
    );
}
