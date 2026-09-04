import type {Metadata} from "next";
import {getTranslations, setRequestLocale} from "next-intl/server";
import {SiteShell} from "@/components/shell/site-shell";
import {ScoresRail} from "@/components/football/rail";
import {ScoresView} from "@/components/football/scores-view";
import {getScores} from "@/lib/football/data/scores";

export const revalidate = 15;

export async function generateMetadata(): Promise<Metadata> {
    const t = await getTranslations('Pages.scores');
    return {title: t('liveMetaTitle'), description: t('metaDescription')};
}

export default async function LivePage({params}: PageProps<"/[locale]/live">) {
    const {locale} = await params;
    setRequestLocale(locale);
    const page = await getScores({mode: 'live'});
    return (
        <SiteShell rail={<ScoresRail page={page} />}>
            <ScoresView page={page} />
        </SiteShell>
    );
}
