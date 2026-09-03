import {useTranslations} from "next-intl";
import {Link} from "@/i18n/navigation";
import {LogoMark} from "./logo";

const EXPLORE_LINKS = [
    {key: 'live', href: '/'},
    {key: 'serieA', href: '/serie-a'},
    {key: 'teams', href: '/squadre'},
    {key: 'players', href: '/giocatori'},
    {key: 'rankings', href: '/classifiche'},
] as const;

export default function Footer() {
    const t = useTranslations('Common.footer');
    const tNav = useTranslations('AppBar.nav');
    const year = new Date().getFullYear();

    return (
        <footer className="mt-auto w-full bg-background border-t-[2.5px] border-foreground">
            <div className="max-w-6xl mx-auto px-4 py-12 md:py-16">
                <div className="grid grid-cols-2 md:grid-cols-[1.6fr_1fr_1fr] gap-8 md:gap-6 mb-8">
                    <div className="flex flex-col items-start gap-4 col-span-2 md:col-span-1">
                        <div className="flex items-center gap-3">
                            <LogoMark />
                            <span className="text-xl font-black tracking-tight">GiBiScore</span>
                        </div>
                        <p className="text-sm text-muted-foreground max-w-sm">{t('about')}</p>
                    </div>

                    <div className="flex flex-col gap-3">
                        <h3 className="text-sm font-extrabold uppercase tracking-wide">{t('explore')}</h3>
                        <ul className="flex flex-col gap-2">
                            {EXPLORE_LINKS.map(({key, href}) => (
                                <li key={key}>
                                    <Link href={href} className="text-sm font-semibold text-foreground/70 hover:text-foreground">
                                        {tNav(key)}
                                    </Link>
                                </li>
                            ))}
                        </ul>
                    </div>

                    <div className="flex flex-col gap-3">
                        <h3 className="text-sm font-extrabold uppercase tracking-wide">{t('network')}</h3>
                        <ul className="flex flex-col gap-2">
                            <li>
                                <a href="https://gibiarena.com" className="text-sm font-semibold text-foreground/70 hover:text-foreground">
                                    {t('gibiarena')}
                                </a>
                            </li>
                        </ul>
                    </div>
                </div>

                <div className="border-t-2 border-muted pt-6 text-xs text-muted-foreground font-semibold">
                    © {year} GiBiSociety. {t('rights')}
                </div>
            </div>
        </footer>
    );
}
