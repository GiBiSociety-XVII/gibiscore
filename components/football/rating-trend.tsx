import type {PlayerMatchRow} from "@/lib/football/types";

/**
 * Ratings match by match (oldest to newest) as a small line chart, with the
 * season average as a dashed line. Pure SVG, colours from the theme tokens.
 */
export function RatingTrend({matches, average, label}: {matches: PlayerMatchRow[]; average: number | null; label: string}) {
    const points = [...matches].reverse().filter((m) => m.rating !== null && (m.minutes ?? 0) > 0);
    if (points.length < 2) return null;
    const w = 320;
    const h = 72;
    const pad = 6;
    const min = 4;
    const max = 10;
    const x = (i: number) => pad + (i * (w - pad * 2)) / (points.length - 1);
    const y = (v: number) => h - pad - ((Math.min(max, Math.max(min, v)) - min) * (h - pad * 2)) / (max - min);
    const path = points.map((m, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)} ${y(m.rating!).toFixed(1)}`).join(' ');
    return (
        <figure className="flex flex-col gap-1 px-3 py-2 min-w-[200px]">
            <figcaption className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">{label}</figcaption>
            <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-[72px]" role="img" aria-label={label}>
                <line x1={pad} x2={w - pad} y1={y(6)} y2={y(6)} stroke="rgb(var(--muted))" strokeWidth="1" />
                {average !== null && <line x1={pad} x2={w - pad} y1={y(average)} y2={y(average)} stroke="rgb(var(--muted-foreground))" strokeWidth="1" strokeDasharray="3 3" />}
                <path d={path} fill="none" stroke="rgb(var(--foreground))" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
                {points.map((m, i) => (
                    <circle key={m.fixture.id} cx={x(i)} cy={y(m.rating!)} r="3" fill={m.rating! >= 7 ? 'rgb(var(--accent))' : 'rgb(var(--card))'} stroke="rgb(var(--foreground))" strokeWidth="1.5">
                        <title>{`${m.fixture.home.name} - ${m.fixture.away.name}: ${m.rating!.toFixed(1)}`}</title>
                    </circle>
                ))}
            </svg>
        </figure>
    );
}
