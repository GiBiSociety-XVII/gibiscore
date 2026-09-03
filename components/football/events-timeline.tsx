import {useTranslations} from "next-intl";
import {Link} from "@/i18n/navigation";
import {Card} from "@/components/shared/ui/card";
import {cn} from "@/components/shared/ui/cn";
import type {MatchEvent} from "@/lib/football/types";

function EventIcon({type}: {type: MatchEvent['type']}) {
    const base = "inline-flex w-6 h-6 items-center justify-center rounded-lg border-2 border-foreground text-[10px] font-extrabold shrink-0";
    switch (type) {
        case 'goal':
        case 'penalty':
            return <span className={cn(base, "bg-accent")}>⚽︎</span>;
        case 'own_goal':
            return <span className={cn(base, "bg-foreground text-background")}>AG</span>;
        case 'missed_penalty':
            return <span className={cn(base, "bg-muted")}>✕</span>;
        case 'yellow_card':
            return <span className={cn(base, "bg-yellow-300")}>▮</span>;
        case 'red_card':
        case 'yellow_red_card':
            return <span className={cn(base, "bg-red-500 text-white")}>▮</span>;
        case 'substitution':
            return <span className={cn(base, "bg-card")}>⇄</span>;
        default:
            return <span className={cn(base, "bg-muted")}>VAR</span>;
    }
}

function PlayerName({p}: {p: MatchEvent['player']}) {
    if (!p.name) return null;
    return p.slug ? <Link href={`/players/${p.slug}`} className="hover:underline decoration-accent decoration-[3px] underline-offset-4">{p.name}</Link> : <span>{p.name}</span>;
}

export function EventsTimeline({events, title}: {events: MatchEvent[]; title: string}) {
    const t = useTranslations('Football.events');
    const tEmpty = useTranslations('Football.empty');

    return (
        <Card className="p-3 md:p-4 flex flex-col gap-3">
            <h2 className="text-lg font-extrabold tracking-tight">{title}</h2>
            {events.length === 0 ? (
                <p className="text-sm font-semibold text-muted-foreground">{tEmpty('noEvents')}</p>
            ) : (
                <ol className="flex flex-col">
                    {events.map((e) => {
                        const minute = e.minute !== null ? `${e.minute}${e.extraMinute ? `+${e.extraMinute}` : ''}'` : '';
                        const detail =
                            e.type === 'substitution'
                                ? [e.player.name ? t('subIn', {name: e.player.name}) : null, e.related.name ? t('subOut', {name: e.related.name}) : null].filter(Boolean).join(' · ')
                                : (e.type === 'goal' || e.type === 'penalty') && e.related.name
                                  ? t('assist', {name: e.related.name})
                                  : e.info ?? '';
                        return (
                            <li
                                key={e.id}
                                className={cn(
                                    "flex items-center gap-2.5 py-1.5 border-t-2 border-muted first:border-t-0",
                                    e.side === 'away' && "flex-row-reverse text-right",
                                )}
                            >
                                <span className="font-mono text-xs font-bold tabular-nums w-10 shrink-0">{minute}</span>
                                <EventIcon type={e.type} />
                                <div className="flex flex-col min-w-0">
                                    <span className="font-bold text-[13px] truncate">
                                        {e.type === 'substitution' ? t('substitution') : <PlayerName p={e.player} />}
                                        {e.type !== 'substitution' && e.type !== 'goal' && e.type !== 'penalty' && e.type !== 'var' && (
                                            <span className="text-muted-foreground font-semibold"> · {t(e.type)}</span>
                                        )}
                                        {e.type === 'var' && <span>{t('var')}</span>}
                                    </span>
                                    {detail && <span className="text-[11px] font-semibold text-muted-foreground truncate">{detail}</span>}
                                </div>
                            </li>
                        );
                    })}
                </ol>
            )}
        </Card>
    );
}
