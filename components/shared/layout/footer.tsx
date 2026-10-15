import {ArrowUpRight, Mail} from "lucide-react";
import {useTranslations} from "next-intl";
import {Link} from "@/i18n/navigation";
import {FEATURED_COMPETITIONS} from "@/lib/football/competitions";
import {BrandIcon, BrandLockup, type GibiSite} from "./logo";
import {AdminLogoLink} from "@/components/admin/admin-logo-link";

const pill = "inline-flex items-center gap-2 h-11 px-4 rounded-xl border-[2.5px] border-foreground bg-card text-[15px] font-bold shadow-[4px_4px_0_rgb(var(--foreground))] hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-[2px_2px_0_rgb(var(--foreground))] transition-all whitespace-nowrap";
/** The other GiBi sites, in the order the footer lists them (same list and order as on gibiarena.com). */
const SISTERS: {site: GibiSite; name: string; href: string; ink: string}[] = [
    {site: 'gibiarena', name: 'GiBiArena', href: 'https://gibiarena.com', ink: 'text-brand-arena-text'},
    {site: 'gibifut', name: 'GiBiFUT', href: 'https://gibifut.com', ink: 'text-brand-fut-text'},
];

const link = "text-[15px] text-muted-foreground hover:text-foreground hover:underline underline-offset-4 decoration-2 transition-colors";

function romeDay(offset: number): string {
    const d = new Date(Date.now() + offset * 86_400_000);
    return new Intl.DateTimeFormat('en-CA', {timeZone: 'Europe/Rome'}).format(d);
}

function Column({title, children}: {title: string; children: React.ReactNode}) {
    return (
        <div className="flex flex-col gap-3">
            <h4 className="flex items-center gap-2 text-[13px] font-extrabold uppercase tracking-wide text-foreground">
                <span className="w-1 h-4 rounded-sm bg-accent border border-foreground/60" aria-hidden="true" />
                {title}
            </h4>
            <nav className="flex flex-col gap-2">{children}</nav>
        </div>
    );
}

/** Footer in the gibiarena.com layout: lockup and contact pill, four columns, the GiBiSociety line with the sister sites. */
export default function Footer() {
    const t = useTranslations('Common.footer');
    const year = new Date().getFullYear();
    const pinned = FEATURED_COMPETITIONS.filter((c) => c.slug && ['serie-a', 'champions-league', 'premier-league', 'la-liga', 'bundesliga', 'ligue-1'].includes(c.slug));

    return (
        <footer className="mt-auto w-full bg-background border-t-[2.5px] border-foreground">
            <div className="max-w-[1400px] mx-auto px-4 md:px-6 py-8 md:py-14">
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-5 mb-8 md:mb-10">
                    <Link href="/" aria-label="GiBiScore" className="self-start">
                        <BrandLockup height={48} />
                    </Link>
                    <div className="flex flex-wrap gap-3">
                        <a href={`mailto:${t('email')}`} className={pill}><Mail className="w-4 h-4" />{t('email')}</a>
                    </div>
                </div>

                {/* On a phone the sections are in the bottom menu: only the legal links stay. */}
                <div className="md:hidden flex flex-wrap gap-x-5 gap-y-2 mb-8">
                    <a href="https://gibiarena.com/privacy" className={link}>{t('columns.info.privacy')}</a>
                    <a href="https://gibiarena.com/terms" className={link}>{t('columns.info.terms')}</a>
                    <a href="https://gibiarena.com" className={link}>{t('columns.info.gibiarena')}</a>
                    <a href="https://gibifut.com" className={link}>{t('columns.info.gibifut')}</a>
                    <span className="text-[15px] text-muted-foreground">{t('columns.info.data')}</span>
                </div>
                <div className="hidden md:grid grid-cols-2 lg:grid-cols-4 gap-8 md:gap-6 mb-10">
                    <Column title={t('columns.scores.title')}>
                        <Link href="/" className={link}>{t('columns.scores.today')}</Link>
                        <Link href="/live" className={link}>{t('columns.scores.live')}</Link>
                        <Link href={`/scores/${romeDay(-1)}`} className={link}>{t('columns.scores.yesterday')}</Link>
                        <Link href={`/scores/${romeDay(1)}`} className={link}>{t('columns.scores.tomorrow')}</Link>
                    </Column>
                    <Column title={t('columns.competitions.title')}>
                        <Link href="/competitions" className={link}>{t('columns.competitions.all')}</Link>
                        {pinned.map((c) => (
                            <Link key={c.slug} href={`/competitions/${c.slug}`} className={link}>{c.name}</Link>
                        ))}
                    </Column>
                    <Column title={t('columns.stats.title')}>
                        <Link href="/stats" className={link}>{t('columns.stats.players')}</Link>
                        <Link href="/stats" className={link}>{t('columns.stats.scorers')}</Link>
                        <Link href="/injuries" className={link}>{t('columns.stats.injuries')}</Link>
                        <Link href="/predictions" className={link}>{t('columns.stats.predictions')}</Link>
                        <Link href="/predictions/record" className={link}>{t('columns.stats.record')}</Link>
                        <Link href="/fantacalcio" className={link}>{t('columns.stats.fantasy')}</Link>
                        <Link href="/compare" className={link}>{t('columns.stats.compare')}</Link>
                        <Link href="/search" className={link}>{t('columns.stats.search')}</Link>
                    </Column>
                    <Column title={t('columns.info.title')}>
                        <a href="https://gibiarena.com/privacy" className={link}>{t('columns.info.privacy')}</a>
                        <a href="https://gibiarena.com/terms" className={link}>{t('columns.info.terms')}</a>
                        <a href="https://gibiarena.com" className={link}>{t('columns.info.gibiarena')}</a>
                        <a href="https://gibifut.com" className={link}>{t('columns.info.gibifut')}</a>
                        <span className="text-[15px] text-muted-foreground">{t('columns.info.data')}</span>
                    </Column>
                </div>

                <p className="text-[13px] text-muted-foreground mb-6">{t('legal')}</p>
                <div className="h-[2px] bg-foreground/15 mb-6" />

                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 text-xs text-muted-foreground">
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                        <span className="inline-flex items-center gap-2">
                            <AdminLogoLink className="inline-flex"><BrandIcon site="gibisociety" size={22} accent={false} /></AdminLogoLink>
                            {t('productOf')} <b className="font-extrabold text-foreground">GiBi<span className="text-brand-society-text">Society</span></b>
                        </span>
                        {/* One label for all the sister sites, as on gibiarena.com: repeating
                            "Scopri anche" before each one made the line longer without saying more. */}
                        <span className="inline-flex flex-wrap items-center gap-x-3 gap-y-2">
                            <span>{t('discover')}</span>
                            {SISTERS.map((p) => (
                                <a key={p.site} href={p.href} target="_blank" rel="noopener noreferrer" title={p.name} className="inline-flex items-center gap-2 hover:text-foreground transition-colors">
                                    <BrandIcon site={p.site} size={22} accent={false} />
                                    <b className="font-extrabold text-foreground">GiBi<span className={p.ink}>{p.name.slice(4)}</span></b>
                                    <ArrowUpRight className="w-3.5 h-3.5" />
                                </a>
                            ))}
                        </span>
                    </div>
                    <p>© {year} {t('copyright')}</p>
                </div>
            </div>
        </footer>
    );
}
