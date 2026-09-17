import type {Metadata} from "next";
import {getFormatter, getTranslations, setRequestLocale} from "next-intl/server";
import {Link} from "@/i18n/navigation";
import {cn} from "@/components/shared/ui/cn";
import {SiteShell, Panel} from "@/components/shell/site-shell";
import {PageHeader} from "@/components/football/page-header";
import {TeamCrest} from "@/components/football/team-crest";
import {getAdviceRecord, getSchedineTally} from "@/lib/football/data/record";
import {MySchedine} from "@/components/football/my-schedine";
import {TourLauncher} from "@/components/football/tour-launcher";
import {getModelFit} from "@/lib/football/data/tuning";
import type {LegKey} from "@/lib/football/markets";

export const revalidate = 600;

const TIERS = ['safe', 'balanced', 'bold'] as const;

/** The guide's stops, in order: each a `data-tour` on the page; the ones not on the page (no slips yet, not signed in) are skipped. */
const TOUR_STEPS = ['live', 'fit', 'knobs', 'schedine', 'mine', 'latest', 'predictions'] as const;

export async function generateMetadata(): Promise<Metadata> {
    const t = await getTranslations('Pages.predictions.record');
    return {title: t('metaTitle'), description: t('metaDescription')};
}

export default async function AdviceRecordPage({params}: PageProps<"/[locale]/predictions/record">) {
    const {locale} = await params;
    setRequestLocale(locale);
    const t = await getTranslations('Pages.predictions.record');
    const tm = await getTranslations('Football.markets');
    const format = await getFormatter();
    const [record, fit, schedine] = await Promise.all([getAdviceRecord(), getModelFit(), getSchedineTally()]);
    const legLabel = (key: LegKey) => (key === 'btts' ? tm('labels.goal') : key === 'noBtts' ? tm('labels.noGoal') : key.startsWith('over') ? tm('labels.over', {line: `${key.slice(4, 5)},${key.slice(5)}`}) : key.startsWith('under') ? tm('labels.under', {line: `${key.slice(5, 6)},${key.slice(6)}`}) : key);
    const cell = (label: string, value: string, note?: string) => (
        <div className="flex flex-col items-center justify-center px-2 py-2 border-t border-muted">
            <span className="font-mono text-base font-extrabold tabular-nums">{value}</span>
            <span className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground text-center leading-tight">{label}</span>
            {note && <span className="text-[10px] font-semibold text-muted-foreground text-center leading-tight">{note}</span>}
        </div>
    );

    return (
        <SiteShell wide>
            <PageHeader title={t('title')} meta={t('intro')} aside={
                    <div className="flex items-center gap-2">
                        <TourLauncher storageKey="gibiscore:record-tour:v1" label={t('tour.button')} hint={t('tour.open')} steps={TOUR_STEPS.map((key) => ({target: key, title: t(`tour.steps.${key}.title`), text: t(`tour.steps.${key}.text`)}))} />
                        <Link data-tour="predictions" href="/predictions" className="bb-btn bg-card px-3 h-8 inline-flex items-center text-[12px] font-extrabold">{t('toPredictions')}</Link>
                    </div>
                } />

            <div data-tour="live"><Panel title={t('liveTitle')} action={record ? <span className="font-mono text-[11px] text-muted-foreground">{t('settled', {count: record.total})}</span> : undefined}>
                {!record || record.total === 0 ? (
                    <p className="px-3 py-3 text-[13px] font-semibold text-muted-foreground">{t('liveEmpty')}</p>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-3 md:divide-x divide-muted">
                        {TIERS.map((tier) => {
                            const x = record.tiers[tier];
                            return (
                                <div key={tier} className="min-w-0">
                                    <div className={cn("px-3 h-7 flex items-center justify-between text-[11px] font-extrabold uppercase tracking-wide border-b border-muted", tier === 'balanced' ? "bg-accent" : "bg-muted/40")}>
                                        <span>{tm(`advice.tiers.${tier}`)}</span>
                                        <span className="font-mono text-[10px] normal-case tracking-normal">{t('slips', {count: x.slips})}</span>
                                    </div>
                                    <div className="grid grid-cols-3">
                                        {cell(t('hitRate'), x.slips > 0 ? `${x.hitRate}%` : '–', t('hits', {hits: x.hits, slips: x.slips}))}
                                        {cell(t('promised'), x.slips > 0 ? `${x.promised}%` : '–')}
                                        {cell(t('roi'), x.roi === null ? '–' : `${x.roi > 0 ? '+' : ''}${x.roi}%`, x.priced > 0 ? t('priced', {count: x.priced}) : undefined)}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
                <p className="px-3 py-2 border-t border-muted text-[11px] font-semibold text-muted-foreground leading-snug">{t('liveHint')}</p>
            </Panel></div>

            <div data-tour="fit"><Panel title={t('fitTitle')} action={fit ? <span className="font-mono text-[11px] text-muted-foreground">{format.dateTime(new Date(fit.fittedAt), {day: '2-digit', month: '2-digit', year: 'numeric'})}</span> : undefined}>
                {!fit ? (
                    <p className="px-3 py-3 text-[13px] font-semibold text-muted-foreground">{t('fitEmpty')}</p>
                ) : (
                    <>
                        <div className="grid grid-cols-1 md:grid-cols-3 md:divide-x divide-muted">
                            {TIERS.map((tier) => {
                                const x = fit.tiers[tier];
                                return (
                                    <div key={tier} className="min-w-0">
                                        <div className={cn("px-3 h-7 flex items-center justify-between text-[11px] font-extrabold uppercase tracking-wide border-b border-muted", tier === 'balanced' ? "bg-accent" : "bg-muted/40")}>
                                            <span>{tm(`advice.tiers.${tier}`)}</span>
                                            <span className="font-mono text-[10px] normal-case tracking-normal">{t('slips', {count: x.slips})}</span>
                                        </div>
                                        <div className="grid grid-cols-2">
                                            {cell(t('hitRate'), x.slips > 0 ? `${x.hitRate}%` : '–', t('hits', {hits: x.hits, slips: x.slips}))}
                                            {cell(t('promised'), x.slips > 0 ? `${x.promised}%` : '–')}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                        <div data-tour="knobs" className="grid grid-cols-2 sm:grid-cols-5 border-t border-muted">
                            {cell(t('samples'), String(fit.samples), t('seasons', {count: fit.seasons.length}))}
                            {cell(t('goalScale'), `×${fit.tuning.goalScale.toFixed(2)}`)}
                            {cell(t('homeEdge'), `×${fit.tuning.homeEdge.toFixed(2)}`)}
                            {cell(t('rho'), fit.tuning.rho.toFixed(2))}
                            {cell(t('logLoss'), `${fit.before.toFixed(3)} → ${fit.after.toFixed(3)}`)}
                        </div>
                        <p className="px-3 py-2 border-t border-muted text-[11px] font-semibold text-muted-foreground leading-snug">{t('fitHint')}</p>
                    </>
                )}
            </Panel></div>

            <div data-tour="schedine"><Panel title={t('schedineTitle')}>
                <div className="grid grid-cols-3">
                    {cell(t('schedineSaved'), schedine ? String(schedine.total) : '–')}
                    {cell(t('schedineSettled'), schedine ? String(schedine.settled) : '–')}
                    {cell(t('schedineWon'), schedine && schedine.settled > 0 ? `${Math.round((schedine.won / schedine.settled) * 100)}%` : '–', schedine ? t('hits', {hits: schedine.won, slips: schedine.settled}) : undefined)}
                </div>
                <p className="px-3 py-2 border-t border-muted text-[11px] font-semibold text-muted-foreground leading-snug">{t('schedineHint')}</p>
            </Panel></div>
            <MySchedine />

            {record && record.latest.length > 0 && (
                <div data-tour="latest"><Panel title={t('latestTitle')}>
                    <ul className="flex flex-col divide-y divide-muted">
                        {record.latest.map((s) => (
                            <li key={`${s.fixtureId}-${s.tier}`} className="px-3 py-1.5 grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 text-[12px]">
                                <span className={cn("inline-flex items-center justify-center w-14 h-6 rounded border-2 border-foreground font-mono text-[11px] font-extrabold", s.hit ? "bg-emerald-200" : "bg-red-100")}>{s.hit ? t('won') : t('lost')}</span>
                                <span className="min-w-0 flex flex-col leading-tight">
                                    <Link href={`/matches/${s.fixtureId}`} target="_blank" rel="noopener noreferrer" className="font-extrabold truncate hover:underline decoration-accent decoration-[2px] underline-offset-2">
                                        <TeamCrest team={s.home} size={14} /> {s.home.name} {s.homeScore}-{s.awayScore} {s.away.name} <TeamCrest team={s.away} size={14} />
                                    </Link>
                                    <span className="text-[11px] font-semibold text-muted-foreground truncate">{format.dateTime(new Date(s.startingAt), {day: '2-digit', month: '2-digit'})} · {s.league} · {tm(`advice.tiers.${s.tier}`)}</span>
                                </span>
                                <span className="text-right leading-tight">
                                    <span className="block font-extrabold">{s.legs.map((l) => legLabel(l.key)).join(' + ')}</span>
                                    <span className="block font-mono text-[11px] font-bold tabular-nums text-muted-foreground">{s.pct}% · {tm('fair')} {s.fair.toFixed(2)}{s.odds !== null && ` · ${tm('book')} ${s.odds.toFixed(2)}`}</span>
                                </span>
                            </li>
                        ))}
                    </ul>
                </Panel></div>
            )}
            <p className="text-[12px] font-semibold text-muted-foreground">{t('disclaimer')}</p>
        </SiteShell>
    );
}
