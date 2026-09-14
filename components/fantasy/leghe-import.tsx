'use client';

import {FileUp, Upload} from "lucide-react";
import {useState} from "react";
import {useTranslations} from "next-intl";
import {cn} from "@/components/shared/ui/cn";
import type {AuctionConfig, Purchase} from "@/lib/fantasy/config";
import {buildImportedAuction, parseLegheRoster, suggestCredits, type ImportablePlayer, type LegheTeam} from "@/lib/fantasy/leghe";

/**
 * The rosters of a league as Leghe Fantacalcio exports them, turned into
 * an auction of the site: pick the file (or paste its text), say which
 * team is yours and the credits per team, and every roster is in, ready
 * for the lineup. A button that opens the dialog; the import itself is
 * the caller's (it replaces the auction on the device).
 */
export function LegheImport({players, hasAuction, onImport, variant = 'card'}: {players: ImportablePlayer[]; /** An auction already on the device: the import replaces it, after asking. */ hasAuction: boolean; onImport: (config: AuctionConfig, purchases: Purchase[]) => void; variant?: 'card' | 'button'}) {
    const t = useTranslations('Fantasy.import');
    const [open, setOpen] = useState(false);
    const [teams, setTeams] = useState<LegheTeam[] | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [me, setMe] = useState(0);
    const [credits, setCredits] = useState(500);
    const [name, setName] = useState('');
    const known = new Set(players.map((p) => p.listCode).filter((c): c is number => c !== null));

    const read = (text: string) => {
        const parsed = parseLegheRoster(text);
        if (parsed.length === 0) {
            setTeams(null);
            setError(t('error'));
            return;
        }
        setTeams(parsed);
        setError(null);
        setMe(0);
        setCredits(suggestCredits(parsed));
    };
    const onFile = (file: File | null) => {
        if (!file) return;
        file.text().then(read).catch(() => setError(t('error')));
    };
    const confirm = () => {
        if (!teams) return;
        if (hasAuction && !window.confirm(t('replaceConfirm'))) return;
        const {config, purchases} = buildImportedAuction(teams, players, {credits, me, name: name.trim() || t('defaultName')});
        onImport(config, purchases);
        setOpen(false);
        setTeams(null);
    };
    const trigger = variant === 'button' ? (
        <button type="button" onClick={() => setOpen(true)} className="bb-btn bg-card px-2.5 h-8 text-[12px] font-extrabold inline-flex items-center gap-1.5"><FileUp className="w-3.5 h-3.5" aria-hidden="true" />{t('button')}</button>
    ) : (
        <div className="bb-surface px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-3">
            <div className="flex flex-col gap-0.5 min-w-0">
                <span className="text-[13px] font-extrabold">{t('cardTitle')}</span>
                <span className="text-[12px] font-semibold text-muted-foreground">{t('cardText')}</span>
            </div>
            <button type="button" onClick={() => setOpen(true)} className="bb-btn bg-accent px-3 h-9 text-[12px] font-extrabold inline-flex items-center gap-1.5 shrink-0 sm:ml-auto"><FileUp className="w-4 h-4" aria-hidden="true" />{t('button')}</button>
        </div>
    );
    if (!open) return trigger;
    return (
        <>
            {trigger}
            <div role="dialog" aria-modal="true" aria-label={t('title')} className="fixed inset-0 z-[60] flex items-start justify-center bg-foreground/40 p-3 overflow-y-auto" onClick={() => setOpen(false)}>
                <div onClick={(e) => e.stopPropagation()} className="w-full max-w-xl my-4 bb-surface bg-background flex flex-col">
                    <div className="flex items-center justify-between gap-2 px-3 h-10 border-b-2 border-foreground bg-card">
                        <h2 className="text-[13px] font-extrabold uppercase tracking-wide">{t('title')}</h2>
                        <button type="button" onClick={() => setOpen(false)} aria-label={t('cancel')} className="inline-flex w-7 h-7 items-center justify-center rounded border border-foreground/50 bg-background">×</button>
                    </div>
                    <div className="px-3 py-3 flex flex-col gap-3">
                        <p className="text-[12px] font-semibold text-muted-foreground">{t('intro')}</p>
                        <label className="bb-btn bg-card h-10 px-3 inline-flex items-center gap-2 text-[12px] font-extrabold cursor-pointer self-start">
                            <Upload className="w-4 h-4" aria-hidden="true" />
                            {t('file')}
                            <input type="file" accept=".csv,.txt,text/csv,text/plain" className="sr-only" onChange={(e) => onFile(e.target.files?.[0] ?? null)} />
                        </label>
                        <details className="text-[12px] font-semibold">
                            <summary className="cursor-pointer text-muted-foreground">{t('paste')}</summary>
                            <textarea rows={5} onChange={(e) => read(e.target.value)} placeholder={'$,$,$\nSquadra,2764,224\n...'} className="bb-input w-full mt-1 px-2 py-1.5 font-mono text-[11px]" />
                        </details>
                        {error && <p className="text-[12px] font-extrabold text-red-700">{error}</p>}
                        {teams && (
                            <>
                                <div className="rounded-lg border-2 border-foreground/20 bg-card overflow-hidden">
                                    <div className="grid grid-cols-[1.5rem_1fr_auto_auto] gap-x-3 px-3 py-1.5 text-[10px] font-extrabold uppercase tracking-wide text-muted-foreground border-b border-muted">
                                        <span />
                                        <span>{t('team')}</span>
                                        <span className="text-right">{t('players')}</span>
                                        <span className="text-right">{t('spent')}</span>
                                    </div>
                                    {teams.map((team, i) => {
                                        const found = team.players.filter((p) => known.has(p.code)).length;
                                        const spent = team.players.reduce((s, p) => s + p.price, 0);
                                        return (
                                            <label key={team.name} className={cn("grid grid-cols-[1.5rem_1fr_auto_auto] gap-x-3 items-center px-3 h-9 border-t border-muted first:border-t-0 cursor-pointer text-[12px] font-bold", me === i && "bg-accent/20")}>
                                                <input type="radio" name="leghe-me" checked={me === i} onChange={() => setMe(i)} className="w-4 h-4" aria-label={t('yourTeam')} />
                                                <span className="truncate">{team.name}</span>
                                                <span className={cn("font-mono tabular-nums text-right", found < team.players.length && "text-red-700")}>{found}/{team.players.length}</span>
                                                <span className="font-mono tabular-nums text-right">{spent}</span>
                                            </label>
                                        );
                                    })}
                                </div>
                                <p className="text-[11px] font-semibold text-muted-foreground">{t('yourTeamHint')}</p>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    <label className="flex flex-col gap-1 text-[10px] font-extrabold uppercase tracking-wide text-muted-foreground">
                                        {t('leagueName')}
                                        <input type="text" value={name} maxLength={40} onChange={(e) => setName(e.target.value)} placeholder={t('defaultName')} className="bb-input h-9 px-2.5 text-[13px] font-extrabold normal-case tracking-normal text-foreground" />
                                    </label>
                                    <label className="flex flex-col gap-1 text-[10px] font-extrabold uppercase tracking-wide text-muted-foreground">
                                        {t('credits')}
                                        <input type="number" min={50} max={5000} step={50} value={credits} onChange={(e) => setCredits(Number(e.target.value) || 500)} className="bb-input h-9 px-2.5 font-mono text-[13px] font-extrabold text-foreground" />
                                    </label>
                                </div>
                                <p className="text-[11px] font-semibold text-muted-foreground">{t('creditsHint')}</p>
                                {teams.some((team) => team.players.some((p) => !known.has(p.code))) && (
                                    <p className="text-[11px] font-semibold text-amber-800">{t('unmatchedHint', {count: teams.reduce((s, team) => s + team.players.filter((p) => !known.has(p.code)).length, 0)})}</p>
                                )}
                            </>
                        )}
                        <div className="flex items-center justify-end gap-2 pt-1 border-t border-muted">
                            <button type="button" onClick={() => setOpen(false)} className="bb-btn bg-card h-9 px-3 text-[12px] font-extrabold">{t('cancel')}</button>
                            <button type="button" disabled={!teams} onClick={confirm} className="bb-btn bg-accent h-9 px-3 text-[12px] font-extrabold disabled:opacity-50">{t('confirm')}</button>
                        </div>
                    </div>
                </div>
            </div>
        </>
    );
}
