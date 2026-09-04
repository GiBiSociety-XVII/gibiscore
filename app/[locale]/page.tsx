import type {Metadata} from "next";
import {getTranslations, setRequestLocale} from "next-intl/server";
import {SiteShell} from "@/components/shell/site-shell";
import {ScoresRail} from "@/components/football/rail";
import {ScoresView} from "@/components/football/scores-view";
import {getScores, romeDate} from "@/lib/football/data/scores";

// Today's scores: the front page of the site. Rebuilt every minute.
export const revalidate = 60;

export async function generateMetadata(): Promise<Metadata> {
    const t = await getTranslations('Pages.scores');
    return {title: {absolute: `GiBiScore · ${t('metaTitle')}`}, description: t('metaDescription')};
}

export default async function HomePage({params}: PageProps<"/[locale]">) {
    const {locale} = await params;
    setRequestLocale(locale);
    const page = await getScores({mode: 'day', date: romeDate(new Date())});
    return (
        <SiteShell rail={<ScoresRail page={page} />}>
            <ScoresView page={page} />
        </SiteShell>
    );
}
