'use client';

import {useEffect, useState} from "react";
import {useTranslations} from "next-intl";
import {Panel} from "@/components/shell/panel";
import {createClient} from "@/lib/db/client";
import {SchedinaTicket, type Ticket, type TicketLine, type TicketSelection} from "./schedina-ticket";

interface Row {
    id: number;
    kind: Ticket['kind'];
    risk: Ticket['risk'];
    size: number;
    system_of: number | null;
    selections: TicketSelection[];
    pct: number;
    fair: number | string;
    book: number | string | null;
    stake: number | string | null;
    payout: number | string | null;
    lines: TicketLine[] | null;
    last_kickoff: string;
    created_at: string;
    hits: number | null;
    hit: boolean | null;
    results: Array<boolean | null> | null;
}

const num = (v: number | string | null): number | null => (v === null ? null : Number(v));

/**
 * The slips the signed-in user saved, latest first, each drawn as a
 * ticket: open until its matches are over, then won or lost. Read in the
 * browser: the page stays static. Nothing is drawn for a visitor.
 */
export function MySchedine({title}: {title?: string} = {}) {
    const t = useTranslations('Pages.predictions.mine');
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
            Promise.resolve(supabase.from('schedine').select('id,kind,risk,size,system_of,selections,pct,fair,book,stake,payout,lines,last_kickoff,created_at,hits,hit,results').order('created_at', {ascending: false}).limit(50))
                .then(({data: list}) => { if (alive) setRows((list ?? []) as unknown as Row[]); })
                .catch(() => { if (alive) setRows([]); });
        }).catch(() => { if (alive) setRows(null); });
        return () => { alive = false; };
    }, []);
    if (rows === undefined || rows === null) return null;
    const settled = rows.filter((r) => r.hit !== null);
    const won = settled.filter((r) => r.hit).length;
    const tickets: Ticket[] = rows.map((r) => ({
        id: r.id,
        kind: r.kind,
        risk: r.risk,
        size: r.size,
        systemOf: r.system_of,
        selections: r.selections,
        pct: r.pct,
        fair: Number(r.fair),
        book: num(r.book),
        stake: num(r.stake),
        payout: num(r.payout),
        lines: r.lines,
        lastKickoff: r.last_kickoff,
        createdAt: r.created_at,
        hits: r.hits,
        hit: r.hit,
        results: r.results,
    }));
    // The guide of the record page points at the whole panel (skipped while it is not on the page).
    return (
        <div data-tour="mine"><Panel title={title ?? t('title')} action={settled.length > 0 ? <span className="font-mono text-[11px] text-muted-foreground">{t('tally', {won, settled: settled.length})}</span> : undefined}>
            {tickets.length === 0 ? (
                <p className="px-3 py-3 text-[13px] font-semibold text-muted-foreground">{t('empty')}</p>
            ) : (
                <div className="p-3 grid gap-4 grid-cols-1 md:grid-cols-2 2xl:grid-cols-3 items-start bg-muted/40">
                    {tickets.map((ticket) => <SchedinaTicket key={ticket.id} ticket={ticket} />)}
                </div>
            )}
        </Panel></div>
    );
}
