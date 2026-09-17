'use client';

import {useEffect, useState} from "react";
import {BookOpen} from "lucide-react";
import {Tour, type TourStep} from "@/components/fantasy/tour";

/**
 * The "Guida" button of a page and the guide it opens: by itself the
 * first time the page is seen on this browser, from the button after.
 * The steps come from the page (already translated), each anchored to a
 * `data-tour` element; the ones not on screen are skipped.
 */
export function TourLauncher({steps, storageKey, label, hint}: {steps: TourStep[]; storageKey: string; label: string; hint: string}) {
    const [open, setOpen] = useState(false);
    useEffect(() => {
        try {
            if (!localStorage.getItem(storageKey)) queueMicrotask(() => setOpen(true));
        } catch {
            // No storage: no guide by itself, the button stays.
        }
    }, [storageKey]);
    const close = () => {
        setOpen(false);
        try {
            localStorage.setItem(storageKey, '1');
        } catch {
            // Shown again next time: no harm.
        }
    };
    return (
        <>
            <button type="button" onClick={() => setOpen(true)} className="bb-btn bg-card px-2.5 h-7 text-[11px] font-extrabold inline-flex items-center gap-1.5" title={hint}><BookOpen className="w-3.5 h-3.5" aria-hidden="true" />{label}</button>
            {open && <Tour steps={steps} onClose={close} />}
        </>
    );
}
