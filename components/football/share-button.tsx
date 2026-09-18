'use client';

import {useState} from "react";
import {Check, Share2} from "lucide-react";
import {useTranslations} from "next-intl";
import {cn} from "@/components/shared/ui/cn";

/**
 * Shares a link the way the device does: the system share sheet where
 * there is one (phones), the clipboard otherwise, with a "copied" flash.
 * `path` is on this site; the origin is the page's own.
 */
export function ShareButton({path, title, text, label, className, compact = false}: {path: string; title: string; text?: string; label?: string; className?: string; compact?: boolean}) {
    const t = useTranslations('Common.share');
    const [copied, setCopied] = useState(false);
    const share = async () => {
        const url = `${window.location.origin}${path}`;
        const nav = navigator as Navigator & {share?: (data: {title: string; text?: string; url: string}) => Promise<void>};
        try {
            if (nav.share) {
                await nav.share({title, text, url});
                return;
            }
        } catch {
            // Sheet dismissed: nothing to do.
            return;
        }
        try {
            await navigator.clipboard.writeText(url);
            setCopied(true);
            window.setTimeout(() => setCopied(false), 2000);
        } catch {
            window.prompt(t('copyPrompt'), url);
        }
    };
    return (
        <button type="button" onClick={share} title={t('share')} aria-label={t('share')} className={cn("bb-btn bg-card inline-flex items-center gap-1.5 font-extrabold", compact ? "h-7 px-2 text-[11px]" : "h-8 px-3 text-[12px]", className)}>
            {copied ? <Check className="w-3.5 h-3.5" aria-hidden="true" /> : <Share2 className="w-3.5 h-3.5" aria-hidden="true" />}
            {copied ? t('copied') : (label ?? t('share'))}
        </button>
    );
}
