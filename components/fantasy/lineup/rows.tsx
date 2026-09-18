'use client';

import {ArrowLeftRight, Ban, HelpCircle, Pin, PinOff, RotateCcw, X} from "lucide-react";
import {useState} from "react";
import {useFormatter, useTranslations} from "next-intl";
import {Link} from "@/i18n/navigation";
import {cn} from "@/components/shared/ui/cn";
import {TeamCrest} from "@/components/football/team-crest";
import {RoleBadge} from "../role-badge";
import type {AuctionPlayer} from "@/lib/fantasy/data";
import type {ForecastReason, PlayerForecast} from "@/lib/fantasy/matchday";
import type {TeamSummary} from "@/lib/football/types";
import {Cell, dragProps, facts, pct, signalsOf, TONE_CLASS, toneOf, type SwapControls, type Tone} from "./shared";

const ROME = 'Europe/Rome';

export function ForecastRow({f, slot, index, byId, teamById, reasonText, muted = false, stripe = false, pinned, onPin, out, onOut, locked, swap}: {f: PlayerForecast; teamById: Map<number, TeamSummary>; /** What the slot is worth with the substitution; the plain value when unknown. */ slot: number | undefined; index: number | null; byId: Map<number, AuctionPlayer>; reasonText: (r: ForecastReason) => string; muted?: boolean; /** Every other row, so the eye follows one across the columns. */ stripe?: boolean; pinned: boolean; onPin: () => void; out: boolean; onOut: () => void; /** The round has kicked off: nothing can be changed. */ locked: boolean; /** On the bench: how he gets in. */ swap?: SwapControls}) {
    const t = useTranslations('Fantasy.lineup');
    const format = useFormatter();
    const [why, setWhy] = useState(false);
    const p = byId.get(f.player.id);
    const fixture = f.fixture;
    const kickoff = fixture ? format.dateTime(new Date(fixture.startingAt), {weekday: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: ROME}) : null;
    const opponent = p && fixture ? (teamById.get(f.opponent!.id) ?? {id: f.opponent!.id, name: f.opponent!.name, shortCode: null, logoUrl: null}) : null;
    const state = fixture ? (fixture.state === 'finished' ? t('played') : ['live', 'half_time', 'extra_time', 'penalties'].includes(fixture.state) ? t('live') : fixture.state === 'postponed' || fixture.state === 'cancelled' ? t('postponed') : null) : null;
    const x = facts(f);
    // Status badges: what settles his chance before the numbers.
    const status: Array<{key: string; label: string; tone: Tone; reason: ForecastReason}> = [];
    if (x.manual) status.push({key: 'manual', label: t('status.manual'), tone: 'worst', reason: x.manual});
    if (x.official) status.push({key: 'official', label: t(`status.official.${x.official.status}`), tone: x.official.status === 'starter' ? 'good' : x.official.status === 'bench' ? 'bad' : 'worst', reason: x.official});
    if (x.sidelined) status.push({key: 'sidelined', label: t(x.sidelined.category === 'injury' ? 'status.injury' : x.sidelined.category === 'suspension' ? 'status.suspension' : 'status.absent'), tone: 'worst', reason: x.sidelined});
    if (x.doubtful) status.push({key: 'doubtful', label: t('status.doubtful'), tone: 'bad', reason: x.doubtful});
    if (x.noMatch) status.push({key: 'noMatch', label: t('status.noMatch'), tone: 'worst', reason: x.noMatch});
    const td = "px-1 py-1.5 text-center";
    const bg = pinned ? "bg-accent/20" : swap?.picking ? "bg-accent/40" : out ? "bg-red-100/60" : swap?.benched ? "bg-muted" : stripe ? "bg-muted/60" : "";
    return (
        <>
        <tr className={cn("border-t border-muted align-middle", muted && !pinned && "opacity-70", bg, swap && !locked && "cursor-grab active:cursor-grabbing")} {...(swap ? dragProps(f.player.id, locked) : {})}>
            <td className="px-1 py-1.5">
                <span className="flex items-center gap-0.5">
                    {swap && (swap.benched ? (
                        <button type="button" onClick={swap.onUnbench} disabled={locked} title={locked ? t('lockedNoChange') : t('unbench')} className="bb-btn h-6 w-5 inline-flex items-center justify-center disabled:opacity-40 bg-red-700 text-background">
                            <RotateCcw className="w-3 h-3" aria-hidden="true" />
                        </button>
                    ) : (
                        <button type="button" onClick={swap.onPlace} disabled={locked} aria-pressed={swap.picking} title={locked ? t('lockedNoChange') : t('place')} className={cn("bb-btn h-6 w-5 inline-flex items-center justify-center disabled:opacity-40", swap.picking ? "bg-accent" : "bg-card")}>
                            <ArrowLeftRight className="w-3 h-3" aria-hidden="true" />
                        </button>
                    ))}
                    <button type="button" onClick={onPin} disabled={locked} aria-pressed={pinned} title={locked ? t('lockedNoChange') : pinned ? t('unpin') : t('pin')} className={cn("bb-btn h-6 w-5 inline-flex items-center justify-center disabled:opacity-40", pinned ? "bg-foreground text-background" : "bg-card")}>
                        {pinned ? <PinOff className="w-3 h-3" aria-hidden="true" /> : <Pin className="w-3 h-3" aria-hidden="true" />}
                    </button>
                    <button type="button" onClick={onOut} disabled={locked} aria-pressed={out} title={locked ? t('lockedNoChange') : out ? t('unout') : t('out')} className={cn("bb-btn h-6 w-5 inline-flex items-center justify-center disabled:opacity-40", out ? "bg-red-700 text-background" : "bg-card")}>
                        <Ban className="w-3 h-3" aria-hidden="true" />
                    </button>
                    <button type="button" onClick={() => setWhy((v) => !v)} aria-expanded={why} aria-label={t('why')} title={t('whyHint')} className={cn("bb-btn h-6 w-5 inline-flex items-center justify-center", why ? "bg-foreground text-background" : "bg-card")}>
                        <HelpCircle className="w-3 h-3" aria-hidden="true" />
                    </button>
                </span>
            </td>
            <td className="px-1 py-1.5">
                <span className="inline-flex items-center gap-0.5">
                    {index !== null && <span className="font-mono text-[10px] font-extrabold tabular-nums text-muted-foreground w-3.5 text-right">{index}</span>}
                    <RoleBadge role={f.player.role} />
                </span>
            </td>
            <td className="px-2 py-1.5">
                <span className="flex items-center gap-1.5 min-w-0 whitespace-nowrap">
                    {p && <TeamCrest team={p.team} size={18} />}
                    <Link href={`/players/${f.player.slug}`} target="_blank" rel="noopener noreferrer" draggable={false} title={f.reasons.map(reasonText).join(' · ')} className="font-extrabold text-[13px] truncate hover:underline decoration-accent decoration-[2px] underline-offset-2">{f.player.name}</Link>
                </span>
                {(status.length > 0 || swap?.benched) && (
                    <span className="flex flex-wrap gap-1 mt-0.5">
                        {swap?.benched && <span className="bb-badge text-[9px] h-4 px-1 uppercase bg-red-200">{t('benchedBadge')}</span>}
                        {status.map((b) => <span key={b.key} className={cn("bb-badge text-[9px] h-4 px-1 uppercase", TONE_CLASS[b.tone])} title={reasonText(b.reason)}>{b.label}</span>)}
                    </span>
                )}
            </td>
            <td className="px-2 py-1.5 text-[11px] font-semibold whitespace-nowrap">
                {fixture && opponent ? (
                    <span className="inline-flex items-center gap-1.5" title={`${f.home ? t('vsHome', {team: opponent.name}) : t('vsAway', {team: opponent.name})} · ${kickoff}`}>
                        <TeamCrest team={opponent} size={22} />
                        <span className={cn("bb-badge h-4 px-1 text-[9px] font-extrabold", f.home ? "bg-card" : "bg-muted")}>{f.home ? t('atHome') : t('atAway')}</span>
                        <span className="text-muted-foreground">{kickoff}{state && <span className="ml-1 uppercase">· {state}</span>}</span>
                    </span>
                ) : (
                    <span className="text-muted-foreground">{t('noFixture')}</span>
                )}
            </td>
            <td className={td}><Cell tone={f.plays >= 0.8 ? 'good' : f.plays >= 0.5 ? 'fine' : f.plays >= 0.2 ? 'bad' : 'worst'} title={t('playsSplit', {start: pct(f.starts), sub: pct(Math.max(0, f.plays - f.starts)), subPoints: f.subPoints.toFixed(2)})}>{pct(f.plays)}</Cell></td>
            <td className="px-2 py-1.5 w-full">
                <span className="flex flex-wrap gap-1">
                    {signalsOf(f, x, t, reasonText).map((sg) => <span key={sg.key} className={cn("bb-badge text-[10px] h-5 px-1.5 whitespace-nowrap", TONE_CLASS[sg.tone])} title={sg.title}>{sg.label}</span>)}
                </span>
            </td>
            <td className={td}><Cell strong tone={toneOf(slot ?? f.value, [5.8, 6.4, 7.0, 7.5])} title={t('slotOf', {value: f.value.toFixed(2)})}>{(slot ?? f.value).toFixed(2)}</Cell></td>
        </tr>
        {why && (
            <tr className={cn("align-top", bg)}>
                <td colSpan={7} className="px-3 pb-2 pt-0">
                    <div className="rounded-lg border-2 border-foreground bg-card px-3 py-2 flex flex-col gap-1">
                        <span className="flex items-center gap-2 text-[11px] font-extrabold uppercase tracking-wide">
                            {f.player.name}
                            <span className="font-mono normal-case tracking-normal text-muted-foreground">{t('colRating')} {f.rating.toFixed(2)} · {t('colPoints')} {f.points.toFixed(2)} · {t('colValue')} {(slot ?? f.value).toFixed(2)}</span>
                            <button type="button" onClick={() => setWhy(false)} aria-label={t('whyClose')} className="ml-auto inline-flex w-5 h-5 items-center justify-center rounded border border-foreground/50 bg-background hover:bg-accent"><X className="w-3 h-3" aria-hidden="true" /></button>
                        </span>
                        <ul className="grid gap-x-4 gap-y-0.5 sm:grid-cols-2 text-[11px] font-semibold list-disc pl-4">
                            {f.reasons.map((r, i) => <li key={i}>{reasonText(r)}</li>)}
                        </ul>
                    </div>
                </td>
            </tr>
        )}
        </>
    );
}

/** A player's forecast as a card, for phones: the numbers that decide, the status and the pin and out buttons, the reasons on request. */
export function ForecastCard({f, slot, index, byId, teamById, reasonText, muted = false, pinned, onPin, out, onOut, locked, swap}: {f: PlayerForecast; teamById: Map<number, TeamSummary>; slot: number | undefined; index: number | null; byId: Map<number, AuctionPlayer>; reasonText: (r: ForecastReason) => string; muted?: boolean; pinned: boolean; onPin: () => void; out: boolean; onOut: () => void; locked: boolean; swap?: SwapControls}) {
    const t = useTranslations('Fantasy.lineup');
    const format = useFormatter();
    const [more, setMore] = useState(false);
    const p = byId.get(f.player.id);
    const x = facts(f);
    const fixture = f.fixture;
    const kickoff = fixture ? format.dateTime(new Date(fixture.startingAt), {weekday: 'short', hour: '2-digit', minute: '2-digit', timeZone: ROME}) : null;
    const status: Array<{key: string; label: string; tone: Tone}> = [];
    if (x.manual) status.push({key: 'manual', label: t('status.manual'), tone: 'worst'});
    if (x.official) status.push({key: 'official', label: t(`status.official.${x.official.status}`), tone: x.official.status === 'starter' ? 'good' : x.official.status === 'bench' ? 'bad' : 'worst'});
    if (x.sidelined) status.push({key: 'sidelined', label: t(x.sidelined.category === 'injury' ? 'status.injury' : x.sidelined.category === 'suspension' ? 'status.suspension' : 'status.absent'), tone: 'worst'});
    if (x.doubtful) status.push({key: 'doubtful', label: t('status.doubtful'), tone: 'bad'});
    if (x.noMatch) status.push({key: 'noMatch', label: t('status.noMatch'), tone: 'worst'});
    return (
        <li className={cn("px-2.5 py-2 flex flex-col gap-1.5 border-t border-muted first:border-t-0", muted && !pinned && "opacity-70", pinned && "bg-accent/20", swap?.picking && "bg-accent/40", out && "bg-red-100/60", swap?.benched && !out && "bg-muted")} {...(swap ? dragProps(f.player.id, locked) : {})}>
            <div className="flex items-center gap-2 min-w-0">
                {index !== null && <span className="font-mono text-[11px] font-extrabold tabular-nums text-muted-foreground w-4">{index}</span>}
                <RoleBadge role={f.player.role} />
                {p && <TeamCrest team={p.team} size={18} />}
                <span className="flex flex-col leading-tight min-w-0">
                    <Link href={`/players/${f.player.slug}`} target="_blank" rel="noopener noreferrer" draggable={false} className="font-extrabold text-[14px] truncate">{f.player.name}</Link>
                    <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-muted-foreground truncate">
                        {fixture && f.opponent ? (
                            <>
                                <TeamCrest team={teamById.get(f.opponent.id) ?? {id: f.opponent.id, name: f.opponent.name, shortCode: null, logoUrl: null}} size={14} />
                                <span className="bb-badge h-3.5 px-1 text-[8px] font-extrabold bg-card">{f.home ? t('atHome') : t('atAway')}</span>
                                {kickoff}
                            </>
                        ) : t('noFixture')}
                    </span>
                </span>
                <span className="ml-auto flex items-center gap-1 shrink-0">
                    <Cell tone={f.plays >= 0.8 ? 'good' : f.plays >= 0.5 ? 'fine' : f.plays >= 0.2 ? 'bad' : 'worst'}>{pct(f.plays)}</Cell>
                    <Cell strong tone={toneOf(slot ?? f.value, [5.8, 6.4, 7.0, 7.5])}>{(slot ?? f.value).toFixed(1)}</Cell>
                </span>
            </div>
            <div className="flex items-center gap-1.5 flex-wrap">
                {swap?.benched && <span className="bb-badge text-[9px] h-4 px-1 uppercase bg-red-200">{t('benchedBadge')}</span>}
                {status.map((b) => <span key={b.key} className={cn("bb-badge text-[9px] h-4 px-1 uppercase", TONE_CLASS[b.tone])}>{b.label}</span>)}
                {signalsOf(f, x, t, reasonText).map((sg) => <span key={sg.key} className={cn("bb-badge text-[10px] h-5 px-1.5 whitespace-nowrap", TONE_CLASS[sg.tone])} title={sg.title}>{sg.label}</span>)}
                <span className="ml-auto inline-flex items-center gap-1">
                    <button type="button" onClick={() => setMore((v) => !v)} aria-expanded={more} className="bb-btn h-7 px-2 text-[11px] font-extrabold bg-card">{more ? t('cardLess') : t('cardMore')}</button>
                    {swap && (swap.benched ? (
                        <button type="button" onClick={swap.onUnbench} disabled={locked} title={t('unbench')} className="bb-btn h-7 w-7 inline-flex items-center justify-center disabled:opacity-40 bg-red-700 text-background"><RotateCcw className="w-3.5 h-3.5" aria-hidden="true" /></button>
                    ) : (
                        <button type="button" onClick={swap.onPlace} disabled={locked} aria-pressed={swap.picking} title={t('place')} className={cn("bb-btn h-7 w-7 inline-flex items-center justify-center disabled:opacity-40", swap.picking ? "bg-accent" : "bg-card")}><ArrowLeftRight className="w-3.5 h-3.5" aria-hidden="true" /></button>
                    ))}
                    <button type="button" onClick={onPin} disabled={locked} aria-pressed={pinned} title={pinned ? t('unpin') : t('pin')} className={cn("bb-btn h-7 w-7 inline-flex items-center justify-center disabled:opacity-40", pinned ? "bg-foreground text-background" : "bg-card")}>{pinned ? <PinOff className="w-3.5 h-3.5" aria-hidden="true" /> : <Pin className="w-3.5 h-3.5" aria-hidden="true" />}</button>
                    <button type="button" onClick={onOut} disabled={locked} aria-pressed={out} title={out ? t('unout') : t('out')} className={cn("bb-btn h-7 w-7 inline-flex items-center justify-center disabled:opacity-40", out ? "bg-red-700 text-background" : "bg-card")}><Ban className="w-3.5 h-3.5" aria-hidden="true" /></button>
                </span>
            </div>
            {more && (
                <div className="text-[11px] font-semibold text-muted-foreground flex flex-col gap-0.5">
                    <span>{t('colRating')} {f.rating.toFixed(2)} · {t('colPoints')} {f.points.toFixed(2)} · {t('colValue')} {(slot ?? f.value).toFixed(2)}</span>
                    <span>{f.reasons.map(reasonText).join(' · ')}</span>
                </div>
            )}
        </li>
    );
}

/** The header of the starters and bench tables: the same columns for both. */
export function Head() {
    const t = useTranslations('Fantasy.lineup');
    const th = "px-1 py-1.5 text-[10px] font-extrabold uppercase tracking-wide text-muted-foreground text-center whitespace-nowrap";
    return (
        <thead className="bg-card">
            <tr>
                <th className={cn(th, "px-1")} aria-label={t('colPin')} />
                <th className={cn(th, "px-1")} aria-label={t('colRole')} />
                <th className={cn(th, "text-left px-2")}>{t('colPlayer')}</th>
                <th className={cn(th, "text-left px-2")}>{t('colMatch')}</th>
                <th className={cn(th, "min-w-[3rem]")} title={t('colPlaysHint')}>{t('colPlays')}</th>
                <th className={cn(th, "text-left px-2")} title={t('colSignalsHint')}>{t('colSignals')}</th>
                <th className={cn(th, "min-w-[3.25rem]")} title={t('colValueHint')}>{t('colValue')}</th>
            </tr>
        </thead>
    );
}
