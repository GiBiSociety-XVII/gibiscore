import {useTranslations} from "next-intl";
import {Link} from "@/i18n/navigation";
import {cn} from "@/components/shared/ui/cn";
import {Panel} from "@/components/shell/panel";
import type {SeasonStudy, SplitRow} from "@/lib/football/data/study";
import {TeamCrest} from "./team-crest";

function Tile({value, label}: {value: string | number; label: string}) {
    return (
        <div className="bg-card px-3 py-2.5 flex flex-col gap-0.5">
            <span className="font-mono text-[20px] font-bold leading-none tabular-nums">{value}</span>
            <span className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">{label}</span>
        </div>
    );
}

function FormDots({form}: {form: Array<'W' | 'D' | 'L'>}) {
    return (
        <span className="inline-flex gap-0.5">
            {form.map((r, i) => (
                <span key={i} className={cn("inline-flex w-4 h-4 items-center justify-center rounded text-[9px] font-extrabold", r === 'W' && "bg-accent", r === 'D' && "bg-muted", r === 'L' && "bg-foreground text-background")}>
                    {r === 'W' ? 'V' : r === 'D' ? 'N' : 'P'}
                </span>
            ))}
        </span>
    );
}

function SplitTable({rows, title}: {rows: SplitRow[]; title: string}) {
    const t = useTranslations('Football.table');
    return (
        <Panel title={title}>
            <table className="w-full text-[13px]">
                <thead>
                    <tr className="text-muted-foreground text-[10px] font-extrabold tracking-wider uppercase">
                        <th className="px-1 py-1 w-7 text-left">#</th>
                        <th className="px-1 py-1 text-left">{t('team')}</th>
                        {(['played', 'won', 'drawn', 'lost', 'goalsFor', 'goalsAgainst', 'points'] as const).map((k) => <th key={k} className="px-1 py-1 text-right font-mono">{t(k)}</th>)}
                    </tr>
                </thead>
                <tbody>
                    {rows.map((r, i) => (
                        <tr key={r.team.id} className="border-t border-muted">
                            <td className="px-1 py-1 font-mono text-[11px] font-bold text-muted-foreground">{i + 1}</td>
                            <td className="px-1 py-1 font-bold">
                                <Link href={`/teams/${r.team.slug}`} className="inline-flex items-center gap-1.5 hover:underline decoration-accent decoration-[3px] underline-offset-2"><TeamCrest team={r.team} size={16} />{r.team.name}</Link>
                            </td>
                            <td className="px-1 py-1 text-right font-mono tabular-nums">{r.played}</td>
                            <td className="px-1 py-1 text-right font-mono tabular-nums">{r.won}</td>
                            <td className="px-1 py-1 text-right font-mono tabular-nums">{r.drawn}</td>
                            <td className="px-1 py-1 text-right font-mono tabular-nums">{r.lost}</td>
                            <td className="px-1 py-1 text-right font-mono tabular-nums">{r.goalsFor}</td>
                            <td className="px-1 py-1 text-right font-mono tabular-nums">{r.goalsAgainst}</td>
                            <td className="px-1 py-1 text-right font-mono tabular-nums font-extrabold">{r.points}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </Panel>
    );
}

/** Competition "Statistiche" tab: league rates, one line per team, home and away tables. */
export function SeasonStudyView({study}: {study: SeasonStudy | null}) {
    const t = useTranslations('Football.study');
    if (!study) return <p className="text-sm font-semibold text-muted-foreground">{t('empty')}</p>;
    const hasXg = study.teams.some((x) => x.xgFor !== null);
    const hasStats = study.teams.some((x) => x.withStats > 0);
    return (
        <div className="flex flex-col gap-3">
            <Panel title={t('leagueTitle')}>
                <dl className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-7 gap-px bg-muted">
                    <Tile value={study.played} label={t('played')} />
                    <Tile value={study.goalsPerMatch.toFixed(2)} label={t('goalsPerMatch')} />
                    <Tile value={`${study.homeWinPct}%`} label={t('homeWins')} />
                    <Tile value={`${study.drawPct}%`} label={t('draws')} />
                    <Tile value={`${study.awayWinPct}%`} label={t('awayWins')} />
                    <Tile value={`${study.over25Pct}%`} label={t('over25')} />
                    <Tile value={`${study.bttsPct}%`} label={t('btts')} />
                </dl>
            </Panel>

            <Panel title={t('teamsTitle')}>
                <div className="overflow-x-auto">
                    <table className="w-full text-[13px]">
                        <thead>
                            <tr className="text-muted-foreground text-[10px] font-extrabold tracking-wider uppercase">
                                <th className="px-1 py-1 text-left">{t('team')}</th>
                                <th className="px-1 py-1 text-right font-mono">{t('pg')}</th>
                                <th className="px-1 py-1 text-right font-mono">{t('gf')}</th>
                                <th className="px-1 py-1 text-right font-mono">{t('ga')}</th>
                                {hasXg && <th className="px-1 py-1 text-right font-mono">{t('xgFor')}</th>}
                                {hasXg && <th className="px-1 py-1 text-right font-mono">{t('xgAgainst')}</th>}
                                {hasStats && <th className="px-1 py-1 text-right font-mono hidden md:table-cell">{t('possession')}</th>}
                                {hasStats && <th className="px-1 py-1 text-right font-mono hidden md:table-cell">{t('shots')}</th>}
                                {hasStats && <th className="px-1 py-1 text-right font-mono hidden lg:table-cell">{t('shotsOn')}</th>}
                                <th className="px-1 py-1 text-right font-mono">{t('over25Short')}</th>
                                <th className="px-1 py-1 text-right font-mono">{t('bttsShort')}</th>
                                <th className="px-1 py-1 text-right font-mono hidden md:table-cell">{t('cleanSheets')}</th>
                                <th className="px-1 py-1 text-right hidden lg:table-cell">{t('form')}</th>
                            </tr>
                        </thead>
                        <tbody>
                            {study.teams.map((x) => (
                                <tr key={x.team.id} className="border-t border-muted">
                                    <td className="px-1 py-1 font-bold">
                                        <Link href={`/teams/${x.team.slug}`} className="inline-flex items-center gap-1.5 hover:underline decoration-accent decoration-[3px] underline-offset-2"><TeamCrest team={x.team} size={16} /><span className="truncate">{x.team.name}</span></Link>
                                    </td>
                                    <td className="px-1 py-1 text-right font-mono tabular-nums">{x.played}</td>
                                    <td className="px-1 py-1 text-right font-mono tabular-nums">{(x.goalsFor / x.played).toFixed(2)}</td>
                                    <td className="px-1 py-1 text-right font-mono tabular-nums">{(x.goalsAgainst / x.played).toFixed(2)}</td>
                                    {hasXg && <td className="px-1 py-1 text-right font-mono tabular-nums">{x.xgFor?.toFixed(2) ?? '–'}</td>}
                                    {hasXg && <td className="px-1 py-1 text-right font-mono tabular-nums">{x.xgAgainst?.toFixed(2) ?? '–'}</td>}
                                    {hasStats && <td className="px-1 py-1 text-right font-mono tabular-nums hidden md:table-cell">{x.possession !== null ? `${x.possession}%` : '–'}</td>}
                                    {hasStats && <td className="px-1 py-1 text-right font-mono tabular-nums hidden md:table-cell">{x.shots ?? '–'}</td>}
                                    {hasStats && <td className="px-1 py-1 text-right font-mono tabular-nums hidden lg:table-cell">{x.shotsOnTarget ?? '–'}</td>}
                                    <td className="px-1 py-1 text-right font-mono tabular-nums">{x.over25Pct}%</td>
                                    <td className="px-1 py-1 text-right font-mono tabular-nums">{x.bttsPct}%</td>
                                    <td className="px-1 py-1 text-right font-mono tabular-nums hidden md:table-cell">{x.cleanSheets}</td>
                                    <td className="px-1 py-1 text-right hidden lg:table-cell"><FormDots form={x.form} /></td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
                <p className="px-3 py-2 text-[11px] font-semibold text-muted-foreground border-t border-muted">{t('teamsHint')}</p>
            </Panel>

            <div className="grid gap-3 grid-cols-1 xl:grid-cols-2 items-start">
                <SplitTable rows={study.home} title={t('homeTable')} />
                <SplitTable rows={study.away} title={t('awayTable')} />
            </div>
        </div>
    );
}
