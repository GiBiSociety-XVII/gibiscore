import Image from "next/image";
import {useFormatter, useTranslations} from "next-intl";
import {Link} from "@/i18n/navigation";
import {Badge} from "@/components/shared/ui/badge";
import {cn} from "@/components/shared/ui/cn";
import type {SidelinedEntry} from "@/lib/football/types";

const day = (iso: string) => new Date(`${iso}T12:00:00Z`);

/** i18n key of a provider reason: "Coach's decision" -> "coach_s_decision". */
export function reasonKey(description: string): string {
    return description.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
}

/** "Rientro stimato: 20 set" / "a breve" / "prossima partita", from the estimate. */
export function ReturnLabel({entry, className}: {entry: SidelinedEntry; className?: string}) {
    const t = useTranslations('Football.absences');
    const format = useFormatter();
    const e = entry.estimate;
    const short = (iso: string) => format.dateTime(day(iso), {day: 'numeric', month: 'short'});
    let text: string;
    let title: string | undefined;
    if (e.kind === 'range' && e.date) {
        text = t('returnRange', {date: short(e.date)});
        title = e.from && e.to ? t('returnWindow', {from: short(e.from), to: short(e.to)}) : undefined;
    } else if (e.kind === 'soon') text = t('returnSoon');
    else if (e.kind === 'nextMatch') text = t('returnNextMatch');
    else text = t('returnUnknown');
    return (
        <span className={cn("inline-flex items-center gap-1.5", className)} title={title}>
            {text}
            {e.longTerm && <Badge variant="ink" className="text-[9px] h-4 px-1">{t('longTerm')}</Badge>}
        </span>
    );
}

export function categoryVariant(category: string): 'ink' | 'outline' | 'accent' {
    return category === 'suspension' ? 'ink' : category === 'doubtful' ? 'accent' : 'outline';
}

/** Rows of absent players: reason, out since (days), indicative return. */
export function AbsenceList({entries, compact = false, hint = false}: {entries: SidelinedEntry[]; compact?: boolean; hint?: boolean}) {
    const t = useTranslations('Football.absences');
    const format = useFormatter();
    if (entries.length === 0) return <p className="px-3 py-3 text-[13px] font-semibold text-muted-foreground">{t('empty')}</p>;
    const reason = (p: SidelinedEntry) => {
        if (!p.description) return t(`category.${p.category}`);
        const key = `reasons.${reasonKey(p.description)}`;
        return t.has(key) ? t(key) : p.description;
    };
    return (
        <>
            <ul className="flex flex-col">
                {entries.map((p) => (
                    <li key={p.player.id} className={cn("flex items-center gap-2.5 px-3 border-t border-muted first:border-t-0", compact ? "py-1" : "py-1.5")}>
                        {!compact && (
                            <span className="inline-flex w-7 h-7 rounded-full bg-muted overflow-hidden shrink-0">
                                {p.player.imageUrl && <Image src={p.player.imageUrl} alt="" width={28} height={28} unoptimized className="object-cover" />}
                            </span>
                        )}
                        <span className="flex flex-col leading-tight min-w-0 flex-1">
                            <span className="flex items-center gap-2 min-w-0">
                                <Link href={`/players/${p.player.slug}`} className="text-[13px] font-bold truncate hover:underline decoration-accent decoration-[2px] underline-offset-2">{p.player.name}</Link>
                                <span className="text-[11px] font-semibold text-muted-foreground truncate">{reason(p)}</span>
                            </span>
                            <span className="text-[11px] font-semibold text-muted-foreground leading-snug">
                                <span className="text-foreground">{t('daysOut', {count: p.daysOut})}</span>
                                {' · '}{t('since', {date: format.dateTime(day(p.since), {day: 'numeric', month: 'short'})})}
                                {' · '}{t('missed', {count: p.missed})}
                                {' · '}<ReturnLabel entry={p} className="text-foreground" />
                            </span>
                        </span>
                        <Badge variant={categoryVariant(p.category)} className="ml-auto whitespace-nowrap shrink-0">{t(`category.${p.category}`)}</Badge>
                    </li>
                ))}
            </ul>
            {hint && <p className="px-3 py-2 text-[11px] font-semibold text-muted-foreground border-t border-muted">{t('hint')}</p>}
        </>
    );
}
