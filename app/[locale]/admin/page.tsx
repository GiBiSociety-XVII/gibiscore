import type {Metadata} from "next";
import {Activity, BarChart3, PenLine} from "lucide-react";
import {getTranslations, setRequestLocale} from "next-intl/server";
import {Link} from "@/i18n/navigation";
import {SiteShell} from "@/components/shell/site-shell";
import {PageHeader} from "@/components/football/page-header";
import {AdminGate} from "@/components/admin/admin-gate";
import {ListNamesButton} from "@/components/admin/list-names-button";

export const metadata: Metadata = {robots: {index: false, follow: false}};

export default async function AdminPage({params}: PageProps<"/[locale]/admin">) {
    const {locale} = await params;
    setRequestLocale(locale);
    const t = await getTranslations('Admin');
    const tools = [
        {href: '/admin/voti', Icon: PenLine, title: t('tools.votes.title'), text: t('tools.votes.text')},
        {href: '/fantacalcio/modello', Icon: BarChart3, title: t('tools.model.title'), text: t('tools.model.text')},
        {href: '/admin/sync', Icon: Activity, title: t('tools.sync.title'), text: t('tools.sync.text')},
    ] as const;
    return (
        <SiteShell wide sidebar={false}>
            <AdminGate>
                <PageHeader title={t('title')} meta={t('intro')} />
                <ul className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
                    {tools.map(({href, Icon, title, text}) => (
                        <li key={href}>
                            <Link href={href} className="bb-surface flex items-center gap-3 px-4 py-4 hover:bg-muted">
                                <span className="inline-flex w-10 h-10 shrink-0 items-center justify-center rounded-lg border-2 border-foreground bg-accent"><Icon className="w-5 h-5" aria-hidden="true" /></span>
                                <span className="flex flex-col gap-0.5 min-w-0">
                                    <span className="text-[14px] font-extrabold">{title}</span>
                                    <span className="text-[12px] font-semibold text-muted-foreground">{text}</span>
                                </span>
                            </Link>
                        </li>
                    ))}
                    <li><ListNamesButton /></li>
                </ul>
            </AdminGate>
        </SiteShell>
    );
}
