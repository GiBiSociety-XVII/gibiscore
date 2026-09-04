import type {Metadata} from "next";
import Image from "next/image";
import {getFormatter, getTranslations, setRequestLocale} from "next-intl/server";
import {Link} from "@/i18n/navigation";
import {cn} from "@/components/shared/ui/cn";
import {SiteShell, Panel} from "@/components/shell/site-shell";
import {Flag} from "@/components/football/flag";
import {PageHeader} from "@/components/football/page-header";
import {OutcomeBar} from "@/components/football/prediction";
import {TeamCrest} from "@/components/football/team-crest";
import {getUpcomingPredictions} from "@/lib/football/data/predictions";

export const revalidate = 600;

const DAYS = 3;

export async function generateMetadata(): Promise<Metadata> {
    const t = await getTranslations('Pages.predictions');
    return {title: t('metaTitle'), description: t('metaDescription')};
}

export default async function PredictionsPage({params}: PageProps<"/[locale]/predictions">) {
    const {locale} = await params;
    setRequestLocale(locale);
    const t = await getTranslations('Pages.predictions');
    const tp = await getTranslations('Football.prediction');
    const format = await getFormatter();
    const blocks = await getUpcomingPredictions(DAYS);

    return (
        <SiteShell wide>
            <PageHeader title={t('title')} meta={`${t('days', {count: DAYS})} · ${t('intro')}`} />
            {blocks.length === 0 ? (
                <p className="text-sm font-semibold text-muted-foreground">{tp('listEmpty')}</p>
            ) : (
                <div className="grid gap-3 grid-cols-1 xl:grid-cols-2 items-start">
                    {blocks.map((b) => (
                        <Panel
                            key={b.competition.id}
                            title={
                                <Link href={`/competitions/${b.competition.slug}`} className="inline-flex items-center gap-2 hover:underline decoration-accent decoration-[2px] underline-offset-2">
                                    {b.competition.logoUrl ? <Image src={b.competition.logoUrl} alt="" width={16} height={16} unoptimized className="object-contain" /> : <Flag code={b.competition.countryCode} size={16} />}
                                    {b.competition.country ? `${b.competition.country} · ` : ''}{b.competition.name}
                                </Link>
                            }
                            action={<span className="font-mono text-[11px] text-muted-foreground">{b.fixtures.length}</span>}
                        >
                            <ul className="flex flex-col">
                                {b.fixtures.map(({fixture, prediction}) => {
                                    const start = new Date(fixture.startingAt);
                                    return (
                                        <li key={fixture.id} className="border-t border-muted first:border-t-0">
                                            <Link href={`/matches/${fixture.id}`} className="block px-3 py-2 hover:bg-muted/50">
                                                <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2">
                                                    <span className="flex items-center justify-end gap-2 min-w-0 text-[13px] font-extrabold">
                                                        <span className={cn("truncate", prediction?.pick === '1' && "underline decoration-accent decoration-[3px] underline-offset-2")}>{fixture.home.name}</span>
                                                        <TeamCrest team={fixture.home} size={20} />
                                                    </span>
                                                    <span className="flex flex-col items-center leading-tight">
                                                        <span className="font-mono text-[12px] font-bold">{format.dateTime(start, {hour: '2-digit', minute: '2-digit'})}</span>
                                                        <span className="text-[10px] font-semibold text-muted-foreground uppercase">{format.dateTime(start, {weekday: 'short', day: 'numeric'})}</span>
                                                    </span>
                                                    <span className="flex items-center gap-2 min-w-0 text-[13px] font-extrabold">
                                                        <TeamCrest team={fixture.away} size={20} />
                                                        <span className={cn("truncate", prediction?.pick === '2' && "underline decoration-accent decoration-[3px] underline-offset-2")}>{fixture.away.name}</span>
                                                    </span>
                                                </div>
                                                {prediction ? (
                                                    <div className="mt-1.5 flex items-center gap-3">
                                                        <OutcomeBar prediction={prediction} className="h-5 flex-1" />
                                                        <span className="font-mono text-[11px] font-bold text-muted-foreground whitespace-nowrap tabular-nums">
                                                            xG {prediction.lambda.home.toFixed(1)}-{prediction.lambda.away.toFixed(1)} · O2,5 {prediction.over25}%
                                                        </span>
                                                    </div>
                                                ) : (
                                                    <p className="mt-1 text-[11px] font-semibold text-muted-foreground">{tp('empty')}</p>
                                                )}
                                            </Link>
                                        </li>
                                    );
                                })}
                            </ul>
                        </Panel>
                    ))}
                </div>
            )}
            <p className="text-[12px] font-semibold text-muted-foreground">{tp('listHint')}</p>
        </SiteShell>
    );
}
