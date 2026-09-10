'use client';

import {Activity, ArrowLeftRight, ChevronDown, ChevronUp, Lightbulb, Pencil, Search, Settings2, Undo2, X} from "lucide-react";
import {useEffect, useMemo, useRef, useState} from "react";
import {useFormatter, useTranslations} from "next-intl";
import {Link, useRouter} from "@/i18n/navigation";
import {Badge} from "@/components/shared/ui/badge";
import {cn} from "@/components/shared/ui/cn";
import {Panel} from "@/components/shell/panel";
import {TeamCrest} from "@/components/football/team-crest";
import {AuctionSetup} from "./auction-setup";
import {CloudMenu, CloudPanel} from "./cloud-panel";
import {CompareDialog} from "./compare-dialog";
import {RoleBadge} from "./role-badge";
import {TeamRecap} from "./team-report";
import {TeamsDialog, type TeamsTab} from "./teams-dialog";
import {HEALTH_CLASS, StrategyPanel, useHealthReason} from "./strategy-panel";
import {TableBar} from "./table-bar";
import {TierBadge, TierList, TierWhy} from "./tier-list";
import {DEFAULT_RULES, ROLE_SHARE, totalSlots, type AuctionConfig} from "@/lib/fantasy/config";
import type {AuctionPlayer, AuctionPool} from "@/lib/fantasy/data";
import {fantaAvgFor, suggestPrices, type FantaRole, type FantaScores} from "@/lib/fantasy/scores";
import {teamReport} from "@/lib/fantasy/report";
import {playerMatches} from "@/lib/fantasy/search";
import {cloudStore, configStore, purchasesStore, useHydrated} from "@/lib/fantasy/store";
import {bestLineup, defenceOption, planStrategy, rankStrategies, strategyHealth, STRATEGIES, type StrategyKey} from "@/lib/fantasy/strategies";
import {completionReserve, dynamicPrices, marketState} from "@/lib/fantasy/dynamic";
import {TIERS, explainTiers, type Tier, type TierInfo} from "@/lib/fantasy/tiers";

const ROLES: FantaRole[] = ['P', 'D', 'C', 'A'];
const SCORE_KEYS = ['starter', 'bonus', 'rating', 'discipline', 'fitness', 'team', 'form'] as const;
type SortKey = 'overall' | 'price' | 'fantaAvg' | (typeof SCORE_KEYS)[number] | 'name';
const PAGE = 80;


function ScoreCell({value}: {value: number}) {
    return (
        <span className="relative inline-flex items-center justify-center w-9 h-6 rounded overflow-hidden border border-foreground/30 bg-muted/40 font-mono text-[12px] font-extrabold tabular-nums">
            <span className={cn("absolute inset-y-0 left-0", value >= 70 ? "bg-accent" : value >= 45 ? "bg-accent/45" : "bg-foreground/10")} style={{width: `${value}%`}} aria-hidden="true" />
            <span className="relative">{value}</span>
        </span>
    );
}

const day = (iso: string) => new Date(`${iso}T12:00:00Z`);

/** Absence badge (no return date: nobody can tell one), plus the small flags that matter at the auction. */
function Status({p, rivals}: {p: AuctionPlayer; rivals: AuctionPlayer['rivals']}) {
    const t = useTranslations('Fantasy.board');
    return (
        <span className="inline-flex items-center gap-1 flex-wrap justify-end">
            {p.injury && (() => {
                const label = p.injury.category === 'suspension' ? t('suspended') : p.injury.category === 'doubtful' ? t('doubtful') : p.injury.category === 'injury' ? t('injured') : t('unavailable');
                return (
                    <span className="inline-flex items-center gap-1" title={`${p.injury.description ?? label} · ${t('daysOut', {count: p.injury.daysOut})}`}>
                        <Badge variant={p.injury.category === 'suspension' ? 'ink' : 'outline'} className="text-[9px] h-4 px-1">{label}</Badge>
                        {p.injury.longTerm && <Badge variant="ink" className="text-[9px] h-4 px-1">{t('longTerm')}</Badge>}
                    </span>
                );
            })()}
            {p.contested && rivals.length > 0 && <Badge variant="outline" className="text-[9px] h-4 px-1" title={t('info.rivals', {names: rivals.map((r) => r.name).join(', ')})}>{t('info.rivalsBadge')}</Badge>}
            {p.newSigning && <Badge variant="outline" className="text-[9px] h-4 px-1" title={t('info.newSigning', {club: p.newSigning})}>{t('info.newSigningBadge')}</Badge>}
            {p.penaltyTaker && <Badge variant="accent" className="text-[9px] h-4 px-1" title={t('info.penaltyTaker')}>{t('info.penaltyBadge')}</Badge>}
        </span>
    );
}

/** The notes of the detail row: absence in full, rivals for the spot, new signing, penalties, European cups. */
function Notes({p, onRole, wanted, avoided, onWant, onAvoid}: {p: AuctionPlayer; onRole: (role: FantaRole | null) => void; wanted: boolean; avoided: boolean; onWant: () => void; onAvoid: () => void}) {
    const t = useTranslations('Fantasy.board');
    const ts = useTranslations('Fantasy.setup');
    const format = useFormatter();
    const short = (iso: string) => format.dateTime(day(iso), {day: 'numeric', month: 'short'});
    const lines: Array<{key: string; text: string; tone?: string}> = [];
    const breakdown = (['P', 'D', 'C', 'A'] as const).filter((r) => (p.roleBreakdown[r] ?? 0) > 0).map((r) => `${Math.round(p.roleBreakdown[r]!)} ${ts(`roles.${r}`).toLowerCase()}`).join(', ');
    if (p.roleSource === 'manual') lines.push({key: 'role', text: t('info.roleManual', {role: p.role})});
    else if (p.roleSource === 'listone') lines.push({key: 'role', text: (p.listQuote !== null ? t('info.roleListoneQuote', {role: p.role, quote: p.listQuote}) : t('info.roleListone', {role: p.role})) + (p.listFvm !== null ? ` · ${t('info.fvm', {fvm: p.listFvm})}` : '') + (p.mantraRoles ? ` · ${t('info.mantra', {roles: p.mantraRoles.replace(/;/g, ', ')})}` : '')});
    else if (p.roleSource === 'lineups') lines.push({key: 'role', text: t('info.roleLineups', {role: p.role, breakdown})});
    else lines.push({key: 'role', text: t('info.roleProfile', {role: p.role})});
    if (p.injury) {
        const label = p.injury.category === 'suspension' ? t('suspended') : p.injury.category === 'doubtful' ? t('doubtful') : p.injury.category === 'injury' ? t('injured') : t('unavailable');
        lines.push({key: 'injury', text: t('info.injury', {label, description: p.injury.description ? ` (${p.injury.description})` : '', since: short(p.injury.since), days: t('info.injuryDays', {count: p.injury.daysOut})}) + (p.injury.longTerm ? ` · ${t('longTerm')}` : ''), tone: 'text-red-800'});
    }
    const avail = p.availability.starts + p.availability.benches;
    if (p.contested && p.rivals.length > 0) lines.push({key: 'rivals', text: t('info.contested', {benches: Math.round(p.availability.benches), total: Math.round(avail), names: p.rivals.map((r) => t('info.rivalOne', {name: r.name, shared: r.shared})).join(', ')}), tone: 'text-amber-800'});
    else if (p.contested) lines.push({key: 'rivals', text: t('info.contestedUnknown', {benches: Math.round(p.availability.benches), total: Math.round(avail)}), tone: 'text-amber-800'});
    else if (avail >= 3) lines.push({key: 'rivals', text: t('info.fixedStarter', {starts: Math.round(p.availability.starts), total: Math.round(avail)}) + (p.rivals.length > 0 ? ` ${t('info.backup', {names: p.rivals.map((r) => r.name).join(', ')})}` : '')});
    if (p.newSigning) lines.push({key: 'new', text: t('info.newSigning', {club: p.newSigning})});
    if (p.penaltyTaker) lines.push({key: 'pen', text: t('info.penaltyTaker')});
    if (p.europe) lines.push({key: 'europe', text: t('info.europe', {competition: p.europe})});
    return (
        <div className="flex flex-col gap-0.5 mb-2">
            <span className="text-[10px] font-extrabold uppercase tracking-wide text-muted-foreground">{t('info.title')}</span>
            {lines.length === 0 ? (
                <span className="text-[12px] font-semibold text-muted-foreground">{t('info.none')}</span>
            ) : (
                <ul className="flex flex-col gap-0.5 text-[12px] font-semibold list-disc pl-4">
                    {lines.map((l) => <li key={l.key} className={l.tone}>{l.text}</li>)}
                </ul>
            )}
            <div className="flex flex-wrap items-center gap-1 mt-1">
                <span className="text-[10px] font-extrabold uppercase tracking-wide text-muted-foreground mr-1">{t('info.fixRole')}</span>
                {ROLES.map((r) => (
                    <button key={r} type="button" onClick={() => onRole(r)} className={cn("bb-btn h-6 w-7 font-mono text-[11px] font-extrabold", p.role === r ? "bg-accent" : "bg-card")} aria-pressed={p.role === r}>{r}</button>
                ))}
                {p.roleSource === 'manual' && <button type="button" onClick={() => onRole(null)} className="bb-btn h-6 px-2 text-[11px] font-extrabold bg-card">{t('info.fixRoleReset')}</button>}
                <span className="basis-full text-[10px] font-semibold text-muted-foreground">{t('info.fixRoleHint')}</span>
            </div>
            <div className="flex flex-wrap items-center gap-1 mt-1">
                <span className="text-[10px] font-extrabold uppercase tracking-wide text-muted-foreground mr-1">{t('info.plan')}</span>
                <button type="button" onClick={onWant} aria-pressed={wanted} className={cn("bb-btn h-6 px-2 text-[11px] font-extrabold", wanted ? "bg-accent" : "bg-card")}>★ {t('info.want')}</button>
                <button type="button" onClick={onAvoid} aria-pressed={avoided} className={cn("bb-btn h-6 px-2 text-[11px] font-extrabold", avoided ? "bg-foreground text-background" : "bg-card")}>✕ {t('info.avoid')}</button>
                <span className="basis-full text-[10px] font-semibold text-muted-foreground">{t('info.planHint')}</span>
            </div>
        </div>
    );
}

/** The auction: settings gate, filters, the list with marks and suggested credits, my roster. */
export function AuctionBoard({pool: rawPool}: {pool: AuctionPool | null}) {
    const t = useTranslations('Fantasy.board');
    const ta = useTranslations('Fantasy.auction');
    const tr = useTranslations('Fantasy.roster');
    const ts = useTranslations('Fantasy.setup');
    const tst = useTranslations('Fantasy.strategies');
    const tt = useTranslations('Fantasy.tiers');
    const healthReason = useHealthReason();
    const router = useRouter();
    const hydrated = useHydrated();
    const config = configStore.useValue();
    const purchases = purchasesStore.useValue();
    const [editing, setEditing] = useState(false);
    const [showStrategies, setShowStrategies] = useState(false);
    const [teamsTab, setTeamsTab] = useState<TeamsTab | null>(null);

    const [q, setQ] = useState('');
    const [role, setRole] = useState<FantaRole | 'all'>('all');
    const [tier, setTier] = useState<Tier | 'all'>('all');
    const [view, setView] = useState<'list' | 'tiers'>('list');
    const [teamId, setTeamId] = useState<number | 'all'>('all');
    const [hideBought, setHideBought] = useState(false);
    const [sort, setSort] = useState<SortKey>('overall');
    const [limit, setLimit] = useState(PAGE);
    const [open, setOpen] = useState<number | null>(null);
    const [buying, setBuying] = useState<{player: AuctionPlayer; price: string; manager: number; editing: boolean} | null>(null);
    const [lastManager, setLastManager] = useState(0);
    /** Players picked for the comparison (up to two) and the row the keyboard is on. */
    const [compare, setCompare] = useState<number[]>([]);
    const [cursor, setCursor] = useState<number | null>(null);
    const openBuy = (player: AuctionPlayer) => setBuying({player, price: String(prices.get(player.id) ?? 1), manager: lastManager, editing: false});
    /** A registered purchase, opened again to correct the price or the manager. */
    const openEdit = (player: AuctionPlayer) => {
        const purchase = purchases.find((p) => p.playerId === player.id);
        if (purchase) setBuying({player, price: String(purchase.price), manager: purchase.manager, editing: true});
    };

    // The marks the league wants: with the cups, or the main leagues only.
    const pool = useMemo(() => {
        if (!rawPool || !config) return rawPool;
        const overrides = config.roleOverrides;
        const fixed = Object.keys(overrides).length > 0 ? rawPool.players.map((p) => (overrides[String(p.id)] && overrides[String(p.id)] !== p.role ? {...p, role: overrides[String(p.id)], roleSource: 'manual' as const} : p)) : rawPool.players;
        const chosen = config.cupsCount ? fixed : fixed.map((p) => ({...p, scores: p.scoresLeagueOnly, seasons: p.seasons.filter((l) => !l.cup)}));
        // The league's own bonus and malus: the fantasy average follows them.
        const classic = (Object.keys(DEFAULT_RULES) as Array<keyof typeof DEFAULT_RULES>).every((k) => config.rules[k] === DEFAULT_RULES[k]);
        const players = classic ? chosen : chosen.map((p) => (p.scores.events ? {...p, scores: {...p.scores, fantaAvg: fantaAvgFor(p.scores.events, p.role, config.rules)}} : p));
        return players === rawPool.players ? rawPool : {...rawPool, players};
    }, [rawPool, config]);
    // List prices assume a full market; the live prices follow what has been bought and paid.
    const listPrices = useMemo(() => {
        if (!pool || !config) return new Map<number, number>();
        return suggestPrices(pool.players, {credits: config.credits, participants: config.participants, slots: config.slots, roleShare: ROLE_SHARE, level: config.priceLevel / 100});
    }, [pool, config]);
    // Cheap enough to redo on every render: a few hundred players, a handful of purchases.
    const prices = pool && config ? dynamicPrices(pool.players, listPrices, config, purchases) : listPrices;
    const market = pool && config ? marketState(pool.players, listPrices, config, purchases) : null;
    const bought = useMemo(() => new Map(purchases.map((p) => [p.playerId, p])), [purchases]);
    const tierInfos = useMemo(() => (pool && config ? explainTiers(pool.players, config) : new Map<number, TierInfo>()), [pool, config]);
    const tiers = useMemo(() => new Map<number, Tier>([...tierInfos].map(([id, info]) => [id, info.tier])), [tierInfos]);
    // Strategies simulated on what is still on the market at live prices, starting from what I already own.
    const plans = useMemo(() => {
        if (!pool || !config) return [];
        const byId = new Map(pool.players.map((p) => [p.id, p]));
        const taken = new Set(purchases.filter((p) => p.manager !== 0).map((p) => p.playerId));
        const mine = purchases.filter((p) => p.manager === 0 && byId.has(p.playerId)).map((p) => ({playerId: p.playerId, role: byId.get(p.playerId)!.role, price: p.price}));
        return rankStrategies(pool.players, prices, config, taken, mine, {want: new Set(config.want), avoid: new Set(config.avoid)});
    }, [pool, config, prices, purchases]);
    // The same strategies on the full list at list prices: what each was worth when the auction started.
    const baseline = useMemo(() => (pool && config ? rankStrategies(pool.players, listPrices, config, new Set(), [], {want: new Set(config.want), avoid: new Set(config.avoid)}) : []), [pool, config, listPrices]);
    const players = useMemo(() => {
        if (!pool) return [];
        const needle = q.trim().toLowerCase();
        const list = pool.players.filter((p) => (role === 'all' || p.role === role) && (tier === 'all' || tiers.get(p.id) === tier) && (teamId === 'all' || p.team.id === teamId) && (!hideBought || !bought.has(p.id)) && (!needle || playerMatches(p, needle)));
        const value = (p: AuctionPlayer): number | string => (sort === 'price' ? (prices.get(p.id) ?? 0) : sort === 'fantaAvg' ? (p.scores.fantaAvg ?? -1) : sort === 'name' ? p.name : p.scores[sort]);
        return list.sort((a, b) => {
            const va = value(a);
            const vb = value(b);
            if (typeof va === 'string' && typeof vb === 'string') return va.localeCompare(vb);
            return (vb as number) - (va as number) || b.scores.overall - a.scores.overall;
        });
    }, [pool, q, role, tier, tiers, teamId, hideBought, bought, sort, prices]);

    if (!hydrated) return <p className="text-sm font-semibold text-muted-foreground">…</p>;

    const save = (next: AuctionConfig) => {
        configStore.write(next);
        setEditing(false);
        if (!pool || next.league !== pool.league) router.push(`/fantacalcio/asta?league=${next.league}`);
    };
    if (!config) {
        return (
            <div className="flex flex-col gap-3">
                <CloudPanel purchases={purchases} />
                <AuctionSetup initial={null} onSave={save} />
            </div>
        );
    }
    if (editing) return <AuctionSetup initial={config} onSave={save} onCancel={() => setEditing(false)} />;
    if (pool && pool.league !== config.league) {
        router.replace(`/fantacalcio/asta?league=${config.league}`);
        return <p className="text-sm font-semibold text-muted-foreground">…</p>;
    }
    if (!pool) return <p className="text-sm font-semibold text-muted-foreground">{ta('empty')}</p>;

    const managers = config.managers.length > 0 ? config.managers : [t('me')];
    const mine = purchases.filter((p) => p.manager === 0);
    const spent = mine.reduce((s, p) => s + p.price, 0);
    const left = config.credits - spent;
    const slotsTotal = totalSlots(config.slots);
    const freeSlots = Math.max(0, slotsTotal - mine.length);
    const byId = new Map(pool.players.map((p) => [p.id, p]));
    const mineByRole = (r: FantaRole) => mine.filter((p) => byId.get(p.playerId)?.role === r);
    const reset = () => {
        if (window.confirm(ta('resetConfirm'))) {
            purchasesStore.write([]);
            configStore.write(null);
            cloudStore.write(null);
        }
    };
    // Roster limits per manager: slots of the role, and credits that must leave 1 per open slot.
    const rosterOf = (manager: number) => purchases.filter((p) => p.manager === manager && byId.has(p.playerId));
    const roleCount = (manager: number, r: FantaRole) => rosterOf(manager).filter((p) => byId.get(p.playerId)!.role === r).length;
    const roleFull = (manager: number, r: FantaRole) => roleCount(manager, r) >= config.slots[r];
    const creditsLeftOf = (manager: number) => config.credits - rosterOf(manager).reduce((s, p) => s + p.price, 0);
    /** Why a purchase cannot go through, or null. */
    const blocker = (player: AuctionPlayer, manager: number, price: number): string | null => {
        const already = purchases.find((p) => p.playerId === player.id && p.manager === manager);
        if (roleFull(manager, player.role) && !already) return t('blockRole', {manager: managers[manager] ?? t('me'), count: config.slots[player.role], role: ts(`roles.${player.role}`)});
        const others = already ? purchases.filter((p) => p !== already) : purchases;
        const left = creditsLeftOf(manager) + (already?.price ?? 0);
        const maxPay = left - completionReserve(pool.players, prices, config, others, manager, player.role);
        if (price > maxPay) return t('blockCredits', {manager: managers[manager] ?? t('me'), max: Math.max(0, maxPay)});
        return null;
    };
    /** The most I can pay for a player of this role and still finish my roster with the cheapest players left. */
    const myMaxFor = (r: FantaRole) => Math.max(0, left - completionReserve(pool.players, prices, config, purchases, 0, r));
    const confirmBuy = () => {
        if (!buying) return;
        const price = Math.max(0, Math.round(Number(buying.price) || 0));
        if (blocker(buying.player, buying.manager, price)) return;
        const next = {playerId: buying.player.id, price, manager: buying.manager};
        const at = purchases.findIndex((p) => p.playerId === buying.player.id);
        // A correction keeps its place in the order; a purchase goes at the end (the last one, for undo).
        purchasesStore.write(at >= 0 && buying.editing ? purchases.map((p, i) => (i === at ? next : p)) : [...purchases.filter((p) => p.playerId !== buying.player.id), next]);
        setLastManager(buying.manager);
        setBuying(null);
    };
    const release = (playerId: number) => purchasesStore.write(purchases.filter((p) => p.playerId !== playerId));
    const lastPurchase = purchases.length > 0 ? purchases[purchases.length - 1] : null;
    const undoLast = () => {
        if (lastPurchase) purchasesStore.write(purchases.slice(0, -1));
    };
    const toggleCompare = (id: number) => setCompare((c) => (c.includes(id) ? c.filter((x) => x !== id) : [...c.slice(-1), id]));
    const comparing = compare.length === 2 ? compare.map((id) => byId.get(id)).filter((p): p is AuctionPlayer => !!p) : [];
    /** The keyboard on the list: arrows move, Enter buys or corrects, C compares, Ctrl+Z undoes, Esc closes. */
    const onKey = (e: KeyboardEvent) => {
        const target = e.target as HTMLElement | null;
        const typing = !!target && (target.tagName === 'INPUT' || target.tagName === 'SELECT' || target.tagName === 'TEXTAREA' || target.isContentEditable);
        if (e.key === 'Escape') {
            if (buying) setBuying(null);
            else if (comparing.length === 2) setCompare([]);
            else if (showStrategies) setShowStrategies(false);
            else if (teamsTab !== null) setTeamsTab(null);
            return;
        }
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !typing) {
            e.preventDefault();
            undoLast();
            return;
        }
        if (typing || buying || showStrategies || teamsTab !== null || e.ctrlKey || e.metaKey || e.altKey) return;
        const list = players.slice(0, limit);
        if (list.length === 0) return;
        const at = cursor === null ? -1 : list.findIndex((p) => p.id === cursor);
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault();
            const next = list[Math.max(0, Math.min(list.length - 1, at + (e.key === 'ArrowDown' ? 1 : -1)))];
            setCursor(next.id);
            document.getElementById(`auction-row-${next.id}`)?.scrollIntoView({block: 'nearest'});
            return;
        }
        const current = at >= 0 ? list[at] : null;
        if (!current) return;
        if (e.key === 'Enter') {
            e.preventDefault();
            if (bought.has(current.id)) openEdit(current);
            else openBuy(current);
        } else if (e.key.toLowerCase() === 'c') {
            e.preventDefault();
            toggleCompare(current.id);
        }
    };
    const strategy = plans.find((p) => p.key === config.strategy) ?? null;
    const selectStrategy = (key: StrategyKey | null) => configStore.write({...config, strategy: key});
    // The user's say on the targets: a wanted player is planned in, an ignored one never suggested. One or the other.
    const wanted = new Set(config.want);
    const avoided = new Set(config.avoid);
    const toggleWant = (id: number) => configStore.write({...config, want: wanted.has(id) ? config.want.filter((x) => x !== id) : [...config.want, id], avoid: config.avoid.filter((x) => x !== id)});
    const toggleAvoid = (id: number) => configStore.write({...config, avoid: avoided.has(id) ? config.avoid.filter((x) => x !== id) : [...config.avoid, id], want: config.want.filter((x) => x !== id)});
    const roleShare = strategy?.share ?? ROLE_SHARE;
    // How the strategy in use is going, and the formation that gets the most out of my roster plus the plan's targets.
    const takenByOthers = new Set(purchases.filter((p) => p.manager !== 0).map((p) => p.playerId));
    const ownPurchases = mine.filter((p) => byId.has(p.playerId)).map((p) => ({playerId: p.playerId, role: byId.get(p.playerId)!.role, price: p.price}));
    const health = strategy ? strategyHealth(plans, strategy.key, baseline, config, ownPurchases, takenByOthers) : null;
    const guide = strategy ?? plans.find((p) => p.available) ?? null;
    const rosterLineup = mine.length >= 11 ? bestLineup(mine.map((p) => byId.get(p.playerId)).filter((p): p is AuctionPlayer => !!p), {defenceModifier: defenceOption(config)}) : null;
    /** The report card of a manager's roster: the team's mark, the eleven, a line per role. */
    const reportOf = (manager: number) => teamReport(rosterOf(manager).map((pu) => byId.get(pu.playerId)).filter((p): p is AuctionPlayer => !!p), purchases.filter((pu) => pu.manager === manager), config.slots, {defenceModifier: defenceOption(config)});
    const myReport = reportOf(0);
    const targets = new Set(strategy ? ROLES.flatMap((r) => strategy.picks[r].filter((p) => !bought.has(p.id)).map((p) => p.id)) : []);
    // My ceiling per player: the strategy's slot for its targets, the live price for anyone else,
    // never more than what leaves me enough to finish the roster with the cheapest players left.
    const maxBidOf = (id: number): number | null => {
        if (!strategy || bought.has(id)) return null;
        const player = byId.get(id);
        if (!player) return null;
        const pick = ROLES.flatMap((r) => strategy.picks[r]).find((p) => p.id === id);
        return Math.min(myMaxFor(player.role), pick ? pick.maxBid : (prices.get(id) ?? 1));
    };
    /** What a purchase at this price does to the manager's roster: credits and slots after, and for me the eleven and the plan. */
    const previewOf = (player: AuctionPlayer, manager: number, price: number) => {
        const already = purchases.find((p) => p.playerId === player.id && p.manager === manager);
        const others = purchases.filter((p) => p.manager === manager && p.playerId !== player.id && byId.has(p.playerId));
        const leftAfter = config.credits - others.reduce((s, p) => s + p.price, 0) - price;
        const slotsAfter = Math.max(0, slotsTotal - others.length - 1);
        const roleSpent = others.filter((p) => byId.get(p.playerId)!.role === player.role).reduce((s, p) => s + p.price, 0) + price;
        const roleBudget = Math.round(config.credits * roleShare[player.role]);
        if (manager !== 0) return {leftAfter, slotsAfter, roleSpent, roleBudget, lineup: null, plan: null, over: 0, already};
        const rosterAfter = [...others.map((p) => byId.get(p.playerId)!), player];
        const lineup = rosterAfter.length >= 11 ? bestLineup(rosterAfter, {defenceModifier: defenceOption(config)}) : null;
        const def = strategy ? STRATEGIES.find((s) => s.key === strategy.key) : null;
        const plan = def && strategy
            ? planStrategy(def, pool.players, prices, config, takenByOthers, [...others.map((p) => ({playerId: p.playerId, role: byId.get(p.playerId)!.role, price: p.price})), {playerId: player.id, role: player.role, price}], {want: wanted, avoid: avoided})
            : null;
        const max = maxBidOf(player.id);
        return {leftAfter, slotsAfter, roleSpent, roleBudget, lineup, plan: plan && strategy ? {value: plan.lineupValue, delta: plan.lineupValue - strategy.lineupValue, name: tst(`${strategy.key}.name`)} : null, over: max !== null ? Math.max(0, price - max) : 0, already, missing: Math.max(0, 11 - rosterAfter.length)};
    };
    const priceCell = (id: number) => {
        const list = listPrices.get(id) ?? 1;
        const purchase = bought.get(id);
        // Bought: what the list said, then what was actually paid, so the theory meets the table.
        if (purchase) {
            const gap = purchase.price - list;
            const notable = Math.abs(gap) >= Math.max(2, list * 0.05);
            return (
                <span className="inline-flex items-center justify-end gap-1.5" title={t('paidVsList', {list, paid: purchase.price, gap: `${gap > 0 ? '+' : ''}${gap}`})}>
                    <span className="font-mono text-[11px] font-semibold tabular-nums text-muted-foreground">{list}</span>
                    <span className={cn("font-mono font-extrabold tabular-nums", notable && (gap > 0 ? "text-red-700" : "text-emerald-700"))}>{purchase.price}</span>
                </span>
            );
        }
        const live = prices.get(id) ?? 1;
        const delta = live - list;
        return (
            <span className="inline-flex items-center justify-end gap-1" title={t('listPrice', {price: list})}>
                <span className="font-mono font-extrabold tabular-nums">{live}</span>
                {Math.abs(delta) >= Math.max(2, list * 0.05) && <span className={cn("font-mono text-[10px] font-bold tabular-nums", delta > 0 ? "text-red-700" : "text-emerald-700")}>{delta > 0 ? '▲' : '▼'}{Math.abs(delta)}</span>}
            </span>
        );
    };

    const shown = players.slice(0, limit);
    const selectClass = "bb-input h-8 px-2 text-[12px] font-bold";

    return (
        <div className="grid gap-3 grid-cols-1 xl:grid-cols-[minmax(0,1fr)_300px] items-start">
            <div className="flex flex-col gap-3 min-w-0">
                {/* Toolbar */}
                <div className="bb-surface px-3 py-2 flex flex-wrap items-center gap-2">
                    <span className="text-[13px] font-extrabold truncate">{config.name || ts(`leagues.${config.league}`)}</span>
                    <span className="text-[11px] font-semibold text-muted-foreground">· {ts(`modes.${config.mode}`)} · {config.participants} × {config.credits} cr.</span>
                    <span className="ml-auto flex flex-wrap items-center gap-1.5">
                        {lastPurchase && byId.has(lastPurchase.playerId) && (
                            <button type="button" onClick={undoLast} title={t('undoLastHint', {name: byId.get(lastPurchase.playerId)!.name, manager: managers[lastPurchase.manager] ?? t('me'), price: lastPurchase.price})} className="bb-btn bg-card px-2.5 h-8 text-[12px] font-extrabold inline-flex items-center gap-1.5">
                                <Undo2 className="w-3.5 h-3.5" aria-hidden="true" />
                                <span className="hidden md:inline">{t('undoLast')}</span>
                                <span className="font-mono text-[11px] font-bold text-muted-foreground max-w-[120px] truncate">{byId.get(lastPurchase.playerId)!.name} {lastPurchase.price}</span>
                            </button>
                        )}
                        <button type="button" onClick={() => setShowStrategies(true)} className={cn("bb-btn px-2.5 h-8 text-[12px] font-extrabold inline-flex items-center gap-1.5", strategy ? "bg-accent" : "bg-card")}>
                            <Lightbulb className="w-3.5 h-3.5" aria-hidden="true" />
                            {strategy ? tst(`${strategy.key}.name`) : ta('strategies')}
                        </button>
                        {health && (
                            <button type="button" onClick={() => setShowStrategies(true)} title={health.reasons.length > 0 ? health.reasons.map(healthReason).join('\n') : tst('health.fine')} className={cn("bb-btn px-2.5 h-8 text-[12px] font-extrabold inline-flex items-center gap-1.5", HEALTH_CLASS[health.status])}>
                                <Activity className="w-3.5 h-3.5" aria-hidden="true" />
                                {tst(`health.${health.status}`)}
                                {health.status !== 'ok' && health.best.key !== health.current.key && health.gapPct >= 0.02 && <span className="hidden sm:inline text-[11px] font-bold">· {tst('health.switchTo', {name: tst(`${health.best.key}.name`)})}</span>}
                            </button>
                        )}
                        <CloudMenu config={config} purchases={purchases} />
                        <button type="button" onClick={() => setEditing(true)} className="bb-btn bg-card px-2.5 h-8 text-[12px] font-extrabold inline-flex items-center gap-1.5"><Settings2 className="w-3.5 h-3.5" aria-hidden="true" />{ta('changeSettings')}</button>
                        <button type="button" onClick={reset} className="bb-btn bg-card px-2.5 h-8 text-[12px] font-extrabold">{ta('reset')}</button>
                    </span>
                </div>

                {/* The table: every manager, credits and open slots */}
                {managers.length > 1 && (
                    <TableBar
                        managers={managers.map((name, manager) => ({manager, name: manager === 0 ? `${name} (${t('mine')})` : name, left: creditsLeftOf(manager), open: {P: Math.max(0, config.slots.P - roleCount(manager, 'P')), D: Math.max(0, config.slots.D - roleCount(manager, 'D')), C: Math.max(0, config.slots.C - roleCount(manager, 'C')), A: Math.max(0, config.slots.A - roleCount(manager, 'A'))}}))}
                        onOpen={(manager) => setTeamsTab(manager)}
                    />
                )}

                {/* Filters */}
                <div className="flex flex-wrap items-center gap-2">
                    <label className="flex items-center gap-2 bb-input px-2.5 h-8 min-w-[200px] flex-1">
                        <Search className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                        <input
                            type="search"
                            value={q}
                            onChange={(e) => { setQ(e.target.value); setLimit(PAGE); }}
                            onKeyDown={(e) => {
                                // Enter: buy the first player still on the market among the results.
                                if (e.key !== 'Enter' || q.trim().length < 2) return;
                                const first = players.find((p) => !bought.has(p.id));
                                if (first) { e.preventDefault(); openBuy(first); }
                            }}
                            placeholder={t('search')}
                            aria-label={t('search')}
                            className="w-full bg-transparent outline-none text-[13px] font-semibold"
                        />
                    </label>
                    <div role="radiogroup" className="flex gap-1">
                        {(['all', ...ROLES] as const).map((r) => (
                            <button key={r} type="button" role="radio" aria-checked={role === r} onClick={() => { setRole(r); setLimit(PAGE); }} className={cn("bb-btn h-8 px-2.5 text-[12px] font-extrabold", role === r ? "bg-foreground text-background" : "bg-card")}>{r === 'all' ? t('allRoles') : r}</button>
                        ))}
                    </div>
                    <select className={selectClass} value={tier} onChange={(e) => { setTier(e.target.value as Tier | 'all'); setLimit(PAGE); }} aria-label={t('columns.tier')}>
                        <option value="all">{tt('all')}</option>
                        {TIERS.map((k) => <option key={k} value={k}>{tt(`${k}.name`)}</option>)}
                    </select>
                    <select className={selectClass} value={sort} onChange={(e) => setSort(e.target.value as SortKey)} aria-label={t('sort')}>
                        {(['overall', 'price', 'fantaAvg', ...SCORE_KEYS, 'name'] as SortKey[]).map((k) => <option key={k} value={k}>{t('sort')}: {k === 'name' ? t('columns.player') : t(`columns.${k === 'team' ? 'team_' : k}`)}</option>)}
                    </select>
                    <label className="flex items-center gap-1.5 text-[12px] font-bold whitespace-nowrap">
                        <input type="checkbox" checked={hideBought} onChange={(e) => setHideBought(e.target.checked)} className="w-4 h-4" />
                        {t('hideBought')}
                    </label>
                    <div role="radiogroup" aria-label={t('view')} className="flex gap-1 ml-auto">
                        {(['list', 'tiers'] as const).map((v) => (
                            <button key={v} type="button" role="radio" aria-checked={view === v} onClick={() => setView(v)} className={cn("bb-btn h-8 px-2.5 text-[12px] font-extrabold", view === v ? "bg-foreground text-background" : "bg-card")}>{v === 'list' ? t('viewList') : t('viewTiers')}</button>
                        ))}
                    </div>
                </div>

                {/* Teams on one row, crests only: one at a time, the active one again to clear it */}
                <div role="radiogroup" aria-label={t('allTeams')} className="flex items-center gap-1 overflow-x-auto [scrollbar-width:thin] pb-1 -mb-1">
                    <button type="button" role="radio" aria-checked={teamId === 'all'} onClick={() => { setTeamId('all'); setLimit(PAGE); }} className={cn("bb-btn h-8 px-2.5 text-[12px] font-extrabold shrink-0", teamId === 'all' ? "bg-foreground text-background" : "bg-card")}>{t('allTeams')}</button>
                    {pool.teams.map((tm) => {
                        const active = teamId === tm.id;
                        return (
                            <button key={tm.id} type="button" role="radio" aria-checked={active} title={tm.name} aria-label={tm.name} onClick={() => { setTeamId(active ? 'all' : tm.id); setLimit(PAGE); }} className={cn("bb-btn h-8 w-8 p-0 shrink-0 inline-flex items-center justify-center", active ? "bg-foreground" : "bg-card")}>
                                <TeamCrest team={tm} size={20} />
                            </button>
                        );
                    })}
                </div>

                {view === 'tiers' && (
                    <>
                        <TierList players={players} infos={tierInfos} prices={prices} bought={bought} targets={targets} onBuy={openBuy} />
                        <p className="text-[11px] font-semibold text-muted-foreground">{tt('hint')}</p>
                    </>
                )}
                {view === 'list' && (<>

                {/* List */}
                <Panel title={`${t('showing', {shown: shown.length, total: players.length})}`} action={<span className="text-[11px] font-semibold text-muted-foreground">{ta('updated')}</span>}>
                    <div className="overflow-x-auto">
                    <table className="w-full text-[12px] whitespace-nowrap">
                        <thead>
                            <tr className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground border-b-2 border-foreground">
                                <th className="px-2 py-1.5 text-left w-full">{t('columns.player')}</th>
                                <th className="px-1 py-1.5 text-center">{t('columns.role')}</th>
                                <th className="px-1 py-1.5 text-center" title={t('columnHints.tier')}>{t('columns.tier')}</th>
                                {SCORE_KEYS.map((k) => <th key={k} className="px-1 py-1.5 text-center" title={t(`columnHints.${k === 'team' ? 'team_' : k}`)}>{t(`columns.${k === 'team' ? 'team_' : k}`)}</th>)}
                                <th className="px-1 py-1.5 text-center" title={t('columnHints.overall')}>{t('columns.overall')}</th>
                                <th className="px-1 py-1.5 text-right" title={t('columnHints.fantaAvg')}>{t('columns.fantaAvg')}</th>
                                <th className="px-1 py-1.5 text-right" title={t('columnHints.price')}>{t('columns.price')}</th>
                                {strategy && <th className="px-1 py-1.5 text-right" title={t('columnHints.maxBid')}>{t('columns.maxBid')}</th>}
                                <th className="px-2 py-1.5 text-right">{t('columns.status')}</th>
                            </tr>
                        </thead>
                        <tbody>
                            {shown.map((p) => {
                                const purchase = bought.get(p.id);
                                const expanded = open === p.id;
                                return (
                                    <FragmentRow key={p.id}>
                                        <tr id={`auction-row-${p.id}`} onClick={() => setCursor(p.id)} className={cn("border-t border-muted", purchase && (purchase.manager === 0 ? "bg-accent/15" : "opacity-60"), cursor === p.id && "outline outline-2 -outline-offset-2 outline-accent", compare.includes(p.id) && "bg-sky-100/60")}>
                                            <td className="px-2 py-1 min-w-0">
                                                <div className="flex items-center gap-2 min-w-0">
                                                    <button type="button" onClick={() => setOpen(expanded ? null : p.id)} aria-expanded={expanded} aria-label={t('seasonsTitle')} className="inline-flex w-5 h-5 items-center justify-center rounded border border-foreground/40 bg-card shrink-0">
                                                        {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                                                    </button>
                                                    <TeamCrest team={p.team} size={16} />
                                                    <span className="flex flex-col leading-tight min-w-0">
                                                        <span className="inline-flex items-center gap-1 min-w-0">
                                                            <Link href={`/players/${p.slug}`} target="_blank" rel="noopener noreferrer" title={p.fullName ?? undefined} className="font-extrabold text-[13px] truncate hover:underline decoration-accent decoration-[2px] underline-offset-2">{p.name}</Link>
                                                            {targets.has(p.id) && !purchase && <span className={cn("bb-badge text-[9px] h-4 px-1 shrink-0", wanted.has(p.id) ? "bg-foreground text-background" : "bg-accent")} title={wanted.has(p.id) ? tst('pinned') : tst('target')}>★</span>}
                                                            {avoided.has(p.id) && !purchase && <span className="bb-badge bg-card text-[9px] h-4 px-1 shrink-0 text-muted-foreground" title={tst('ignored')}>✕</span>}
                                                        </span>
                                                        <span className="text-[10px] font-semibold text-muted-foreground truncate">{p.team.name}{p.age !== null ? ` · ${p.age}` : ''} · <span title={t(`confidence.${p.scores.confidence}`)}>{p.scores.sample} PG</span></span>
                                                    </span>
                                                </div>
                                            </td>
                                            <td className="px-1 py-1 text-center"><RoleBadge role={p.role} /></td>
                                            <td className="px-1 py-1 text-center"><span className="inline-flex items-center gap-1"><TierBadge tier={tiers.get(p.id) ?? 'filler'} />{tierInfos.get(p.id) && <TierWhy player={p} info={tierInfos.get(p.id)!} />}</span></td>
                                            {SCORE_KEYS.map((k) => <td key={k} className="px-1 py-1 text-center"><ScoreCell value={p.scores[k]} /></td>)}
                                            <td className="px-1 py-1 text-center"><span className="inline-flex items-center justify-center w-9 h-6 rounded bg-foreground text-background font-mono text-[12px] font-extrabold tabular-nums">{p.scores.overall}</span></td>
                                            <td className="px-1 py-1 text-right font-mono font-bold tabular-nums">{p.scores.fantaAvg?.toFixed(2) ?? '–'}</td>
                                            <td className="px-1 py-1 text-right">{priceCell(p.id)}</td>
                                            {strategy && <td className="px-1 py-1 text-right font-mono font-bold tabular-nums text-accent-text">{maxBidOf(p.id) ?? '–'}</td>}
                                            <td className="px-2 py-1 text-right">
                                                <span className="inline-flex items-center gap-1.5 justify-end">
                                                    <Status p={p} rivals={p.rivals} />
                                                    <button type="button" onClick={() => toggleCompare(p.id)} aria-pressed={compare.includes(p.id)} aria-label={t('compare')} title={t('compareHint')} className={cn("inline-flex w-6 h-6 items-center justify-center rounded border border-foreground/50 hover:bg-accent", compare.includes(p.id) ? "bg-foreground text-background" : "bg-card")}><ArrowLeftRight className="w-3 h-3" /></button>
                                                    {purchase ? (
                                                        <span className="inline-flex items-center gap-1">
                                                            <span className="text-[11px] font-bold">{t('boughtBy', {manager: managers[purchase.manager] ?? t('me'), price: purchase.price})}</span>
                                                            <button type="button" onClick={() => openEdit(p)} aria-label={t('edit')} title={t('edit')} className="inline-flex w-6 h-6 items-center justify-center rounded border border-foreground bg-card hover:bg-accent"><Pencil className="w-3 h-3" /></button>
                                                            <button type="button" onClick={() => release(p.id)} aria-label={t('release')} title={t('release')} className="inline-flex w-6 h-6 items-center justify-center rounded border border-foreground bg-card hover:bg-accent"><X className="w-3 h-3" /></button>
                                                        </span>
                                                    ) : (
                                                        <button type="button" onClick={() => openBuy(p)} className="bb-btn bg-accent h-7 px-2.5 text-[11px] font-extrabold">{t('buy')}</button>
                                                    )}
                                                </span>
                                            </td>
                                        </tr>
                                        {expanded && (
                                            <tr className="border-t border-muted bg-muted/30">
                                                <td colSpan={14} className="px-3 py-2">
                                                    <Notes p={p} wanted={wanted.has(p.id)} avoided={avoided.has(p.id)} onWant={() => toggleWant(p.id)} onAvoid={() => toggleAvoid(p.id)} onRole={(r) => { const next = {...config.roleOverrides}; if (r === null) delete next[String(p.id)]; else next[String(p.id)] = r; configStore.write({...config, roleOverrides: next}); }} />
                                                    {p.seasons.length === 0 ? (
                                                        <span className="text-[12px] font-semibold text-muted-foreground">{t('noSeasons')}</span>
                                                    ) : (
                                                        <table className="text-[12px]">
                                                            <thead><tr className="text-[10px] font-bold uppercase text-muted-foreground">{(['season', 'team', 'league', 'apps', 'lineups', 'minutes', 'goals', 'assists', 'rating'] as const).map((c) => <th key={c} className={cn("px-2 py-0.5", c === 'season' || c === 'team' || c === 'league' ? "text-left" : "text-right font-mono")}>{t(`seasonCols.${c}`)}</th>)}</tr></thead>
                                                            <tbody>
                                                                {p.seasons.map((s, i) => (
                                                                    <tr key={i} className="font-semibold">
                                                                        <td className="px-2 py-0.5 font-mono">{s.year}/{String(s.year + 1).slice(2)}</td>
                                                                        <td className="px-2 py-0.5">{s.team}</td>
                                                                        <td className="px-2 py-0.5 text-muted-foreground">{s.league}</td>
                                                                        {[s.apps, s.lineups, s.minutes, s.goals, s.assists].map((v, j) => <td key={j} className="px-2 py-0.5 text-right font-mono tabular-nums">{v}</td>)}
                                                                        <td className="px-2 py-0.5 text-right font-mono tabular-nums">{s.rating?.toFixed(2) ?? '–'}</td>
                                                                    </tr>
                                                                ))}
                                                            </tbody>
                                                        </table>
                                                    )}
                                                </td>
                                            </tr>
                                        )}
                                    </FragmentRow>
                                );
                            })}
                        </tbody>
                    </table>
                    </div>
                    {players.length > limit && (
                        <div className="px-3 py-2 border-t border-muted text-center">
                            <button type="button" onClick={() => setLimit((l) => l + PAGE)} className="bb-btn bg-card px-3 h-8 text-[12px] font-extrabold">{t('more')}</button>
                        </div>
                    )}
                </Panel>
                <p className="text-[11px] font-semibold text-muted-foreground">{ta('intro')}</p>
                <p className="hidden md:block text-[11px] font-semibold text-muted-foreground">{t('shortcuts')}</p>
                </>)}
                {compare.length === 1 && byId.has(compare[0]) && (
                    <div className="fixed bottom-3 left-1/2 -translate-x-1/2 z-50 bb-surface bg-background px-3 h-9 flex items-center gap-2 text-[12px] font-extrabold shadow-[4px_4px_0_rgb(var(--foreground))]">
                        <ArrowLeftRight className="w-3.5 h-3.5" aria-hidden="true" />
                        {t('comparePicked', {name: byId.get(compare[0])!.name})}
                        <button type="button" onClick={() => setCompare([])} aria-label={t('close')} className="inline-flex w-6 h-6 items-center justify-center rounded border border-foreground bg-card"><X className="w-3 h-3" /></button>
                    </div>
                )}
            </div>

            {/* My roster and the strategies */}
            <div className="flex flex-col gap-3">
                <Panel title={tr('title')}>
                    <div className="grid grid-cols-2 divide-x divide-muted border-b border-muted">
                        <div className="px-3 py-2 flex flex-col"><span className={cn("font-mono text-xl font-extrabold tabular-nums", left < 0 && "text-red-700")}>{left}</span><span className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">{tr('credits')} {tr('left')}</span></div>
                        <div className="px-3 py-2 flex flex-col"><span className="font-mono text-xl font-extrabold tabular-nums">{spent}</span><span className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">{tr('credits')} {tr('spent')}</span></div>
                    </div>
                    <div className="grid grid-cols-4 divide-x divide-muted border-b border-muted text-center">
                        {ROLES.map((r) => (
                            <div key={r} className="px-2 py-1.5 flex flex-col items-center gap-0.5">
                                <RoleBadge role={r} />
                                <span className="font-mono text-[12px] font-extrabold tabular-nums">{tr('slots', {filled: mineByRole(r).length, total: config.slots[r]})}</span>
                                <span className="font-mono text-[10px] text-muted-foreground tabular-nums">~{Math.round(config.credits * roleShare[r])} cr.</span>
                            </div>
                        ))}
                    </div>
                    <p className="px-3 py-1.5 text-[11px] font-semibold text-muted-foreground border-b border-muted">
                        {tr('perSlot', {credits: freeSlots > 0 ? Math.max(0, Math.floor(left / freeSlots)) : 0})}
                        {freeSlots > 0 && <span className="block">{tr('reserve', {reserve: completionReserve(pool.players, prices, config, purchases, 0), max: Math.max(0, left - completionReserve(pool.players, prices, config, purchases, 0, null))})}</span>}
                        {strategy && <span className="block text-foreground">{tr('strategy', {name: tst(`${strategy.key}.name`)})}</span>}
                        {guide && (
                            <span className="block text-foreground" title={`${tr('formationHint')}\n${guide.formations.map((f) => `${f.key} ${f.value.toFixed(1)}`).join(' · ')}`}>
                                {config.formation ? tr('formationChosen', {formation: config.formation}) : tr('formation', {formation: guide.formation})}
                                <span className="block font-mono text-[10px] text-muted-foreground tabular-nums">{guide.formations.slice(0, 3).map((f) => `${f.key} ${f.value.toFixed(1)}`).join(' · ')}</span>
                            </span>
                        )}
                        {rosterLineup && <span className="block">{tr('formationNow', {formation: rosterLineup.formation})} <span className="font-mono text-[10px] tabular-nums">{rosterLineup.value.toFixed(1)}</span></span>}
                    </p>
                    {market && market.purchases > 0 && (
                        <div className="px-3 py-1.5 border-b border-muted text-[11px] font-semibold text-muted-foreground flex flex-col gap-0.5">
                            <span className="text-[10px] font-extrabold uppercase tracking-wide">{tr('market')}</span>
                            <span>{tr('marketMoney', {left: market.remaining, pct: Math.round((market.remaining / (config.credits * config.participants)) * 100)})}</span>
                            <span>{tr('marketTops')}: {ROLES.map((r) => `${r} ${market.byRole[r].topLeft}/${market.byRole[r].topTotal}`).join(' · ')}</span>
                            {market.inflation !== 1 && <span className={cn(market.inflation > 1 ? "text-red-700" : "text-emerald-700")}>{tr('marketMood', {pct: `${market.inflation > 1 ? '+' : ''}${Math.round((market.inflation - 1) * 100)}%`})}</span>}
                        </div>
                    )}
                    <div className="border-b border-muted">
                        <TeamRecap report={myReport} onOpen={() => setTeamsTab(0)} />
                    </div>
                    {mine.length === 0 ? (
                        <p className="px-3 py-3 text-[12px] font-semibold text-muted-foreground">{tr('empty')}</p>
                    ) : (
                        <ul className="flex flex-col">
                            {ROLES.flatMap((r) => mineByRole(r).map((pu) => {
                                const p = byId.get(pu.playerId);
                                if (!p) return null;
                                return (
                                    <li key={pu.playerId} className="flex items-center gap-2 px-3 h-8 border-t border-muted first:border-t-0">
                                        <RoleBadge role={p.role} />
                                        <Link href={`/players/${p.slug}`} target="_blank" rel="noopener noreferrer" className="text-[12px] font-bold truncate hover:underline decoration-accent decoration-[2px] underline-offset-2">{p.name}</Link>
                                        <span className="ml-auto font-mono text-[12px] font-extrabold tabular-nums">{pu.price}</span>
                                        <button type="button" onClick={() => openEdit(p)} aria-label={t('edit')} title={t('edit')} className="inline-flex w-5 h-5 items-center justify-center rounded border border-foreground/50 bg-card hover:bg-accent"><Pencil className="w-3 h-3" /></button>
                                        <button type="button" onClick={() => release(pu.playerId)} aria-label={t('release')} className="inline-flex w-5 h-5 items-center justify-center rounded border border-foreground/50 bg-card hover:bg-accent"><X className="w-3 h-3" /></button>
                                    </li>
                                );
                            }))}
                        </ul>
                    )}
                </Panel>
            </div>

            {/* Every roster, in full */}
            {teamsTab !== null && (
                <TeamsDialog
                    teams={managers.map((name, manager) => ({manager, name: manager === 0 ? `${name} (${t('mine')})` : name, report: reportOf(manager), players: rosterOf(manager).map((pu) => ({player: byId.get(pu.playerId)!, price: pu.price})), spent: config.credits - creditsLeftOf(manager), left: creditsLeftOf(manager)}))}
                    credits={config.credits}
                    tiers={tiers}
                    initial={teamsTab}
                    onClose={() => setTeamsTab(null)}
                    onRelease={release}
                />
            )}

            {/* Strategies */}
            {showStrategies && (
                <div role="dialog" aria-modal="true" aria-label={ta('strategies')} className="fixed inset-0 z-[60] flex items-start justify-center bg-foreground/40 p-3 overflow-y-auto" onClick={() => setShowStrategies(false)}>
                    <div onClick={(e) => e.stopPropagation()} className="w-full max-w-2xl my-4 flex flex-col gap-2">
                        <div className="flex justify-end">
                            <button type="button" onClick={() => setShowStrategies(false)} aria-label={ts('cancel')} className="inline-flex items-center justify-center w-9 h-9 rounded-md border-2 border-foreground bg-background"><X className="w-4 h-4" /></button>
                        </div>
                        <div className="bg-background rounded-xl">
                            <StrategyPanel plans={plans} selected={strategy?.key ?? null} onSelect={(key) => { selectStrategy(key); if (key) setShowStrategies(false); }} credits={config.credits} health={health} formation={config.formation} onFormation={(key) => configStore.write({...config, formation: key})} wanted={config.want.map((id) => byId.get(id)).filter((p): p is AuctionPlayer => !!p).map((p) => ({id: p.id, name: p.name}))} avoided={config.avoid.map((id) => byId.get(id)).filter((p): p is AuctionPlayer => !!p).map((p) => ({id: p.id, name: p.name}))} onWant={toggleWant} onAvoid={toggleAvoid} />
                        </div>
                    </div>
                </div>
            )}

            <Hotkeys onKey={onKey} />

            {/* Two players side by side */}
            {comparing.length === 2 && (
                <CompareDialog
                    a={{player: comparing[0], list: listPrices.get(comparing[0].id) ?? 1, live: prices.get(comparing[0].id) ?? 1, maxBid: maxBidOf(comparing[0].id), tier: tiers.get(comparing[0].id) ?? 'filler', bought: bought.has(comparing[0].id) ? {manager: managers[bought.get(comparing[0].id)!.manager] ?? t('me'), price: bought.get(comparing[0].id)!.price} : null}}
                    b={{player: comparing[1], list: listPrices.get(comparing[1].id) ?? 1, live: prices.get(comparing[1].id) ?? 1, maxBid: maxBidOf(comparing[1].id), tier: tiers.get(comparing[1].id) ?? 'filler', bought: bought.has(comparing[1].id) ? {manager: managers[bought.get(comparing[1].id)!.manager] ?? t('me'), price: bought.get(comparing[1].id)!.price} : null}}
                    onClose={() => setCompare([])}
                    onBuy={(player) => { setCompare([]); openBuy(player); }}
                />
            )}

            {/* Buy sheet */}
            {buying && (
                <div role="dialog" aria-modal="true" aria-label={buying.editing ? t('editTitle') : t('buyTitle')} className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-foreground/40 p-3" onClick={() => setBuying(null)}>
                    <form onSubmit={(e) => { e.preventDefault(); confirmBuy(); }} onClick={(e) => e.stopPropagation()} className="bb-surface w-full max-w-md p-4 flex flex-col gap-3 bg-background">
                        <div className="flex items-center gap-2">
                            {buying.editing && <span className="bb-badge bg-accent text-[10px] h-5 px-1.5 shrink-0">{t('editTitle')}</span>}
                            <RoleBadge role={buying.player.role} />
                            <span className="text-[15px] font-extrabold truncate">{buying.player.name}</span>
                            <span className="text-[12px] font-semibold text-muted-foreground truncate">{buying.player.team.name}</span>
                            <button type="button" onClick={() => setBuying(null)} aria-label={ts('cancel')} className="ml-auto inline-flex w-8 h-8 items-center justify-center rounded-md border-2 border-foreground bg-card"><X className="w-4 h-4" /></button>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            <label className="flex flex-col gap-1">
                                <span className="text-[11px] font-extrabold uppercase tracking-wide text-muted-foreground">{t('price')}</span>
                                <input
                                    type="text"
                                    inputMode="numeric"
                                    pattern="[0-9]*"
                                    autoFocus
                                    onFocus={(e) => e.currentTarget.select()}
                                    className="bb-input h-10 px-2.5 font-mono text-[16px] font-extrabold tabular-nums"
                                    value={buying.price}
                                    onChange={(e) => setBuying({...buying, price: e.target.value.replace(/[^0-9]/g, '').slice(0, 5)})}
                                />
                                <span className="flex flex-wrap gap-1">
                                    {[1, 5, 10].map((step) => (
                                        <button key={step} type="button" onClick={() => setBuying({...buying, price: String((Number(buying.price) || 0) + step)})} className="bb-btn bg-card h-7 px-2 text-[11px] font-extrabold font-mono">+{step}</button>
                                    ))}
                                    <button type="button" onClick={() => setBuying({...buying, price: String(listPrices.get(buying.player.id) ?? 1)})} className="bb-btn bg-card h-7 px-2 text-[11px] font-extrabold">{t('quickList')}</button>
                                    {strategy && maxBidOf(buying.player.id) !== null && <button type="button" onClick={() => setBuying({...buying, price: String(maxBidOf(buying.player.id))})} className="bb-btn bg-card h-7 px-2 text-[11px] font-extrabold">{t('quickMax')}</button>}
                                </span>
                            </label>
                            <label className="flex flex-col gap-1">
                                <span className="text-[11px] font-extrabold uppercase tracking-wide text-muted-foreground">{t('manager')}</span>
                                <select className="bb-input h-10 px-2.5 text-[14px] font-bold" value={buying.manager} onChange={(e) => setBuying({...buying, manager: Number(e.target.value)})}>
                                    {managers.map((m, i) => <option key={i} value={i} disabled={roleFull(i, buying.player.role) && !purchases.some((p) => p.playerId === buying.player.id && p.manager === i)}>{i === 0 ? `${m} (${t('mine')})` : m}{roleFull(i, buying.player.role) ? ` · ${t('full')}` : ''}</option>)}
                                </select>
                            </label>
                        </div>
                        <p className="text-[11px] font-semibold text-muted-foreground">
                            {t('columns.price')}: {prices.get(buying.player.id) ?? 1} · {t('listPrice', {price: listPrices.get(buying.player.id) ?? 1})} · {t('columns.fantaAvg')}: {buying.player.scores.fantaAvg?.toFixed(2) ?? '–'}
                            {strategy && maxBidOf(buying.player.id) !== null && <span className="block text-foreground">{t('maxBidHint', {max: maxBidOf(buying.player.id)!})}</span>}
                        </p>
                        {(() => {
                            const price = Math.max(0, Math.round(Number(buying.price) || 0));
                            const why = blocker(buying.player, buying.manager, price);
                            const pv = previewOf(buying.player, buying.manager, price);
                            return (
                                <>
                                    <div className="rounded-lg border-2 border-foreground/30 bg-muted/40 px-3 py-2 flex flex-col gap-0.5 text-[12px] font-semibold">
                                        <span className="text-[10px] font-extrabold uppercase tracking-wide text-muted-foreground">{t('preview.title', {price})}</span>
                                        <span className={cn(pv.leftAfter < pv.slotsAfter && "text-red-700")}>{pv.slotsAfter > 0 ? t('preview.left', {left: pv.leftAfter, slots: pv.slotsAfter, perSlot: Math.max(0, Math.floor(pv.leftAfter / pv.slotsAfter))}) : t('preview.leftNone', {left: pv.leftAfter})}</span>
                                        <span className={cn(pv.roleSpent > pv.roleBudget * 1.15 && "text-red-700")}>{t('preview.role', {role: ts(`roles.${buying.player.role}`), spent: pv.roleSpent, budget: pv.roleBudget})}</span>
                                        {buying.manager === 0 && (pv.lineup ? <span>{t('preview.lineup', {formation: pv.lineup.formation, value: pv.lineup.value.toFixed(1)})}</span> : <span className="text-muted-foreground">{t('preview.lineupShort', {missing: pv.missing ?? 0})}</span>)}
                                        {pv.plan && <span className={cn(pv.plan.delta < -0.5 && "text-red-700")}>{t(pv.plan.delta < -0.5 ? 'preview.planWorse' : 'preview.plan', {name: pv.plan.name, value: pv.plan.value.toFixed(1), delta: `${pv.plan.delta >= 0 ? '+' : ''}${pv.plan.delta.toFixed(1)}`})}</span>}
                                        {pv.over > 0 && <span className="text-red-700">{t('preview.over', {over: pv.over})}</span>}
                                    </div>
                                    {why && <p role="alert" className="text-[12px] font-bold text-red-700">{why}</p>}
                                    <button type="submit" disabled={why !== null} className="bb-btn bg-accent h-10 px-4 text-[13px] font-extrabold disabled:opacity-50 disabled:cursor-not-allowed">{t('confirm')}</button>
                                </>
                            );
                        })()}
                    </form>
                </div>
            )}
        </div>
    );
}

/** One window listener for the board's keys; the handler is the latest render's, through a ref. */
function Hotkeys({onKey}: {onKey: (e: KeyboardEvent) => void}) {
    const latest = useRef(onKey);
    useEffect(() => {
        latest.current = onKey;
    });
    useEffect(() => {
        const handler = (e: KeyboardEvent) => latest.current(e);
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, []);
    return null;
}

function FragmentRow({children}: {children: React.ReactNode}) {
    return <>{children}</>;
}

export type {FantaScores};
