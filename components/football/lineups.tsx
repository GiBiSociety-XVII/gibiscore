import {useTranslations} from "next-intl";
import {Link} from "@/i18n/navigation";
import {Card} from "@/components/shared/ui/card";
import {cn} from "@/components/shared/ui/cn";
import {TeamCrest} from "@/components/football/team-crest";
import type {LineupPlayer, TeamLineup} from "@/lib/football/types";
import {Pitch} from "./pitch";
import {GOOD_VOTO, matchVoto, type VotoCalibration} from "@/lib/fantasy/voto";

function PlayerLine({p, scale}: {p: LineupPlayer; scale: VotoCalibration}) {
    const t = useTranslations('Football.positionsShort');
    const pos = p.position && ['goalkeeper', 'defender', 'midfielder', 'attacker'].includes(p.position) ? p.position : 'unknown';
    const voto = p.rating !== null ? matchVoto(p.rating, p.position, scale) : null;
    return (
        <li className="flex items-center gap-2 py-1 border-t-2 border-muted first:border-t-0">
            <span className="font-mono text-xs font-bold tabular-nums w-6 text-right text-muted-foreground">{p.number ?? ''}</span>
            <span className="inline-flex w-5 h-5 items-center justify-center rounded-md border-2 border-foreground bg-card text-[10px] font-extrabold">{t(pos as 'goalkeeper')}</span>
            <Link href={`/players/${p.slug}`} className="font-bold text-[13px] truncate hover:underline decoration-accent decoration-[3px] underline-offset-4">{p.name}</Link>
            {voto !== null && (
                <span className={cn("ml-auto font-mono text-[11px] font-extrabold tabular-nums px-1.5 py-0.5 rounded-md border-2 border-foreground", voto >= GOOD_VOTO ? "bg-accent" : "bg-card")}>
                    {voto.toFixed(1)}
                </span>
            )}
        </li>
    );
}

function TeamColumn({lineup, scale}: {lineup: TeamLineup; scale: VotoCalibration}) {
    const t = useTranslations('Football.labels');
    return (
        <div className="flex flex-col gap-3 min-w-0">
            <div className="flex items-center gap-2">
                <TeamCrest team={lineup.team} size={22} />
                <span className="font-extrabold truncate">{lineup.team.name}</span>
                {lineup.formation && <span className="ml-auto text-xs font-bold text-muted-foreground whitespace-nowrap">{t('formation', {formation: lineup.formation})}</span>}
            </div>
            <ul className="flex flex-col">{lineup.starters.map((p) => <PlayerLine key={p.id} p={p} scale={scale} />)}</ul>
            {lineup.bench.length > 0 && (
                <>
                    <h4 className="text-xs font-extrabold uppercase tracking-wide text-muted-foreground mt-2">{t('bench')}</h4>
                    <ul className="flex flex-col">{lineup.bench.map((p) => <PlayerLine key={p.id} p={p} scale={scale} />)}</ul>
                </>
            )}
        </div>
    );
}

export function Lineups({home, away, title, scale}: {home: TeamLineup | null; away: TeamLineup | null; title: string; scale: VotoCalibration}) {
    const tEmpty = useTranslations('Football.empty');
    return (
        <Card className="p-3 md:p-4 flex flex-col gap-3">
            <h2 className="text-lg font-extrabold tracking-tight">{title}</h2>
            {!home && !away ? (
                <p className="text-sm font-semibold text-muted-foreground">{tEmpty('noLineups')}</p>
            ) : (
                <>
                    <Pitch home={home} away={away} scale={scale} />
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {home && <TeamColumn lineup={home} scale={scale} />}
                        {away && <TeamColumn lineup={away} scale={scale} />}
                    </div>
                </>
            )}
        </Card>
    );
}
