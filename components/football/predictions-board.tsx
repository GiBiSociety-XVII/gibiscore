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
import {TeamCrest} from "./team-crest";
import {SchedinaDialog} from "./schedina-dialog";
import type {SchedinaCandidate} from "@/lib/football/schedina";

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
    const [schedina, setSchedina] = useState(false);
    // Everything the slip generator needs, from the blocks already on the page.
    const candidates: SchedinaCandidate[] = useMemo(() => blocks.flatMap((b) => b.fixtures.filter((f) => f.fixture.state === 'scheduled' && f.slips.length > 0).map((f) => ({fixtureId: f.fixture.id, competitionId: b.competition.id, competition: b.competition.name, home: f.fixture.home.name, away: f.fixture.away.name, startingAt: f.fixture.startingAt, day: f.day, slips: f.slips}))), [blocks]);
    const dayOptions = useMemo(() => [...new Set(candidates.map((c) => c.day))].sort().map((d) => ({day: d, label: d === today ? t('filters.today') : d === tomorrow ? t('filters.tomorrow') : format.dateTime(new Date(`${d}T12:00:00Z`), {weekday: 'short', day: 'numeric', month: 'numeric'})})), [candidates, today, tomorrow, format, t]);
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
                <div data-tour="days" role="tablist" aria-label={t('filters.days')} className="flex flex-wrap items-center gap-1">
                    {DAY_FILTERS.map((d) => (
                        <button key={d} type="button" role="tab" aria-selected={day === d} onClick={() => setDay(d)} className={cn("bb-btn h-8 px-3 text-[12px] font-extrabold", day === d ? "bg-foreground text-background" : "bg-card")}>
                            {t(`filters.${d}`)}
                        </button>
                    ))}
                </div>
                <select data-tour="competition" value={league} onChange={(e) => setLeague(e.target.value === 'all' ? 'all' : Number(e.target.value))} aria-label={t('filters.competition')} className="bb-input h-8 px-2 text-[12px] font-bold">
                    <option value="all">{t('filters.allCompetitions')}</option>
                    {blocks.map((b) => <option key={b.competition.id} value={b.competition.id}>{b.competition.country ? `${b.competition.country} · ` : ''}{b.competition.name}</option>)}
                </select>
                <span className="ml-auto font-mono text-[11px] font-bold text-muted-foreground">{t('filters.count', {count})}</span>
                <button data-tour="schedina" type="button" onClick={() => setSchedina(true)} className="bb-btn bg-accent h-8 px-3 text-[12px] font-extrabold" disabled={candidates.length === 0}>{t('schedina.open')}</button>
            </div>
            <p data-tour="legend" className="text-[12px] font-semibold text-muted-foreground leading-snug px-0.5">{t('legendShort')}</p>
            {schedina && <SchedinaDialog candidates={candidates} days={dayOptions} competitions={blocks.map((b) => ({id: b.competition.id, name: b.competition.name}))} onClose={() => setSchedina(false)} />}

            {shown.length === 0 ? (
                <p className="text-sm font-semibold text-muted-foreground">{tp('listEmpty')}</p>
            ) : (
                <div data-tour="list" className="grid gap-3 grid-cols-1 xl:grid-cols-2 items-start">
                    {shown.map((b, bi) => (
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
                                {b.fixtures.map(({fixture, prediction, slips}, fi) => {
                                    const start = new Date(fixture.startingAt);
                                    // The guide points at the first match on the page and at its three slips.
                                    const first = bi === 0 && fi === 0;
                                    return (
                                        <li key={fixture.id} data-tour={first ? 'match' : undefined} className="border-t border-muted first:border-t-0">
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
                                                    <div data-tour={first ? 'tiers' : undefined} className="mt-1.5 grid grid-cols-3 gap-1.5">
                                                        {(['safe', 'balanced', 'bold'] as const).map((tier) => {
                                                            const slip = slips.find((x) => x.tier === tier);
                                                            return (
                                                                <span key={tier} className="flex flex-col items-center gap-0.5 min-w-0" title={slip ? slip.legs.map((l) => `${legLabel(l.key)} ${l.pct}%`).join(' · ') : t('noAdvice')}>
                                                                    <span className="text-[9px] font-extrabold uppercase tracking-wide text-muted-foreground">{tm(`advice.tiers.${tier}`)}</span>
                                                                    <span className={cn("inline-flex items-center justify-center gap-1.5 w-full rounded border-2 px-1.5 h-7 text-[12px] font-extrabold leading-none min-w-0", slip ? (tier === 'balanced' ? "border-foreground bg-accent" : "border-foreground bg-card") : "border-muted bg-card text-muted-foreground")}>
                                                                        <span className="truncate">{slip ? slip.legs.map((l) => legLabel(l.key)).join(' + ') : '–'}</span>
                                                                        {slip && <span className="font-mono text-[10px] font-bold tabular-nums text-muted-foreground shrink-0">{slip.pct}%</span>}
                                                                    </span>
                                                                </span>
                                                            );
                                                        })}
                                                    </div>
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
