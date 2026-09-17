'use client';

import {useEffect, useState} from "react";
import {useFormatter, useTranslations} from "next-intl";
import {Link} from "@/i18n/navigation";
import {cn} from "@/components/shared/ui/cn";
import {Panel} from "@/components/shell/panel";
import {createClient} from "@/lib/db/client";
import type {LegKey} from "@/lib/football/markets";

interface Row {
    id: number;
    kind: 'single' | 'multiple' | 'system';
    risk: 'low' | 'medium' | 'high';
    size: number;
    system_of: number | null;
    selections: Array<{fixtureId: number; home: string; away: string; competition: string; startingAt: string; tier: 'safe' | 'balanced' | 'bold'; banker?: boolean; legs: Array<{key: LegKey; pct: number}>; pct: number}>;
    pct: number;
    fair: number | string;
    book: number | string | null;
    last_kickoff: string;
    created_at: string;
    hits: number | null;
    hit: boolean | null;
}

/** The slips the signed-in user saved, latest first, won or lost once their matches are over. Read in the browser: the page stays static. */
export function MySchedine() {
    const t = useTranslations('Pages.predictions.mine');
    const ts = useTranslations('Pages.predictions.schedina');
    const tm = useTranslations('Football.markets');
    const format = useFormatter();
    const [rows, setRows] = useState<Row[] | null | undefined>(undefined);
    useEffect(() => {
        let alive = true;
        let supabase: ReturnType<typeof createClient>;
        try {
            supabase = createClient();
        } catch {
            queueMicrotask(() => setRows(null));
            return;
        }
        supabase.auth.getUser().then(({data}) => {
            if (!alive) return;
            if (!data.user) { setRows(null); return; }
            Promise.resolve(supabase.from('schedine').select('id,kind,risk,size,system_of,selections,pct,fair,book,last_kickoff,created_at,hits,hit').order('created_at', {ascending: false}).limit(50))
                .then(({data: list}) => { if (alive) setRows((list ?? []) as unknown as Row[]); })
                .catch(() => { if (alive) setRows([]); });
        }).catch(() => { if (alive) setRows(null); });
        return () => { alive = false; };
    }, []);
    const legLabel = (key: LegKey) => (key === 'btts' ? tm('labels.goal') : key === 'noBtts' ? tm('labels.noGoal') : key.startsWith('over') ? tm('labels.over', {line: `${key.slice(4, 5)},${key.slice(5)}`}) : key.startsWith('under') ? tm('labels.under', {line: `${key.slice(5, 6)},${key.slice(6)}`}) : key);
    if (rows === undefined || rows === null) return null;
    const settled = rows.filter((r) => r.hit !== null);
    const won = settled.filter((r) => r.hit).length;
    return (
        <Panel title={t('title')} action={settled.length > 0 ? <span className="font-mono text-[11px] text-muted-foreground">{t('tally', {won, settled: settled.length})}</span> : undefined}>
            {rows.length === 0 ? (
                <p className="px-3 py-3 text-[13px] font-semibold text-muted-foreground">{t('empty')}</p>
            ) : (
                <ul className="flex flex-col divide-y divide-muted">
                    {rows.map((r) => (
                        <li key={r.id} className="px-3 py-2 flex flex-col gap-1">
                            <div className="flex items-center gap-2 text-[12px]">
                                <span className={cn("inline-flex items-center justify-center w-16 h-6 rounded border-2 border-foreground font-mono text-[11px] font-extrabold", r.hit === null ? "bg-card text-muted-foreground" : r.hit ? "bg-emerald-200" : "bg-red-100")}>{r.hit === null ? t('open') : r.hit ? t('won') : t('lost')}</span>
                                <span className="font-extrabold">{ts(`kinds.${r.kind}`)}{r.system_of ? ` ${r.system_of}/${r.size}` : ''} · {ts(`risks.${r.risk}`)}</span>
                                <span className="font-mono text-[11px] font-bold tabular-nums text-muted-foreground">{r.pct}% · {tm('fair')} {Number(r.fair).toFixed(2)}{r.book !== null && ` · ${tm('book')} ${Number(r.book).toFixed(2)}`}{r.hits !== null && ` · ${t('hits', {hits: r.hits, size: r.size})}`}</span>
                                <span className="ml-auto text-[11px] font-semibold text-muted-foreground whitespace-nowrap">{format.dateTime(new Date(r.created_at), {day: '2-digit', month: '2-digit'})}</span>
                            </div>
                            <ul className="flex flex-col gap-0.5 pl-1 text-[12px]">
                                {r.selections.map((s) => (
                                    <li key={s.fixtureId} className="flex items-center gap-2 min-w-0">
                                        <span className="font-mono text-[10px] font-bold text-muted-foreground w-12 shrink-0">{format.dateTime(new Date(s.startingAt), {weekday: 'short', day: 'numeric'})}</span>
                                        {s.banker && <span className="inline-flex items-center h-4 px-1 rounded border border-foreground bg-accent text-[9px] font-extrabold uppercase tracking-wide shrink-0">{ts('banker')}</span>}
                                        <Link href={`/matches/${s.fixtureId}`} target="_blank" rel="noopener noreferrer" className="font-bold truncate hover:underline decoration-accent decoration-[2px] underline-offset-2">{s.home} – {s.away}</Link>
                                        <span className="ml-auto font-extrabold whitespace-nowrap">{s.legs.map((l) => legLabel(l.key)).join(' + ')} <span className="font-mono text-[10px] font-bold text-muted-foreground">{s.pct}%</span></span>
                                    </li>
                                ))}
                            </ul>
                        </li>
                    ))}
                </ul>
            )}
        </Panel>
    );
}
