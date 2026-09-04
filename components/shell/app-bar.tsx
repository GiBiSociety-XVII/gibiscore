'use client';

import {BarChart3, CalendarDays, Trophy} from "lucide-react";
import {useTranslations} from "next-intl";
import {Link, usePathname} from "@/i18n/navigation";
import {cn} from "@/components/shared/ui/cn";
import {BrandIcon, BrandLockup} from "@/components/shared/layout/logo";
import {NavMegaMenu} from "./nav-mega-menu";
import {SearchBox} from "./search-box";

function romeDay(offset: number): string {
    return new Intl.DateTimeFormat('en-CA', {timeZone: 'Europe/Rome'}).format(new Date(Date.now() + offset * 86_400_000));
}

/** Same bar as gibiarena.com: lockup, dropdown sections, live link, search pill. */
export default function AppBar() {
    const path = usePathname();
    const t = useTranslations("AppBar");
    const m = useTranslations("AppBar.menus");

    const scoresColumns = [
        {
            title: m('scores.matchesTitle'),
            items: [
                {label: m('scores.today'), href: '/'},
                {label: m('scores.live'), href: '/live'},
                {label: m('scores.yesterday'), href: `/scores/${romeDay(-1)}`},
                {label: m('scores.tomorrow'), href: `/scores/${romeDay(1)}`},
            ],
        },
        {
            title: m('scores.toolsTitle'),
            items: [
                {label: m('scores.search'), href: '/search', hint: m('scores.searchHint')},
                {label: m('scores.favorites'), href: '/', hint: m('scores.favoritesHint')},
            ],
        },
    ];
    const competitionColumns = [
        {
            title: m('competitions.italyTitle'),
            items: [
                {label: 'Serie A', href: '/competitions/serie-a'},
                {label: 'Serie B', href: '/competitions/serie-b'},
                {label: 'Coppa Italia', href: '/competitions/coppa-italia'},
            ],
        },
        {
            title: m('competitions.europeTitle'),
            items: [
                {label: 'Champions League', href: '/competitions/champions-league'},
                {label: 'Europa League', href: '/competitions/europa-league'},
                {label: 'Conference League', href: '/competitions/conference-league'},
            ],
        },
        {
            title: m('competitions.topTitle'),
            items: [
                {label: 'Premier League', href: '/competitions/premier-league'},
                {label: 'La Liga', href: '/competitions/la-liga'},
                {label: 'Bundesliga', href: '/competitions/bundesliga'},
                {label: 'Ligue 1', href: '/competitions/ligue-1'},
            ],
        },
    ];
    const statsColumns = [
        {
            title: m('stats.playersTitle'),
            items: [
                {label: m('stats.scorers'), href: '/stats'},
                {label: m('stats.assists'), href: '/stats'},
                {label: m('stats.compare'), href: '/compare', hint: m('stats.compareHint')},
            ],
        },
        {
            title: m('stats.squadsTitle'),
            items: [
                {label: m('stats.injuries'), href: '/injuries', hint: m('stats.injuriesHint')},
                {label: m('stats.predictions'), href: '/predictions', hint: m('stats.predictionsHint')},
                {label: m('stats.teamStats'), href: '/search', hint: m('stats.teamStatsHint')},
            ],
        },
    ];

    const liveActive = path.startsWith('/live');

    return (
        <header className="sticky top-0 z-50 w-full bg-background border-b-[2.5px] border-foreground">
            <div className="w-full max-w-[1600px] mx-auto px-3 md:px-6">
                <div className="flex h-16 md:h-20 items-center gap-3 md:gap-6">
                    <Link href="/" className="flex items-center shrink-0" aria-label="GiBiScore">
                        <BrandLockup height={48} className="hidden sm:block h-10 md:h-12 w-auto" />
                        <BrandIcon size={40} className="sm:hidden" alt="GiBiScore" />
                    </Link>

                    <nav aria-label={t('sectionsLabel')} className="hidden md:flex items-center gap-2">
                        <NavMegaMenu
                            label={t('nav.scores')}
                            icon={<CalendarDays className="w-5 h-5" />}
                            overviewHref="/"
                            overviewLabel={m('scores.overview')}
                            columns={scoresColumns}
                            active={path === '/' || path.startsWith('/scores')}
                        />
                        <Link
                            href="/live"
                            aria-current={liveActive ? 'page' : undefined}
                            className={cn(
                                "inline-flex items-center h-9 md:h-10 px-2.5 md:px-3.5 rounded-lg text-[14px] md:text-[17px] font-bold whitespace-nowrap transition-colors",
                                liveActive ? "text-foreground bg-accent/40 border-2 border-foreground" : "text-foreground/70 hover:text-foreground hover:bg-muted",
                            )}
                        >
                            <span className={cn("w-2 h-2 rounded-full mr-1.5 border border-foreground", liveActive ? "bg-foreground" : "bg-accent")} aria-hidden="true" />
                            {t('nav.live')}
                        </Link>
                        <NavMegaMenu
                            label={t('nav.competitions')}
                            icon={<Trophy className="w-5 h-5" />}
                            overviewHref="/competitions"
                            overviewLabel={m('competitions.overview')}
                            columns={competitionColumns}
                            active={path.startsWith('/competitions')}
                        />
                        <NavMegaMenu
                            label={t('nav.stats')}
                            icon={<BarChart3 className="w-5 h-5" />}
                            overviewHref="/stats"
                            overviewLabel={m('stats.overview')}
                            columns={statsColumns}
                            active={path.startsWith('/stats') || path.startsWith('/injuries')}
                        />
                    </nav>

                    <SearchBox />
                </div>
            </div>
        </header>
    );
}
