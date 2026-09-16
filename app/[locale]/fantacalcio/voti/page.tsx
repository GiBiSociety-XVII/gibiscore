import type {Metadata} from "next";
import {getTranslations, setRequestLocale} from "next-intl/server";
import {Link} from "@/i18n/navigation";
import {SiteShell} from "@/components/shell/site-shell";
import {PageHeader} from "@/components/football/page-header";
import {VotesBookView} from "@/components/fantasy/votes-book";
import {getMatchday} from "@/lib/fantasy/matchday-data";
import {getVotesBook} from "@/lib/fantasy/votes-data";
import {DEFAULT_CALIBRATION} from "@/lib/fantasy/voto";

// Static: the book moves when a round ends or votes are saved (both revalidate its tags).
export const revalidate = 300;

export async function generateMetadata(): Promise<Metadata> {
    const t = await getTranslations('Fantasy.votes');
    return {title: t('metaTitle'), description: t('metaDescription')};
}

export default async function VotesPage({params}: PageProps<"/[locale]/fantacalcio/voti">) {
    const {locale} = await params;
    setRequestLocale(locale);
    const t = await getTranslations('Fantasy.votes');
    const [book, matchday] = await Promise.all([getVotesBook('serie-a'), getMatchday('serie-a')]);
    return (
        <SiteShell wide sidebar={false}>
            <PageHeader title={t('title')} meta={t('intro')} aside={<span className="flex gap-1.5"><Link href="/fantacalcio/modello" className="bb-btn bg-card px-3 h-8 inline-flex items-center text-[12px] font-extrabold">{t('toModel')}</Link><Link href="/fantacalcio/formazione" className="bb-btn bg-card px-3 h-8 inline-flex items-center text-[12px] font-extrabold">{t('toLineup')}</Link></span>} />
            {book ? <VotesBookView book={book} calibration={matchday?.calibration ?? DEFAULT_CALIBRATION} /> : <p className="bb-surface px-3 py-3 text-[13px] font-semibold text-muted-foreground">{t('unavailable')}</p>}
        </SiteShell>
    );
}
