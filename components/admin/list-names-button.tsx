'use client';

import {useState} from "react";
import {useTranslations} from "next-intl";
import {Tags} from "lucide-react";
import {cn} from "@/components/shared/ui/cn";

/** One press: every Serie A player found on the official list is named the way the list writes him. */
export function ListNamesButton() {
    const t = useTranslations('Admin.tools.names');
    const [state, setState] = useState<{kind: 'idle'} | {kind: 'running'} | {kind: 'done'; matched: number; renamed: number; unmatched: number} | {kind: 'error'}>({kind: 'idle'});
    const run = async () => {
        setState({kind: 'running'});
        try {
            const res = await fetch('/api/admin/list-names', {method: 'POST'});
            if (!res.ok) throw new Error(String(res.status));
            const body = (await res.json()) as {matched: number; renamed: number; unmatched: number};
            setState({kind: 'done', ...body});
        } catch {
            setState({kind: 'error'});
        }
    };
    return (
        <div className="bb-surface flex items-center gap-3 px-4 py-4">
            <span className="inline-flex w-10 h-10 shrink-0 items-center justify-center rounded-lg border-2 border-foreground bg-accent"><Tags className="w-5 h-5" aria-hidden="true" /></span>
            <span className="flex flex-col gap-0.5 min-w-0">
                <span className="text-[14px] font-extrabold">{t('title')}</span>
                <span className="text-[12px] font-semibold text-muted-foreground">
                    {state.kind === 'done' ? t('done', {matched: state.matched, renamed: state.renamed, unmatched: state.unmatched}) : state.kind === 'error' ? t('error') : t('text')}
                </span>
            </span>
            <button type="button" onClick={run} disabled={state.kind === 'running'} className={cn("bb-btn h-9 px-3 text-[12px] font-extrabold ml-auto shrink-0 disabled:opacity-50", state.kind === 'done' ? "bg-emerald-200" : "bg-card")}>{state.kind === 'running' ? t('running') : t('run')}</button>
        </div>
    );
}
