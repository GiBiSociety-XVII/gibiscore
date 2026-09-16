import type {Metadata} from "next";
import {getTranslations, setRequestLocale} from "next-intl/server";
import {Link} from "@/i18n/navigation";
import {SiteShell} from "@/components/shell/site-shell";
import {PageHeader} from "@/components/football/page-header";
import {ModelView} from "@/components/fantasy/model-view";
import {getTypedPairs} from "@/lib/fantasy/calibration-data";

// The typed votes move a few times a day: ten minutes is plenty.
export const revalidate = 600;

export async function generateMetadata(): Promise<Metadata> {
    const t = await getTranslations('Fantasy.model');
    return {title: t('metaTitle'), description: t('metaDescription')};
}

export default async function ModelPage({params}: PageProps<"/[locale]/fantacalcio/modello">) {
    const {locale} = await params;
    setRequestLocale(locale);
    const t = await getTranslations('Fantasy.model');
    const pairs = await getTypedPairs('serie-a');
    return (
        <SiteShell wide sidebar={false}>
            <PageHeader title={t('title')} meta={t('intro')} aside={<span className="flex gap-1.5"><Link href="/fantacalcio/voti" className="bb-btn bg-accent px-3 h-8 inline-flex items-center text-[12px] font-extrabold">{t('toVotes')}</Link><Link href="/fantacalcio/formazione" className="bb-btn bg-card px-3 h-8 inline-flex items-center text-[12px] font-extrabold">{t('toLineup')}</Link></span>} />
            <ModelView pairs={pairs} />
        </SiteShell>
    );
}
