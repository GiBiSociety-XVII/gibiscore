import type {Metadata} from "next";
import Image from "next/image";
import {Search} from "lucide-react";
import {getTranslations, setRequestLocale} from "next-intl/server";
import {Link} from "@/i18n/navigation";
import {SiteShell, Panel} from "@/components/shell/site-shell";
import {Flag} from "@/components/football/flag";
import {PageHeader} from "@/components/football/page-header";
import {TeamCrest} from "@/components/football/team-crest";
import {normalizePosition} from "@/lib/football/data/matches";
import {search} from "@/lib/football/data/search";

export async function generateMetadata(): Promise<Metadata> {
    const t = await getTranslations('Pages.search');
    return {title: t('metaTitle'), robots: {index: false}};
}

export default async function SearchPage({params, searchParams}: PageProps<"/[locale]/search">) {
    const {locale} = await params;
    const {q} = await searchParams;
    setRequestLocale(locale);
    const t = await getTranslations('Pages.search');
    const tFootball = await getTranslations('Football');
    const query = (Array.isArray(q) ? q[0] : q) ?? '';
    const results = await search(query);
    const total = results.teams.length + results.players.length + results.competitions.length;

    return (
        <SiteShell wide>
            <PageHeader title={results.query ? t('title', {query: results.query}) : t('metaTitle')} />
            <form action="/search" method="get" className="flex items-center gap-2 bb-input px-3 h-11 max-w-xl">
                <Search className="w-4 h-4 shrink-0" />
                <input type="search" name="q" defaultValue={results.query} placeholder={t('placeholder')} aria-label={t('placeholder')} autoFocus className="w-full bg-transparent outline-none text-[14px] font-semibold" />
                <button type="submit" className="bb-btn bg-accent px-3 py-1 text-xs">{t('button')}</button>
            </form>

            {results.query.length > 0 && results.query.length < 2 && <p className="text-sm font-semibold text-muted-foreground">{t('tooShort')}</p>}
            {results.query.length >= 2 && total === 0 && <p className="text-sm font-semibold text-muted-foreground">{t('empty', {query: results.query})}</p>}

            {total > 0 && (
                <div className="grid gap-3 grid-cols-1 lg:grid-cols-3 items-start">
                    {results.teams.length > 0 && (
                        <Panel title={`${t('teams')} · ${results.teams.length}`}>
                            <ul className="flex flex-col">
                                {results.teams.map((team) => (
                                    <li key={team.id}>
                                        <Link href={`/teams/${team.slug}`} className="flex items-center gap-2.5 px-3 h-10 border-t border-muted first:border-t-0 hover:bg-muted/60">
                                            <TeamCrest team={team} size={22} />
                                            <span className="flex flex-col leading-tight min-w-0">
                                                <span className="text-[13px] font-bold truncate">{team.name}</span>
                                                {team.country && <span className="text-[11px] font-semibold text-muted-foreground">{team.country}</span>}
                                            </span>
                                        </Link>
                                    </li>
                                ))}
                            </ul>
                        </Panel>
                    )}
                    {results.players.length > 0 && (
                        <Panel title={`${t('players')} · ${results.players.length}`}>
                            <ul className="flex flex-col">
                                {results.players.map((p) => {
                                    const pos = normalizePosition(p.position) ?? 'unknown';
                                    return (
                                        <li key={p.id}>
                                            <Link href={`/players/${p.slug}`} className="flex items-center gap-2.5 px-3 h-10 border-t border-muted first:border-t-0 hover:bg-muted/60">
                                                <span className="inline-flex w-6 h-6 rounded-full bg-muted overflow-hidden shrink-0">
                                                    {p.imageUrl && <Image src={p.imageUrl} alt="" width={24} height={24} unoptimized className="object-cover" />}
                                                </span>
                                                <span className="flex flex-col leading-tight min-w-0">
                                                    <span className="text-[13px] font-bold truncate">{p.name}</span>
                                                    <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-muted-foreground truncate">
                                                        {p.team && <TeamCrest team={p.team} size={12} />}
                                                        {p.team ? `${p.team.name} · ` : ''}{tFootball(`positions.${pos as 'goalkeeper'}`)}
                                                    </span>
                                                </span>
                                            </Link>
                                        </li>
                                    );
                                })}
                            </ul>
                        </Panel>
                    )}
                    {results.competitions.length > 0 && (
                        <Panel title={`${t('competitions')} · ${results.competitions.length}`}>
                            <ul className="flex flex-col">
                                {results.competitions.map((c) => (
                                    <li key={c.id}>
                                        <Link href={`/competitions/${c.slug}`} className="flex items-center gap-2.5 px-3 h-10 border-t border-muted first:border-t-0 hover:bg-muted/60">
                                            <Flag code={c.countryCode} logoUrl={c.logoUrl} size={18} />
                                            <span className="flex flex-col leading-tight min-w-0">
                                                <span className="text-[13px] font-bold truncate">{c.name}</span>
                                                <span className="text-[11px] font-semibold text-muted-foreground truncate">{c.country}</span>
                                            </span>
                                        </Link>
                                    </li>
                                ))}
                            </ul>
                        </Panel>
                    )}
                </div>
            )}
        </SiteShell>
    );
}
