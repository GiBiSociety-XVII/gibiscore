'use client';

import {AlertTriangle, ArrowRight, CheckCircle2, ClipboardList, Cloud, Gavel, Lock, Plus, Smartphone, Users} from "lucide-react";
import {useEffect, useState} from "react";
import {useFormatter, useTranslations} from "next-intl";
import {Link, useRouter} from "@/i18n/navigation";
import {cn} from "@/components/shared/ui/cn";
import {Panel} from "@/components/shell/panel";
import {totalSlots} from "@/lib/fantasy/config";
import {listAuctions, loadAuction, type CloudAuction} from "@/lib/fantasy/cloud";
import {advisedStarters, teamAlerts, type AlertKind, type StatusResponse} from "@/lib/fantasy/alerts";
import {cloudStore, configStore, locksStore, purchasesStore, teamsStore, useHydrated} from "@/lib/fantasy/store";
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
    const tl = useTranslations('Fantasy.lineup');
    const ta = useTranslations('Fantasy.auction');
    const tc = useTranslations('Fantasy.cloud');
    const format = useFormatter();
    const router = useRouter();
    const hydrated = useHydrated();
    const config = configStore.useValue();
    const purchases = purchasesStore.useValue();
    const link = cloudStore.useValue();
    const saved = teamsStore.useValue();
    const locks = locksStore.useValue();
    const account = useAccountTeams();
    // Where the players of my teams stand for the round (official lineups, absences): asked once, again every five minutes while the tab is open.
    const idsKey = [...new Set(saved.teams.flatMap((team) => team.players))].sort((a, b) => a - b).join(',');
    const [status, setStatus] = useState<StatusResponse | null>(null);
    useEffect(() => {
        if (!idsKey) return;
        let alive = true;
        const load = () => {
            if (document.visibilityState !== 'visible') return;
            fetch(`/api/fantasy/status?ids=${idsKey}`)
                .then((r) => (r.ok ? (r.json() as Promise<StatusResponse>) : null))
                .then((data) => { if (alive && data) setStatus(data); })
                .catch(() => undefined);
        };
        load();
        const id = window.setInterval(load, 5 * 60_000);
        document.addEventListener('visibilitychange', load);
        return () => {
            alive = false;
            window.clearInterval(id);
            document.removeEventListener('visibilitychange', load);
        };
    }, [idsKey]);
    const alertLabel = (kind: AlertKind) => (kind === 'benchOfficial' ? tl('status.official.bench') : kind === 'outOfficial' ? tl('status.official.out') : tl(`status.${kind}`));
    // The auctions saved in the account, newest first; the one open on this device is marked.
    const [cloud, setCloud] = useState<CloudAuction[] | null>(null);
    const [busy, setBusy] = useState<string | null>(null);
    const userId = account.user?.id ?? null;
    useEffect(() => {
        if (!userId) return;
        let alive = true;
        listAuctions().then((rows) => { if (alive) setCloud(rows); }).catch(() => { if (alive) setCloud([]); });
        return () => { alive = false; };
    }, [userId]);
    /** Opens a saved auction on this device (asking first when the one here is not in the cloud), then the board. */
    const openCloud = async (row: CloudAuction) => {
        if (link?.id === row.id) { router.push('/fantacalcio/asta'); return; }
        if (config && !link && purchases.length > 0 && !window.confirm(tc('loadConfirm'))) return;
        setBusy(row.id);
        try {
            const data = await loadAuction(row.id);
            if (!data) { setCloud((rows) => (rows ?? []).filter((r) => r.id !== row.id)); return; }
            configStore.write(data.config);
            purchasesStore.write(data.purchases);
            cloudStore.write({id: row.id, savedAt: row.updatedAt});
            router.push('/fantacalcio/asta');
        } finally {
            setBusy(null);
        }
    };
    /** A new auction: the one here is kept in the cloud when linked, asked about when not, then the setup opens. */
    const newAuction = () => {
        if (config && !link && !window.confirm(ta('resetConfirm'))) return;
        purchasesStore.write([]);
        configStore.write(null);
        cloudStore.write(null);
        router.push('/fantacalcio/asta');
    };
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
                {/* Every auction of mine: the ones in the account and the one on this device */}
                <section className={tile}>
                    <h2 className="flex items-center gap-2 text-[13px] font-extrabold uppercase tracking-wide"><Gavel className="w-4 h-4" aria-hidden="true" />{t('auctionTitle')}</h2>
                    {!hydrated ? (
                        <p className="text-[13px] font-semibold text-muted-foreground">…</p>
                    ) : !config && (cloud ?? []).length === 0 ? (
                        <p className="text-[13px] font-semibold text-muted-foreground">{userId ? t('dash.noAuctions') : t('auctionText')}</p>
                    ) : (
                        <ul className="flex flex-col divide-y divide-muted rounded-lg border-2 border-foreground/20 bg-card overflow-hidden">
                            {config && !link && (
                                <li>
                                    <Link href="/fantacalcio/asta" className="flex items-center gap-2 px-3 h-12 hover:bg-muted bg-accent/15">
                                        <Smartphone className="w-4 h-4 text-muted-foreground shrink-0" aria-hidden="true" />
                                        <span className="flex flex-col leading-tight min-w-0">
                                            <span className="text-[13px] font-extrabold truncate">{config.name || ts(`leagues.${config.league}`)} <span className="bb-badge bg-accent text-[9px] h-4 px-1 align-middle">{t('dash.currentAuction')}</span></span>
                                            <span className="text-[10px] font-semibold text-muted-foreground truncate">{t('dash.onDevice')} · {ts(`modes.${config.mode}`)} · {config.participants} × {config.credits} cr. · {t('dash.rosterOf', {filled: mine.length, total: slots, credits: config.credits - spent})}</span>
                                        </span>
                                        <span className="ml-auto inline-flex items-center gap-1 text-[12px] font-extrabold shrink-0">{t('dash.continueAuction')}<ArrowRight className="w-3.5 h-3.5" aria-hidden="true" /></span>
                                    </Link>
                                </li>
                            )}
                            {(cloud ?? []).map((row) => {
                                const current = link?.id === row.id;
                                return (
                                    <li key={row.id}>
                                        <button type="button" onClick={() => void openCloud(row)} disabled={busy !== null} className={cn("w-full flex items-center gap-2 px-3 h-12 text-left hover:bg-muted disabled:opacity-60", current && "bg-accent/15")}>
                                            <Cloud className="w-4 h-4 text-muted-foreground shrink-0" aria-hidden="true" />
                                            <span className="flex flex-col leading-tight min-w-0">
                                                <span className="text-[13px] font-extrabold truncate">{row.name} {current && <span className="bb-badge bg-accent text-[9px] h-4 px-1 align-middle">{t('dash.currentAuction')}</span>}</span>
                                                <span className="text-[10px] font-semibold text-muted-foreground truncate">
                                                    {current && config ? `${ts(`modes.${config.mode}`)} · ${config.participants} × ${config.credits} cr. · ${t('dash.rosterOf', {filled: mine.length, total: slots, credits: config.credits - spent})}` : `${ts(`leagues.${row.league}`)} · ${t('dash.purchases', {count: row.purchasesCount})} · ${format.dateTime(new Date(row.updatedAt), {day: 'numeric', month: 'short', timeZone: ROME})}`}
                                                </span>
                                            </span>
                                            <span className="ml-auto inline-flex items-center gap-1 text-[12px] font-extrabold shrink-0">{busy === row.id ? '…' : current ? t('dash.continueAuction') : t('dash.openAuction')}<ArrowRight className="w-3.5 h-3.5" aria-hidden="true" /></span>
                                        </button>
                                    </li>
                                );
                            })}
                        </ul>
                    )}
                    <div className="mt-auto flex items-center justify-between gap-2 flex-wrap">
                        <AccountTeamsBadge status={account.status} next="/fantacalcio" />
                        <button type="button" onClick={newAuction} className={cta}><Plus className="w-4 h-4" aria-hidden="true" />{t('dash.newAuction')}</button>
                    </div>
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
                            {teams.map((team) => {
                                const alerts = status ? teamAlerts(team, status.players, advisedStarters(team, locks[team.id], status.round)) : null;
                                const bad = alerts ? alerts.starters.filter((a) => a.kind !== 'doubtful' && a.kind !== 'benchOfficial') : [];
                                return (
                                    <li key={team.id} className="flex flex-col">
                                        <Link href="/fantacalcio/formazione" onClick={() => teamsStore.write({...saved, current: team.id})} className="flex items-center gap-2 px-3 h-10 hover:bg-muted">
                                            <Users className="w-4 h-4 text-muted-foreground shrink-0" aria-hidden="true" />
                                            <span className="flex flex-col leading-tight min-w-0">
                                                <span className="text-[13px] font-extrabold truncate">{team.name}</span>
                                                <span className="text-[10px] font-semibold text-muted-foreground truncate">{team.leagueName || ts(`leagues.${team.league}`)} · {t('dash.players', {count: team.players.length})}</span>
                                            </span>
                                            <span className="ml-auto inline-flex items-center gap-1 text-[12px] font-extrabold">{t('dash.openLineup')}<ArrowRight className="w-3.5 h-3.5" aria-hidden="true" /></span>
                                        </Link>
                                        {/* The alerts: a starter out, in doubt or left out of the official lineup; the rest of the roster only when out */}
                                        {alerts && (alerts.starters.length > 0 || alerts.others.length > 0 || alerts.hasLineup) && (
                                            <div className={cn("px-3 pb-2 -mt-1 flex flex-wrap items-center gap-1 text-[11px] font-bold", bad.length > 0 ? "text-red-800" : alerts.starters.length > 0 ? "text-amber-800" : "text-emerald-800")}>
                                                {alerts.starters.length === 0 && alerts.hasLineup && <span className="inline-flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />{t('dash.alertsOk')}</span>}
                                                {alerts.starters.length > 0 && <AlertTriangle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />}
                                                {alerts.starters.slice(0, 5).map((a) => (
                                                    <span key={a.playerId} className={cn("inline-flex items-center gap-1 h-5 px-1.5 rounded border", a.kind === 'doubtful' || a.kind === 'benchOfficial' ? "border-amber-700/40 bg-amber-100" : "border-red-700/40 bg-red-100")} title={a.description ?? undefined}>{a.name} · {alertLabel(a.kind)}</span>
                                                ))}
                                                {alerts.starters.length > 5 && <span>+{alerts.starters.length - 5}</span>}
                                                {alerts.others.length > 0 && <span className="text-muted-foreground font-semibold" title={alerts.others.map((a) => `${a.name} · ${alertLabel(a.kind)}`).join(', ')}>{t('dash.alertsOthers', {count: alerts.others.length, names: alerts.others.slice(0, 3).map((a) => a.name).join(', ')})}</span>}
                                            </div>
                                        )}
                                    </li>
                                );
                            })}
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
