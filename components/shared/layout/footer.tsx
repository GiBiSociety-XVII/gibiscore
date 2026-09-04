import {Mail} from "lucide-react";
import {useTranslations} from "next-intl";
import {Link} from "@/i18n/navigation";
import {BrandIcon} from "./logo";

const EXPLORE_LINKS = [
    {key: 'scores', href: '/'},
    {key: 'live', href: '/live'},
    {key: 'competitions', href: '/competitions'},
    {key: 'stats', href: '/stats'},
] as const;

const linkClass = "text-sm text-muted-foreground hover:text-foreground hover:underline underline-offset-4 decoration-2 transition-colors";

/** GiBiSociety footer, same structure as GiBiArena: company, explore, network, legal, support. */
export default function Footer() {
    const t = useTranslations('Common.footer');
    const tNav = useTranslations('AppBar.nav');
    const year = new Date().getFullYear();

    return (
        <footer className="mt-auto w-full bg-background border-t-[2.5px] border-foreground">
            <div className="max-w-[1600px] mx-auto px-4 md:px-6 py-10 md:py-12">
                <div className="grid grid-cols-2 md:grid-cols-[1.6fr_1fr_1fr_1fr_1fr] gap-8 md:gap-6 mb-8">
                    {/* Company */}
                    <div className="flex flex-col items-start gap-4 col-span-2 md:col-span-1">
                        <div className="flex items-center gap-3">
                            <BrandIcon site="gibisociety" size={48} alt={t('company.name')} />
                            <div>
                                <h3 className="text-lg font-bold text-foreground">{t('company.name')}</h3>
                                <p className="text-sm text-muted-foreground">{t('company.tagline')}</p>
                            </div>
                        </div>
                        <p className="text-sm text-muted-foreground leading-relaxed max-w-sm">{t('company.description')}</p>
                    </div>

                    {/* Explore: the primary sections, nothing more */}
                    <div className="flex flex-col gap-3">
                        <h4 className="font-semibold text-foreground">{t('explore')}</h4>
                        <nav className="flex flex-col gap-2">
                            {EXPLORE_LINKS.map((link) => (
                                <Link key={link.key} href={link.href} className={linkClass}>{tNav(link.key)}</Link>
                            ))}
                        </nav>
                    </div>

                    {/* Network */}
                    <div className="flex flex-col gap-3">
                        <h4 className="font-semibold text-foreground">{t('network')}</h4>
                        <nav className="flex flex-col gap-2.5">
                            <a href="https://gibiarena.com" className="flex items-center gap-2 group">
                                <BrandIcon site="gibiarena" size={24} />
                                <span className="flex flex-col leading-tight">
                                    <span className="text-sm font-semibold text-foreground group-hover:underline underline-offset-4 decoration-2">{t('gibiarena')}</span>
                                    <span className="text-[11px] text-muted-foreground">{t('gibiarenaHint')}</span>
                                </span>
                            </a>
                            <Link href="/" className="flex items-center gap-2 group">
                                <BrandIcon site="gibiscore" size={24} />
                                <span className="flex flex-col leading-tight">
                                    <span className="text-sm font-semibold text-foreground group-hover:underline underline-offset-4 decoration-2">{t('gibiscore')}</span>
                                    <span className="text-[11px] text-muted-foreground">{t('gibiscoreHint')}</span>
                                </span>
                            </Link>
                        </nav>
                    </div>

                    {/* Legal */}
                    <div className="flex flex-col gap-3">
                        <h4 className="font-semibold text-foreground">{t('legal')}</h4>
                        <nav className="flex flex-col gap-2">
                            <a href="https://gibiarena.com/privacy" className={linkClass}>{t('privacy')}</a>
                            <a href="https://gibiarena.com/terms" className={linkClass}>{t('terms')}</a>
                        </nav>
                    </div>

                    {/* Support */}
                    <div className="flex flex-col gap-3">
                        <h4 className="font-semibold text-foreground">{t('support')}</h4>
                        <div className="flex items-center gap-2">
                            <Mail className="w-4 h-4 text-foreground" />
                            <a href={`mailto:${t('supportEmail')}`} className={linkClass}>{t('supportEmail')}</a>
                        </div>
                        <a href="https://instagram.com/gibiarena" target="_blank" rel="noopener noreferrer" className={`flex items-center gap-2 ${linkClass}`}>
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 text-foreground" aria-hidden="true">
                                <rect width="20" height="20" x="2" y="2" rx="5" ry="5" />
                                <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
                                <line x1="17.5" x2="17.51" y1="6.5" y2="6.5" />
                            </svg>
                            <span>{t('instagram')}</span>
                        </a>
                        <p className="text-xs text-muted-foreground/70">{t('supportMessage')}</p>
                    </div>
                </div>

                <div className="h-[2px] bg-foreground/15 my-6" />

                <div className="flex flex-col md:flex-row items-center justify-between gap-3 text-xs text-muted-foreground">
                    <p>© {year} {t('copyright')}</p>
                    <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1">
                        <span>{t('dataCredit')}</span>
                        <a href="https://gibiarena.com/privacy" className="hover:text-foreground transition-colors">{t('privacy')}</a>
                        <a href="https://gibiarena.com/terms" className="hover:text-foreground transition-colors">{t('terms')}</a>
                    </div>
                </div>
            </div>
        </footer>
    );
}
