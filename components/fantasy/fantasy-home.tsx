'use client';

import {ArrowRight, ClipboardList, Gavel, Lock, Users} from "lucide-react";
import {useState} from "react";
import {useFormatter, useTranslations} from "next-intl";
import {Link} from "@/i18n/navigation";
import {cn} from "@/components/shared/ui/cn";
import {Panel} from "@/components/shell/panel";
import {totalSlots} from "@/lib/fantasy/config";
import {configStore, purchasesStore, teamsStore, useHydrated} from "@/lib/fantasy/store";
import {AccountTeamsBadge, useAccountTeams} from "./account-teams";

const ROME = 'Europe/Rome';

export interface NextRound {
    round: string;
    from: string;
    state: 'played' | 'live' | 'next' | 'future';
}

const roundName = (round: string) => (/^Regular Season - \d+$/.test(round) ? round.slice('Regular Season - '.length) : round);

/**
 * The fantasy front page as a dashboard: where the auction on this device
 * stands, every team of mine with a way straight into its lineup, the
 * round ahead and when it locks. Three steps for whoever is new.
 */
export function FantasyHome({round}: {round: NextRound | null}) {
    const t = useTranslations('Fantasy.home');
    const ts = useTranslations('Fantasy.setup');
    const format = useFormatter();
    const hydrated = useHydrated();
    const config = configStore.useValue();
    const purchases = purchasesStore.useValue();
    const saved = teamsStore.useValue();
    const account = useAccountTeams();
    // The clock as of this render: enough to say whether the round has kicked off.
    const [now] = useState(() => Date.now());
    const when = (iso: string) => format.dateTime(new Date(iso), {weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: ROME});
    const locked = round ? round.state === 'live' || round.state === 'played' || Date.parse(round.from) <= now : false;

    const managers = config ? (config.managers.length > 0 ? config.managers : [t('dash.defaultTeam')]) : [];
    const me = config ? Math.min(config.me, Math.max(0, managers.length - 1)) : 0;
    const mine = config ? purchases.filter((p) => p.manager === me) : [];
    const spent = mine.reduce((s, p) => s + p.price, 0);
    const slots = config ? totalSlots(config.slots) : 0;
    const teams = [...saved.teams].sort((a, b) => a.leagueName.localeCompare(b.leagueName) || a.name.localeCompare(b.name));
    const tile = "bb-surface p-4 flex flex-col gap-3 min-h-[180px]";
    const cta = "bb-btn bg-accent px-4 h-10 inline-flex items-center gap-2 self-start text-[13px] font-extrabold";

    return (
        <div className="flex flex-col gap-3">
            <div className="grid gap-3 grid-cols-1 md:grid-cols-2 items-stretch">
                {/* The auction on this device */}
                <section className={tile}>
                    <h2 className="flex items-center gap-2 text-[13px] font-extrabold uppercase tracking-wide"><Gavel className="w-4 h-4" aria-hidden="true" />{t('auctionTitle')}</h2>
                    {!hydrated ? (
                        <p className="text-[13px] font-semibold text-muted-foreground">…</p>
                    ) : config ? (
                        <>
                            <div className="flex flex-col gap-0.5">
                                <span className="text-[17px] font-extrabold leading-tight">{config.name || ts(`leagues.${config.league}`)}</span>
                                <span className="text-[12px] font-semibold text-muted-foreground">{ts(`modes.${config.mode}`)} · {config.participants} × {config.credits} cr. · {managers[me]}</span>
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                                <div className="rounded-lg border-2 border-foreground/20 bg-card px-3 py-2 flex flex-col">
                                    <span className={cn("font-mono text-2xl font-extrabold tabular-nums leading-none", config.credits - spent < 0 && "text-red-700")}>{config.credits - spent}</span>
                                    <span className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">{t('dash.creditsLeft')}</span>
                                </div>
                                <div className="rounded-lg border-2 border-foreground/20 bg-card px-3 py-2 flex flex-col">
                                    <span className="font-mono text-2xl font-extrabold tabular-nums leading-none">{mine.length}<span className="text-base text-muted-foreground">/{slots}</span></span>
                                    <span className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">{t('dash.rosterFilled')}</span>
                                </div>
                            </div>
                            <Link href="/fantacalcio/asta" className={cn(cta, "mt-auto")}>{mine.length >= slots ? t('dash.openAuction') : t('dash.continueAuction')}<ArrowRight className="w-4 h-4" aria-hidden="true" /></Link>
                        </>
                    ) : (
                        <>
                            <p className="text-[13px] font-semibold">{t('auctionText')}</p>
                            <Link href="/fantacalcio/asta" className={cn(cta, "mt-auto")}>{t('dash.setupAuction')}<ArrowRight className="w-4 h-4" aria-hidden="true" /></Link>
                        </>
                    )}
                </section>

                {/* The round ahead and every team of mine */}
                <section className={tile}>
                    <h2 className="flex items-center gap-2 text-[13px] font-extrabold uppercase tracking-wide"><ClipboardList className="w-4 h-4" aria-hidden="true" />{t('lineupTitle')}</h2>
                    {round && (
                        <div className="flex flex-wrap items-center gap-2">
                            <span className="text-[17px] font-extrabold leading-tight">{t('dash.round', {round: roundName(round.round)})}</span>
                            <span className={cn("inline-flex items-center gap-1.5 h-7 px-2.5 rounded-md border-2 border-foreground text-[12px] font-extrabold", locked ? "bg-amber-200" : "bg-emerald-200")}>
                                <Lock className="w-3.5 h-3.5" aria-hidden="true" />
                                {locked ? t('dash.locked') : t('dash.locksAt', {when: when(round.from)})}
                            </span>
                        </div>
                    )}
                    {!hydrated ? (
                        <p className="text-[13px] font-semibold text-muted-foreground">…</p>
                    ) : teams.length === 0 ? (
                        <p className="text-[13px] font-semibold text-muted-foreground">{t('dash.noTeams')}</p>
                    ) : (
                        <ul className="flex flex-col divide-y divide-muted rounded-lg border-2 border-foreground/20 bg-card overflow-hidden">
                            {teams.map((team) => (
                                <li key={team.id}>
                                    <Link href="/fantacalcio/formazione" onClick={() => teamsStore.write({...saved, current: team.id})} className="flex items-center gap-2 px-3 h-10 hover:bg-muted">
                                        <Users className="w-4 h-4 text-muted-foreground shrink-0" aria-hidden="true" />
                                        <span className="flex flex-col leading-tight min-w-0">
                                            <span className="text-[13px] font-extrabold truncate">{team.name}</span>
                                            <span className="text-[10px] font-semibold text-muted-foreground truncate">{team.leagueName || ts(`leagues.${team.league}`)} · {t('dash.players', {count: team.players.length})}</span>
                                        </span>
                                        <span className="ml-auto inline-flex items-center gap-1 text-[12px] font-extrabold">{t('dash.openLineup')}<ArrowRight className="w-3.5 h-3.5" aria-hidden="true" /></span>
                                    </Link>
                                </li>
                            ))}
                        </ul>
                    )}
                    <div className="mt-auto flex items-center justify-between gap-2 flex-wrap">
                        <AccountTeamsBadge status={account.status} next="/fantacalcio" />
                        {teams.length > 0 && <Link href="/fantacalcio/formazione" className={cta}>{t('lineupCta')}<ArrowRight className="w-4 h-4" aria-hidden="true" /></Link>}
                    </div>
                </section>
            </div>

            {/* Three steps, for whoever is new */}
            <Panel title={t('dash.howTitle')}>
                <ol className="grid grid-cols-1 sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-muted">
                    {(['step1', 'step2', 'step3'] as const).map((k, i) => (
                        <li key={k} className="px-3 py-3 flex gap-3">
                            <span className="inline-flex w-7 h-7 shrink-0 items-center justify-center rounded-full bg-foreground text-background font-mono text-[13px] font-extrabold">{i + 1}</span>
                            <span className="flex flex-col gap-0.5">
                                <span className="text-[13px] font-extrabold">{t(`dash.${k}Title`)}</span>
                                <span className="text-[12px] font-semibold text-muted-foreground">{t(`dash.${k}Text`)}</span>
                            </span>
                        </li>
                    ))}
                </ol>
            </Panel>
        </div>
    );
}
