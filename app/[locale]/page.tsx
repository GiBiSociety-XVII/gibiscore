import {ExternalLink} from "lucide-react";
import {getTranslations, setRequestLocale} from "next-intl/server";
import AppBar from "@/components/shared/layout/app-bar";
import Footer from "@/components/shared/layout/footer";
import {Badge} from "@/components/shared/ui/badge";
import {buttonClasses} from "@/components/shared/ui/button";
import {MatchCard} from "@/components/home/match-card";
import {StandingsTable} from "@/components/home/standings-table";
import {PlayerSpotlight} from "@/components/home/player-spotlight";
import {getHomeData} from "@/lib/football/queries";

// Live scores change every minute; the page itself is cheap to render.
export const revalidate = 60;

export default async function HomePage({params}: PageProps<"/[locale]">) {
    const {locale} = await params;
    setRequestLocale(locale);
    const t = await getTranslations('HomePage');
    const tCommon = await getTranslations('Common');
    const data = await getHomeData();

    return (
        <div className="min-h-screen flex flex-col bg-background">
            <AppBar />

            <main className="flex-1 flex flex-col gap-5 px-3 md:px-6 py-6 pb-10 w-full max-w-[1440px] mx-auto">
                {/* Hero + live strip */}
                <section className="flex flex-col gap-4">
                    <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
                        <div className="flex flex-col gap-2.5">
                            <Badge variant="ink" className="self-start">
                                <span className="w-2 h-2 rounded-full bg-accent" aria-hidden="true" />
                                {t('liveBadge', {count: data.liveCount})}
                            </Badge>
                            <h1 className="text-3xl md:text-[40px] font-extrabold tracking-tight leading-[1.05] text-balance">
                                {t('heroPrefix')}
                                <span className="inline-block bg-accent text-accent-foreground border-[2.5px] border-foreground rounded-[10px] px-3">
                                    {t('heroAccent')}
                                </span>
                                {t('heroSuffix')}
                            </h1>
                            <p className="text-base text-muted-foreground max-w-2xl text-pretty">{t('subtitle')}</p>
                        </div>
                        {data.isSample && <Badge variant="outline" className="self-start md:self-auto">{tCommon('sampleData')}</Badge>}
                    </div>

                    <div className="grid gap-4 grid-cols-1 md:grid-cols-2 xl:grid-cols-3">
                        {data.fixtures.map((fixture) => (
                            <MatchCard key={fixture.id} fixture={fixture} />
                        ))}
                    </div>
                </section>

                {/* Standings + spotlight */}
                <section className="grid gap-4 grid-cols-1 lg:grid-cols-[7fr_5fr] items-start">
                    <StandingsTable
                        leagueName={data.standings.leagueName}
                        rows={data.standings.rows}
                        fullHref="/competitions/serie-a"
                    />
                    <div className="flex flex-col gap-4 min-w-0">
                        {data.spotlight && <PlayerSpotlight player={data.spotlight} />}
                        <div className="border-[2.5px] border-dashed border-muted-foreground rounded-2xl h-[90px] flex items-center justify-center text-[13px] font-bold text-muted-foreground">
                            {t('adSlot')}
                        </div>
                    </div>
                </section>

                {/* Free-for-all band with GiBiArena cross-link */}
                <section className="bg-foreground text-background rounded-2xl p-5 md:px-6 flex flex-col md:flex-row md:items-center md:justify-between gap-6">
                    <div className="flex flex-col gap-1.5">
                        <span className="text-xl font-extrabold tracking-tight">{t('freeBand.title')}</span>
                        <span className="text-sm text-background/70">{t('freeBand.description')}</span>
                    </div>
                    <a
                        href="https://gibiarena.com"
                        className={buttonClasses('primary', 'default', 'border-background shadow-[5px_5px_0_rgb(var(--accent))] whitespace-nowrap')}
                    >
                        {t('freeBand.cta')}
                        <ExternalLink className="w-4 h-4" />
                    </a>
                </section>
            </main>

            <Footer />
        </div>
    );
}
