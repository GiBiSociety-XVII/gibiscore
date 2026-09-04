import type {Metadata} from "next";
import {notFound} from "next/navigation";
import {getFormatter, getTranslations, setRequestLocale} from "next-intl/server";
import {SiteShell} from "@/components/shell/site-shell";
import {ScoresRail} from "@/components/football/rail";
import {ScoresView} from "@/components/football/scores-view";
import {getScores, isIsoDay} from "@/lib/football/data/scores";

// Any day, past or future. Rebuilt every 5 minutes (today lives at /).
export const revalidate = 300;

export async function generateMetadata({params}: PageProps<"/[locale]/scores/[date]">): Promise<Metadata> {
    const {date} = await params;
    const t = await getTranslations('Pages.scores');
    const format = await getFormatter();
    if (!isIsoDay(date)) return {title: t('metaTitle')};
    return {title: t('dayMetaTitle', {date: format.dateTime(new Date(`${date}T12:00:00Z`), {day: 'numeric', month: 'long', year: 'numeric'})}), description: t('metaDescription')};
}

export default async function ScoresDayPage({params}: PageProps<"/[locale]/scores/[date]">) {
    const {locale, date} = await params;
    setRequestLocale(locale);
    if (!isIsoDay(date)) notFound();
    const page = await getScores({mode: 'day', date});
    return (
        <SiteShell rail={<ScoresRail page={page} />}>
            <ScoresView page={page} />
        </SiteShell>
    );
}
