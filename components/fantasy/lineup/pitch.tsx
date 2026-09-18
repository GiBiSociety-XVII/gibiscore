'use client';

import {ArrowLeftRight, Pin, RotateCcw} from "lucide-react";
import {useState} from "react";
import {useTranslations} from "next-intl";
import {Link} from "@/i18n/navigation";
import {cn} from "@/components/shared/ui/cn";
import {TeamCrest} from "@/components/football/team-crest";
import {RoleBadge} from "../role-badge";
import type {AuctionPlayer} from "@/lib/fantasy/data";
import type {PlayerForecast} from "@/lib/fantasy/matchday";
import type {FantaRole} from "@/lib/fantasy/scores";
import type {FormationKey} from "@/lib/fantasy/strategies";
import {keepSpots, sameSpots, type Spot} from "@/lib/fantasy/spots";
import {chanceClass, dragProps, draggedId, pct} from "./shared";

const ROLES: FantaRole[] = ['P', 'D', 'C', 'A'];

function PitchDot({f, byId, pinned, picking, onReceive}: {f: PlayerForecast; byId: Map<number, AuctionPlayer>; pinned: boolean; /** A substitute is being placed by hand: this starter can be the one who leaves. */ picking: boolean; /** A substitute (by id) takes this starter's place; null while picking means the one being placed. */ onReceive: (inId: number | null) => void}) {
    const t = useTranslations('Fantasy.lineup');
    const p = byId.get(f.player.id);
    const [over, setOver] = useState(false);
    const surname = f.player.name.split(' ').slice(-1)[0] ?? f.player.name;
    const body = (
        <>
            <span className="relative">
                <span className={cn("inline-flex w-9 h-9 md:w-10 md:h-10 items-center justify-center rounded-full border-[2.5px] border-foreground bg-card group-hover:ring-2 ring-accent overflow-hidden transition-transform", (over || picking) && "ring-4 ring-accent", over && "scale-110")}>
                    {p ? <TeamCrest team={p.team} size={26} /> : <RoleBadge role={f.player.role} />}
                </span>
                <span className={cn("absolute -top-1.5 -right-3 font-mono text-[9px] font-extrabold tabular-nums px-1 rounded border border-foreground leading-[14px] text-foreground", chanceClass(f.plays))}>{pct(f.plays)}</span>
                {pinned && <span className="absolute -top-1.5 -left-2 inline-flex items-center justify-center w-4 h-4 rounded-full border border-foreground bg-foreground text-background"><Pin className="w-2.5 h-2.5" aria-hidden="true" /></span>}
                {picking && <span className="absolute -bottom-1 -right-2 inline-flex items-center justify-center w-4 h-4 rounded-full border border-foreground bg-accent text-foreground"><ArrowLeftRight className="w-2.5 h-2.5" aria-hidden="true" /></span>}
            </span>
            <span className="text-[10px] md:text-[11px] font-bold leading-tight text-center truncate max-w-full text-background [text-shadow:0_1px_2px_rgba(0,0,0,.6)] group-hover:underline decoration-accent decoration-2 underline-offset-2">{surname}</span>
            <span className="font-mono text-[10px] font-extrabold tabular-nums leading-none text-background [text-shadow:0_1px_2px_rgba(0,0,0,.6)]">{f.points.toFixed(1)}</span>
        </>
    );
    const cls = "group flex flex-col items-center gap-0.5 min-w-0 w-[64px] md:w-[80px]";
    const drop = {
        onDragOver: (e: React.DragEvent) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; if (!over) setOver(true); },
        onDragLeave: () => setOver(false),
        onDrop: (e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); setOver(false); const id = draggedId(e); if (id !== null && id !== f.player.id) onReceive(id); },
    };
    if (picking) return <button type="button" onClick={() => onReceive(null)} title={t('swapOut', {name: f.player.name})} className={cls} {...drop}>{body}</button>;
    return <Link href={`/players/${f.player.slug}`} target="_blank" rel="noopener noreferrer" title={t('dropHere', {name: f.player.name})} className={cls} {...drop}>{body}</Link>;
}

/**
 * The bench next to the pitch, as short rows that can be dragged onto it
 * (or placed with the ⇄ button): the list scrolls on its own while the
 * pitch stays put, so a substitute is always a short drag away.
 */
export function BenchStrip({bench, slots, byId, pinned, benched, outs, picking, locked, onPlace, onUnbench}: {bench: PlayerForecast[]; slots: Map<number, number>; byId: Map<number, AuctionPlayer>; pinned: ReadonlySet<number>; benched: ReadonlySet<number>; outs: ReadonlySet<number>; picking: number | null; locked: boolean; onPlace: (id: number) => void; onUnbench: (id: number) => void}) {
    const t = useTranslations('Fantasy.lineup');
    return (
        <div data-tour="bench" className="bb-surface flex flex-col min-h-0 md:relative md:h-full">
            <div className="flex items-center gap-1.5 px-3 h-9 border-b-2 border-foreground bg-card rounded-t-[calc(var(--radius-lg)-2px)] text-[12px] font-extrabold uppercase tracking-wide shrink-0">
                {t('benchTitle', {count: bench.length})}
                <span className="ml-auto inline-flex items-center gap-1 text-[10px] font-semibold text-muted-foreground normal-case tracking-normal" title={t('dragHint')}><ArrowLeftRight className="w-3 h-3" aria-hidden="true" />{t('dragShort')}</span>
            </div>
            <ul className="flex flex-col max-h-72 md:max-h-none md:absolute md:inset-x-0 md:top-9 md:bottom-0 overflow-y-auto [scrollbar-width:thin]">
                {bench.map((f) => {
                    const p = byId.get(f.player.id);
                    const isPicking = picking === f.player.id;
                    const isBenched = benched.has(f.player.id);
                    const out = outs.has(f.player.id);
                    const surname = f.player.name.split(' ').slice(-1)[0] ?? f.player.name;
                    return (
                        <li key={f.player.id} className={cn("flex items-center gap-1.5 px-2 h-9 border-t border-muted first:border-t-0 text-[12px]", !locked && "cursor-grab active:cursor-grabbing", isPicking ? "bg-accent/40" : isBenched ? "bg-red-100/60" : out || f.plays < 0.2 ? "opacity-60" : "", pinned.has(f.player.id) && "bg-accent/20")} title={`${f.player.name} · ${pct(f.plays)} · ${(slots.get(f.player.id) ?? f.value).toFixed(2)}`} {...dragProps(f.player.id, locked)}>
                            <RoleBadge role={f.player.role} />
                            {p && <TeamCrest team={p.team} size={18} />}
                            <span className="font-extrabold truncate min-w-0">{surname}</span>
                            {isBenched && <span className="bb-badge text-[8px] h-3.5 px-1 uppercase bg-red-200 shrink-0">{t('benchedShort')}</span>}
                            <span className="ml-auto flex items-center gap-1 shrink-0">
                                <span className={cn("font-mono text-[10px] font-extrabold tabular-nums px-1 rounded border border-foreground/40 leading-[16px]", chanceClass(f.plays))}>{pct(f.plays)}</span>
                                <span className="font-mono text-[11px] font-extrabold tabular-nums w-8 text-right">{(slots.get(f.player.id) ?? f.value).toFixed(1)}</span>
                                {isBenched ? (
                                    <button type="button" onClick={() => onUnbench(f.player.id)} disabled={locked} title={locked ? t('lockedNoChange') : t('unbench')} className="bb-btn h-6 w-6 inline-flex items-center justify-center disabled:opacity-40 bg-red-700 text-background"><RotateCcw className="w-3 h-3" aria-hidden="true" /></button>
                                ) : (
                                    <button type="button" onClick={() => onPlace(f.player.id)} disabled={locked} aria-pressed={isPicking} title={locked ? t('lockedNoChange') : t('place')} className={cn("bb-btn h-6 w-6 inline-flex items-center justify-center disabled:opacity-40", isPicking ? "bg-accent" : "bg-card")}><ArrowLeftRight className="w-3 h-3" aria-hidden="true" /></button>
                                )}
                            </span>
                        </li>
                    );
                })}
            </ul>
        </div>
    );
}

/** The eleven on a pitch: attackers at the top, the keeper at the bottom. */
export function FantasyPitch({starters, formation, byId, pinned, picking, onSwap, onPlace}: {starters: PlayerForecast[]; formation: FormationKey; byId: Map<number, AuctionPlayer>; pinned: ReadonlySet<number>; /** The substitute being placed by hand, if any. */ picking: number | null; onSwap: (inId: number, outId: number) => void; onPlace: (inId: number) => void}) {
    // The spots as last drawn: a lineup that changed is laid over them, newcomers in the places left free.
    const [spots, setSpots] = useState<Spot[]>([]);
    const order = keepSpots(spots, starters.map((f) => f.player));
    if (!sameSpots(order, spots)) setSpots(order);
    const rank = new Map(order.map((s, i) => [s.id, i]));
    const rows = [...ROLES].reverse().map((role) => starters.filter((f) => f.player.role === role).sort((a, b) => (rank.get(a.player.id) ?? 99) - (rank.get(b.player.id) ?? 99)));
    return (
        <div
            data-tour="pitch"
            className={cn("relative rounded-xl border-[2.5px] border-foreground overflow-hidden bg-[#3f8f3a] text-background", picking !== null && "ring-4 ring-accent")}
            onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; }}
            onDrop={(e) => { e.preventDefault(); const id = draggedId(e); if (id !== null) onPlace(id); }}
        >
            <div className="absolute inset-2 border-2 border-white/60 rounded-sm pointer-events-none" aria-hidden="true" />
            <div className="absolute left-1/2 top-2 w-[44%] h-[13%] -ml-[22%] border-2 border-t-0 border-white/60 pointer-events-none" aria-hidden="true" />
            <div className="absolute left-1/2 bottom-2 w-[44%] h-[13%] -ml-[22%] border-2 border-b-0 border-white/60 pointer-events-none" aria-hidden="true" />
            <div className="absolute inset-0 bg-[repeating-linear-gradient(0deg,transparent_0,transparent_10%,rgba(255,255,255,0.05)_10%,rgba(255,255,255,0.05)_20%)] pointer-events-none" aria-hidden="true" />
            <div className="relative flex flex-col gap-2 md:gap-3 px-2 py-3">
                <div className="flex items-center justify-end px-1 text-[11px] font-extrabold uppercase tracking-wide"><span className="font-mono">{formation}</span></div>
                {rows.map((line, i) => (
                    <div key={i} className="flex justify-around">{line.map((f) => <PitchDot key={f.player.id} f={f} byId={byId} pinned={pinned.has(f.player.id)} picking={picking !== null} onReceive={(inId) => onSwap(inId ?? picking!, f.player.id)} />)}</div>
                ))}
            </div>
        </div>
    );
}
