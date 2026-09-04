import {Link} from "@/i18n/navigation";
import {cn} from "@/components/shared/ui/cn";
import type {LineupPlayer, TeamLineup} from "@/lib/football/types";

/** Starters grouped by line (formationPosition = row*10 + column), goalkeeper first. */
function lines(starters: LineupPlayer[]): LineupPlayer[][] {
    const byRow = new Map<number, LineupPlayer[]>();
    for (const p of starters) {
        if (p.formationPosition === null) continue;
        const row = Math.floor(p.formationPosition / 10);
        if (!byRow.has(row)) byRow.set(row, []);
        byRow.get(row)!.push(p);
    }
    return [...byRow.entries()]
        .sort((a, b) => a[0] - b[0])
        .map(([, players]) => players.sort((a, b) => (a.formationPosition ?? 0) - (b.formationPosition ?? 0)));
}

function Dot({p, dark}: {p: LineupPlayer; dark: boolean}) {
    const surname = p.name.split(' ').slice(-1)[0] ?? p.name;
    return (
        <Link href={`/players/${p.slug}`} className="group flex flex-col items-center gap-0.5 min-w-0 w-[64px] md:w-[76px]">
            <span className="relative">
                <span className={cn("inline-flex w-8 h-8 md:w-9 md:h-9 items-center justify-center rounded-full border-[2.5px] border-foreground font-mono text-[12px] font-extrabold tabular-nums group-hover:ring-2 ring-accent", dark ? "bg-foreground text-background" : "bg-card text-foreground")}>
                    {p.number ?? ''}
                </span>
                {p.rating !== null && (
                    <span className={cn("absolute -top-1.5 -right-2.5 font-mono text-[9px] font-extrabold tabular-nums px-1 rounded border border-foreground leading-[14px] text-foreground", p.rating >= 7 ? "bg-accent" : "bg-card")}>{p.rating.toFixed(1)}</span>
                )}
            </span>
            <span className="text-[10px] md:text-[11px] font-bold leading-tight text-center truncate max-w-full text-background [text-shadow:0_1px_2px_rgba(0,0,0,.6)] group-hover:underline decoration-accent decoration-2 underline-offset-2">{surname}</span>
        </Link>
    );
}

/** Both starting elevens on one pitch: home attacks downwards, away mirrored below. */
export function Pitch({home, away}: {home: TeamLineup | null; away: TeamLineup | null}) {
    const homeLines = home ? lines(home.starters) : [];
    const awayLines = away ? lines(away.starters) : [];
    if (homeLines.length === 0 && awayLines.length === 0) return null;
    return (
        <div className="relative rounded-xl border-[2.5px] border-foreground overflow-hidden bg-[#3f8f3a] text-background">
            {/* Pitch markings */}
            <div className="absolute inset-2 border-2 border-white/60 rounded-sm pointer-events-none" aria-hidden="true" />
            <div className="absolute left-2 right-2 top-1/2 h-0.5 bg-white/60 pointer-events-none" aria-hidden="true" />
            <div className="absolute left-1/2 top-1/2 w-20 h-20 -ml-10 -mt-10 rounded-full border-2 border-white/60 pointer-events-none" aria-hidden="true" />
            <div className="absolute left-1/2 top-2 w-[44%] h-[13%] -ml-[22%] border-2 border-t-0 border-white/60 pointer-events-none" aria-hidden="true" />
            <div className="absolute left-1/2 bottom-2 w-[44%] h-[13%] -ml-[22%] border-2 border-b-0 border-white/60 pointer-events-none" aria-hidden="true" />
            <div className="absolute inset-0 bg-[repeating-linear-gradient(0deg,transparent_0,transparent_10%,rgba(255,255,255,0.05)_10%,rgba(255,255,255,0.05)_20%)] pointer-events-none" aria-hidden="true" />

            <div className="relative flex flex-col gap-1.5 md:gap-2 px-2 py-4">
                {home && (
                    <div className="flex items-center justify-between px-1 text-[11px] font-extrabold uppercase tracking-wide">
                        <span className="truncate">{home.team.name}</span>
                        {home.formation && <span className="font-mono">{home.formation}</span>}
                    </div>
                )}
                {homeLines.map((line, i) => (
                    <div key={`h${i}`} className="flex justify-around">{line.map((p) => <Dot key={p.id} p={p} dark />)}</div>
                ))}
                <div className="h-3" />
                {[...awayLines].reverse().map((line, i) => (
                    <div key={`a${i}`} className="flex justify-around">{line.map((p) => <Dot key={p.id} p={p} dark={false} />)}</div>
                ))}
                {away && (
                    <div className="flex items-center justify-between px-1 text-[11px] font-extrabold uppercase tracking-wide">
                        <span className="truncate">{away.team.name}</span>
                        {away.formation && <span className="font-mono">{away.formation}</span>}
                    </div>
                )}
            </div>
        </div>
    );
}
