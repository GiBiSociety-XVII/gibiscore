'use client';

import {BarChart3, CalendarDays, TrendingUp, Trophy, Sparkles} from "lucide-react";
import {useTranslations} from "next-intl";
import {Link, usePathname} from "@/i18n/navigation";
import {cn} from "@/components/shared/ui/cn";
import {BrandIcon, BrandLockup} from "@/components/shared/layout/logo";
import {NavMegaMenu} from "./nav-mega-menu";
import {AccountButton} from "./account-button";
import {SearchBox} from "./search-box";
import {ThemeToggle} from "./theme-toggle";
import {LocaleSwitch} from "./locale-switch";
import {useNavColumns} from "./nav-sections";

/** Same bar as gibiarena.com: lockup, dropdown sections, live link, search pill. */
export default function AppBar() {
    const path = usePathname();
    const t = useTranslations("AppBar");
    const m = useTranslations("AppBar.menus");
    const {scoresColumns, competitionColumns, statsColumns} = useNavColumns();

    const liveActive = path.startsWith('/live');
    const predictionsActive = path.startsWith('/predictions');
    const fantaActive = path.startsWith('/fantacalcio');
    const tf = useTranslations('Fantasy');

    return (
        <header className="sticky top-0 z-50 w-full bg-background border-b-[2.5px] border-foreground">
            <div className="w-full max-w-[1600px] mx-auto px-3 md:px-6">
                <div className="flex h-16 md:h-20 items-center gap-3 md:gap-6">
                    <Link href="/" className="flex items-center shrink-0" aria-label="GiBiScore">
                        <BrandLockup height={48} className="hidden sm:block h-10 md:h-12 w-auto" />
                        <BrandIcon size={40} className="sm:hidden" alt="GiBiScore" />
                    </Link>

                    <nav data-tour="sections" aria-label={t('sectionsLabel')} className="hidden md:flex items-center gap-2">
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
                        <Link
                            href="/predictions"
                            aria-current={predictionsActive ? 'page' : undefined}
                            className={cn(
                                "inline-flex items-center gap-1.5 h-9 md:h-10 px-2.5 md:px-3.5 rounded-lg text-[14px] md:text-[17px] font-bold whitespace-nowrap transition-colors",
                                predictionsActive ? "text-foreground bg-accent/40 border-2 border-foreground" : "text-foreground/70 hover:text-foreground hover:bg-muted",
                            )}
                        >
                            <TrendingUp className="w-5 h-5" aria-hidden="true" />
                            {t('nav.predictions')}
                        </Link>
                        <NavMegaMenu
                            label={t('nav.stats')}
                            icon={<BarChart3 className="w-5 h-5" />}
                            overviewHref="/stats"
                            overviewLabel={m('stats.overview')}
                            columns={statsColumns}
                            active={path.startsWith('/stats') || path.startsWith('/injuries')}
                        />
                        <Link
                            href="/fantacalcio"
                            aria-current={fantaActive ? 'page' : undefined}
                            className={cn(
                                "inline-flex items-center gap-1.5 h-9 md:h-10 px-2.5 md:px-3.5 rounded-lg text-[14px] md:text-[17px] font-bold whitespace-nowrap transition-colors",
                                fantaActive ? "text-foreground bg-accent/40 border-2 border-foreground" : "text-foreground/70 hover:text-foreground hover:bg-muted",
                            )}
                        >
                            <Sparkles className="w-5 h-5" aria-hidden="true" />
                            {tf('nav')}
                        </Link>
                    </nav>

                    <SearchBox />
                    <LocaleSwitch />
                    <ThemeToggle />
                    <AccountButton />
                </div>
            </div>
        </header>
    );
}
