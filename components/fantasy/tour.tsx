'use client';

import {useEffect, useState} from "react";
import {ChevronLeft, ChevronRight, X} from "lucide-react";
import {useTranslations} from "next-intl";
import {cn} from "@/components/shared/ui/cn";

export interface TourStep {
    /** The element to point at: `[data-tour="<target>"]`. A step whose element is not on the page is skipped. */
    target: string;
    title: string;
    text: string;
}

const GAP = 10;
const CARD = 340;

/**
 * A step-by-step guide over a page: the page dims, the element of the
 * step keeps its light and a card beside it says what it is for. Next,
 * back, close; Escape closes. The parent decides when it opens (the
 * first visit, a button) and what it says.
 */
export function Tour({steps, onClose}: {steps: TourStep[]; onClose: () => void}) {
    const t = useTranslations('Common.tour');
    const [present, setPresent] = useState<TourStep[]>([]);
    const [index, setIndex] = useState(0);
    const [box, setBox] = useState<{top: number; left: number; width: number; height: number} | null>(null);

    // Only the steps whose element exists and is on screen (not in a closed tab), decided once when the guide opens.
    useEffect(() => {
        const found = steps.filter((s) => {
            const el = document.querySelector(`[data-tour="${s.target}"]`);
            return !!el && el.getClientRects().length > 0;
        });
        queueMicrotask(() => setPresent(found));
    }, [steps]);

    const step = present[index];
    useEffect(() => {
        if (!step) return;
        const el = document.querySelector(`[data-tour="${step.target}"]`) as HTMLElement | null;
        if (!el) return;
        // A tall element (the whole list) scrolls to its top, the card sits inside it; a short one is centred.
        el.scrollIntoView({block: el.getBoundingClientRect().height > window.innerHeight * 0.6 ? 'start' : 'center', behavior: 'smooth'});
        let frame = 0;
        const measure = () => {
            const r = el.getBoundingClientRect();
            setBox({top: r.top, left: r.left, width: r.width, height: r.height});
        };
        // After the scroll settles, then whenever the page moves.
        const timer = window.setTimeout(() => { measure(); }, 350);
        const onMove = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(measure); };
        window.addEventListener('scroll', onMove, true);
        window.addEventListener('resize', onMove);
        measure();
        return () => {
            window.clearTimeout(timer);
            cancelAnimationFrame(frame);
            window.removeEventListener('scroll', onMove, true);
            window.removeEventListener('resize', onMove);
        };
    }, [step]);

    useEffect(() => {
        const key = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
            if (e.key === 'ArrowRight') setIndex((i) => Math.min(present.length - 1, i + 1));
            if (e.key === 'ArrowLeft') setIndex((i) => Math.max(0, i - 1));
        };
        document.addEventListener('keydown', key);
        return () => document.removeEventListener('keydown', key);
    }, [onClose, present.length]);

    if (!step || !box) return null;
    const vw = typeof window === 'undefined' ? 1200 : window.innerWidth;
    const vh = typeof window === 'undefined' ? 800 : window.innerHeight;
    const width = Math.min(CARD, vw - 24);
    // Under the element when there is room, else above it; inside it when it is taller than the screen; never off the sides.
    const tall = box.height > vh * 0.6;
    const below = box.top + box.height + GAP + 190 < vh || box.top < 200;
    const top = tall ? Math.max(box.top, 0) + 56 : below ? box.top + box.height + GAP : undefined;
    const bottom = tall || below ? undefined : vh - box.top + GAP;
    const left = Math.max(12, Math.min(vw - width - 12, box.left + (tall ? 12 : 0)));
    const last = index === present.length - 1;

    return (
        <div className="fixed inset-0 z-[80]" role="dialog" aria-modal="true" aria-label={step.title}>
            {/* The dim, with the element's window cut out by a giant shadow. */}
            <div className="absolute inset-0" onClick={onClose} aria-hidden="true" />
            <div className="absolute rounded-lg border-2 border-accent shadow-[0_0_0_9999px_rgba(0,0,0,0.6)] pointer-events-none transition-all duration-200" style={{top: box.top - 4, left: box.left - 4, width: box.width + 8, height: box.height + 8}} aria-hidden="true" />
            <div className="absolute bb-surface bg-background p-3 flex flex-col gap-2" style={{top, bottom, left, width}} onClick={(e) => e.stopPropagation()}>
                <div className="flex items-start gap-2">
                    <div className="min-w-0 flex-1">
                        <span className="text-[10px] font-extrabold uppercase tracking-wide text-muted-foreground">{t('stepOf', {step: index + 1, total: present.length})}</span>
                        <h3 className="text-[14px] font-extrabold leading-tight">{step.title}</h3>
                    </div>
                    <button type="button" onClick={onClose} aria-label={t('close')} className="inline-flex items-center justify-center w-7 h-7 rounded-md border-2 border-foreground bg-card hover:bg-muted shrink-0"><X className="w-3.5 h-3.5" aria-hidden="true" /></button>
                </div>
                <p className="text-[12px] font-semibold leading-snug whitespace-pre-line">{step.text}</p>
                <div className="flex items-center gap-1.5">
                    <button type="button" onClick={() => setIndex((i) => Math.max(0, i - 1))} disabled={index === 0} className="bb-btn bg-card h-8 px-2.5 text-[12px] font-extrabold inline-flex items-center gap-1 disabled:opacity-40"><ChevronLeft className="w-3.5 h-3.5" aria-hidden="true" />{t('back')}</button>
                    <button type="button" onClick={() => (last ? onClose() : setIndex((i) => i + 1))} className={cn("bb-btn h-8 px-3 text-[12px] font-extrabold inline-flex items-center gap-1 ml-auto", "bg-accent")}>{last ? t('done') : t('next')}{!last && <ChevronRight className="w-3.5 h-3.5" aria-hidden="true" />}</button>
                </div>
                <div className="flex gap-1" aria-hidden="true">
                    {present.map((s, i) => <span key={s.target} className={cn("h-1 flex-1 rounded-full", i <= index ? "bg-foreground" : "bg-muted")} />)}
                </div>
            </div>
        </div>
    );
}
