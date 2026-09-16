import type {Metadata} from "next";
import {getTranslations, setRequestLocale} from "next-intl/server";
import {Link} from "@/i18n/navigation";
import {SiteShell} from "@/components/shell/site-shell";
import {PageHeader} from "@/components/football/page-header";
import {AdminGate} from "@/components/admin/admin-gate";
import {VotesBookView} from "@/components/fantasy/votes-book";
import {getMatchday} from "@/lib/fantasy/matchday-data";
import {getVotesBook} from "@/lib/fantasy/votes-data";
import {DEFAULT_CALIBRATION} from "@/lib/fantasy/voto";

// Rendered on request: the administrator's page only, and what it shows must be the database of now,
// never a copy from before a save. The book itself is cached (votes-data) and refreshed by every save.
// The page shows itself to the administrator's session only; the votes route checks it server-side.
export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
    const t = await getTranslations('Fantasy.votes');
    return {title: t('metaTitle'), robots: {index: false, follow: false}};
}

export default async function AdminVotesPage({params}: PageProps<"/[locale]/admin/voti">) {
    const {locale} = await params;
    setRequestLocale(locale);
    const t = await getTranslations('Fantasy.votes');
    const [book, matchday] = await Promise.all([getVotesBook('serie-a'), getMatchday('serie-a')]);
    return (
        <SiteShell wide sidebar={false}>
            <AdminGate>
                <PageHeader title={t('title')} meta={t('intro')} aside={<span className="flex gap-1.5"><Link href="/admin" className="bb-btn bg-card px-3 h-8 inline-flex items-center text-[12px] font-extrabold">{t('toAdmin')}</Link><Link href="/fantacalcio/modello" className="bb-btn bg-card px-3 h-8 inline-flex items-center text-[12px] font-extrabold">{t('toModel')}</Link></span>} />
                {book ? <VotesBookView book={book} calibration={matchday?.calibration ?? DEFAULT_CALIBRATION} /> : <p className="bb-surface px-3 py-3 text-[13px] font-semibold text-muted-foreground">{t('unavailable')}</p>}
            </AdminGate>
        </SiteShell>
    );
}
