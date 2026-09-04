import type {Metadata} from "next";
import Image from "next/image";
import {getTranslations, setRequestLocale} from "next-intl/server";
import {Link} from "@/i18n/navigation";
import {cn} from "@/components/shared/ui/cn";
import {SiteShell, Panel} from "@/components/shell/site-shell";
import {PageHeader} from "@/components/football/page-header";
import {PlayerPicker} from "@/components/football/player-picker";
import {TeamCrest} from "@/components/football/team-crest";
import {getPlayerCompare, type CompareSide} from "@/lib/football/data/compare";

export async function generateMetadata(): Promise<Metadata> {
    const t = await getTranslations('Pages.compare');
    return {title: t('metaTitle'), description: t('metaDescription'), robots: {index: false}};
}

function per90(value: number, minutes: number): string {
    return minutes > 0 ? (value / (minutes / 90)).toFixed(2) : '–';
}

function Head({side, align}: {side: CompareSide; align: 'left' | 'right'}) {
    const p = side.page.player;
    return (
        <Link href={`/players/${p.slug}`} className={cn("flex items-center gap-3 min-w-0", align === 'right' && "flex-row-reverse text-right")}>
            <span className="inline-flex w-14 h-14 rounded-xl border-[2.5px] border-foreground bg-muted overflow-hidden shrink-0">
                {p.imageUrl && <Image src={p.imageUrl} alt="" width={56} height={56} className="object-cover" />}
            </span>
            <span className="flex flex-col min-w-0 leading-tight">
                <span className="text-base font-extrabold truncate hover:underline decoration-accent decoration-[3px] underline-offset-2">{p.name}</span>
                {side.page.team && (
                    <span className={cn("inline-flex items-center gap-1.5 text-[12px] font-semibold text-muted-foreground", align === 'right' && "flex-row-reverse")}>
                        <TeamCrest team={side.page.team} size={14} />
                        {side.page.team.name}
                    </span>
                )}
            </span>
        </Link>
    );
}

export default async function ComparePage({params, searchParams}: PageProps<"/[locale]/compare">) {
    const {locale} = await params;
    const sp = await searchParams;
    setRequestLocale(locale);
    const t = await getTranslations('Pages.compare');
    const a = typeof sp.a === 'string' ? sp.a : null;
    const b = typeof sp.b === 'string' ? sp.b : null;
    const yearRaw = typeof sp.season === 'string' && /^\d{4}$/.test(sp.season) ? Number(sp.season) : undefined;
    const data = a && b ? await getPlayerCompare(a, b, yearRaw) : null;

    const rows = data
        ? ([
              [t('rows.apps'), data.a.totals.appearances, data.b.totals.appearances, 'high'],
              [t('rows.minutes'), data.a.totals.minutes, data.b.totals.minutes, 'high'],
              [t('rows.goals'), data.a.totals.goals, data.b.totals.goals, 'high'],
              [t('rows.assists'), data.a.totals.assists, data.b.totals.assists, 'high'],
              [t('rows.goals90'), per90(data.a.totals.goals, data.a.totals.minutes), per90(data.b.totals.goals, data.b.totals.minutes), 'high'],
              [t('rows.assists90'), per90(data.a.totals.assists, data.a.totals.minutes), per90(data.b.totals.assists, data.b.totals.minutes), 'high'],
              [t('rows.shots90'), per90(data.a.totals.shots, data.a.totals.minutes), per90(data.b.totals.shots, data.b.totals.minutes), 'high'],
              [t('rows.shotsOn'), data.a.totals.shotsOn, data.b.totals.shotsOn, 'high'],
              [t('rows.keyPasses90'), per90(data.a.totals.keyPasses, data.a.totals.minutes), per90(data.b.totals.keyPasses, data.b.totals.minutes), 'high'],
              [t('rows.passAccuracy'), data.a.totals.passAccuracy !== null ? `${data.a.totals.passAccuracy}%` : '–', data.b.totals.passAccuracy !== null ? `${data.b.totals.passAccuracy}%` : '–', 'high'],
              [t('rows.rating'), data.a.totals.rating?.toFixed(2) ?? '–', data.b.totals.rating?.toFixed(2) ?? '–', 'high'],
              [t('rows.cards'), `${data.a.totals.yellowCards} / ${data.a.totals.redCards}`, `${data.b.totals.yellowCards} / ${data.b.totals.redCards}`, 'none'],
          ] as Array<[string, string | number, string | number, 'high' | 'none']>)
        : [];
    const better = (x: string | number, y: string | number, mode: 'high' | 'none'): 'a' | 'b' | null => {
        if (mode === 'none') return null;
        const nx = Number(String(x).replace('%', ''));
        const ny = Number(String(y).replace('%', ''));
        if (!Number.isFinite(nx) || !Number.isFinite(ny) || nx === ny) return null;
        return nx > ny ? 'a' : 'b';
    };

    return (
        <SiteShell wide>
            <PageHeader title={t('title')} meta={t('intro')} />
            <div className="grid gap-3 grid-cols-1 md:grid-cols-2">
                <PlayerPicker param="a" other={b} otherParam="b" placeholder={t('pickA')} />
                <PlayerPicker param="b" other={a} otherParam="a" placeholder={t('pickB')} />
            </div>
            {a && b && !data && <p className="text-sm font-semibold text-muted-foreground">{t('notFound')}</p>}
            {data && (
                <Panel title={t('seasonTitle', {season: data.a.page.availableSeasons.find((s) => s.year === data.year)?.name ?? String(data.year)})}>
                    <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3 px-3 py-3 border-b-2 border-foreground">
                        <Head side={data.a} align="left" />
                        <span className="text-[11px] font-extrabold uppercase tracking-wide text-muted-foreground">vs</span>
                        <Head side={data.b} align="right" />
                    </div>
                    <table className="w-full text-[13px]">
                        <tbody>
                            {rows.map(([label, va, vb, mode]) => {
                                const win = better(va, vb, mode);
                                return (
                                    <tr key={label} className="border-t border-muted">
                                        <td className={cn("px-3 py-1.5 w-1/3 text-right font-mono font-extrabold tabular-nums", win === 'a' && "text-accent-text")}>
                                            <span className={cn("inline-block px-1.5 rounded", win === 'a' && "bg-accent/40 text-foreground")}>{va}</span>
                                        </td>
                                        <td className="px-2 py-1.5 text-center text-[11px] font-bold uppercase tracking-wide text-muted-foreground whitespace-nowrap">{label}</td>
                                        <td className={cn("px-3 py-1.5 w-1/3 text-left font-mono font-extrabold tabular-nums")}>
                                            <span className={cn("inline-block px-1.5 rounded", win === 'b' && "bg-accent/40 text-foreground")}>{vb}</span>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                    <p className="px-3 py-2 text-[11px] font-semibold text-muted-foreground border-t border-muted">{t('hint')}</p>
                </Panel>
            )}
        </SiteShell>
    );
}
