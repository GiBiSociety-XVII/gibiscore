import {ArrowUpRight, Mail} from "lucide-react";
import {useTranslations} from "next-intl";
import {Link} from "@/i18n/navigation";
import {FEATURED_COMPETITIONS} from "@/lib/football/competitions";
import {BrandIcon, BrandLockup} from "./logo";

const pill = "inline-flex items-center gap-2 h-11 px-4 rounded-xl border-[2.5px] border-foreground bg-card text-[15px] font-bold shadow-[4px_4px_0_rgb(var(--foreground))] hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-[2px_2px_0_rgb(var(--foreground))] transition-all whitespace-nowrap";
const link = "text-[15px] text-muted-foreground hover:text-foreground hover:underline underline-offset-4 decoration-2 transition-colors";

function InstagramIcon() {
    return (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4" aria-hidden="true">
            <rect width="20" height="20" x="2" y="2" rx="5" ry="5" />
            <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
            <line x1="17.5" x2="17.51" y1="6.5" y2="6.5" />
        </svg>
    );
}

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

/** Footer in the gibiarena.com layout: lockup and contact pills, four columns, GiBiSociety line. */
export default function Footer() {
    const t = useTranslations('Common.footer');
    const year = new Date().getFullYear();
    const pinned = FEATURED_COMPETITIONS.filter((c) => c.slug && ['serie-a', 'champions-league', 'premier-league', 'la-liga', 'bundesliga', 'ligue-1'].includes(c.slug));

    return (
        <footer className="mt-auto w-full bg-background border-t-[2.5px] border-foreground">
            <div className="max-w-[1400px] mx-auto px-4 md:px-6 py-10 md:py-14">
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-5 mb-10">
                    <Link href="/" aria-label="GiBiScore" className="self-start">
                        <BrandLockup height={48} />
                    </Link>
                    <div className="flex flex-wrap gap-3">
                        <a href={`mailto:${t('email')}`} className={pill}><Mail className="w-4 h-4" />{t('email')}</a>
                        <a href="https://instagram.com/gibiarena" target="_blank" rel="noopener noreferrer" className={pill}><InstagramIcon />{t('instagram')}</a>
                    </div>
                </div>

                <div className="grid grid-cols-2 lg:grid-cols-4 gap-8 md:gap-6 mb-10">
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
                        <Link href="/fantacalcio" className={link}>{t('columns.stats.fantasy')}</Link>
                        <Link href="/compare" className={link}>{t('columns.stats.compare')}</Link>
                        <Link href="/search" className={link}>{t('columns.stats.search')}</Link>
                    </Column>
                    <Column title={t('columns.info.title')}>
                        <a href="https://gibiarena.com/privacy" className={link}>{t('columns.info.privacy')}</a>
                        <a href="https://gibiarena.com/terms" className={link}>{t('columns.info.terms')}</a>
                        <a href="https://gibiarena.com" className={link}>{t('columns.info.gibiarena')}</a>
                        <span className="text-[15px] text-muted-foreground">{t('columns.info.data')}</span>
                    </Column>
                </div>

                <div className="h-[2px] bg-foreground/15 mb-6" />

                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 text-[14px] text-muted-foreground">
                    <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
                        <span className="inline-flex items-center gap-2">
                            <BrandIcon site="gibisociety" size={26} />
                            {t('productOf')} <b className="font-extrabold text-foreground">GiBi<span className="text-brand-society-text">Society</span></b>
                        </span>
                        <a href="https://gibiarena.com" className="inline-flex items-center gap-2 hover:text-foreground transition-colors">
                            <BrandIcon site="gibiarena" size={26} />
                            {t('discover')} <b className="font-extrabold text-foreground">GiBi<span className="text-brand-arena-text">Arena</span></b>
                            <ArrowUpRight className="w-3.5 h-3.5" />
                        </a>
                    </div>
                    <p>© {year} {t('copyright')}</p>
                </div>
            </div>
        </footer>
    );
}
