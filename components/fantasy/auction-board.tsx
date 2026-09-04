'use client';

import {ChevronDown, ChevronUp, Search, Settings2, X} from "lucide-react";
import {useMemo, useState} from "react";
import {useTranslations} from "next-intl";
import {Link, useRouter} from "@/i18n/navigation";
import {Badge} from "@/components/shared/ui/badge";
import {cn} from "@/components/shared/ui/cn";
import {Panel} from "@/components/shell/panel";
import {TeamCrest} from "@/components/football/team-crest";
import {AuctionSetup} from "./auction-setup";
import {StrategyPanel} from "./strategy-panel";
import {TierBadge, TierList} from "./tier-list";
import {ROLE_SHARE, totalSlots, type AuctionConfig} from "@/lib/fantasy/config";
import type {AuctionPlayer, AuctionPool} from "@/lib/fantasy/data";
import {suggestPrices, type FantaRole, type FantaScores} from "@/lib/fantasy/scores";
import {configStore, purchasesStore, useHydrated} from "@/lib/fantasy/store";
import {rankStrategies, type StrategyKey} from "@/lib/fantasy/strategies";
import {dynamicPrices, marketState} from "@/lib/fantasy/dynamic";
import {TIERS, assignTiers, type Tier} from "@/lib/fantasy/tiers";

const ROLES: FantaRole[] = ['P', 'D', 'C', 'A'];
const SCORE_KEYS = ['starter', 'bonus', 'rating', 'discipline', 'fitness', 'team', 'form'] as const;
type SortKey = 'overall' | 'price' | 'fantaAvg' | (typeof SCORE_KEYS)[number] | 'name';
const PAGE = 80;

const ROLE_CLASS: Record<FantaRole, string> = {P: 'bg-amber-200', D: 'bg-emerald-200', C: 'bg-sky-200', A: 'bg-rose-200'};

function RoleBadge({role}: {role: FantaRole}) {
    return <span className={cn("inline-flex items-center justify-center w-5 h-5 rounded border border-foreground font-mono text-[11px] font-extrabold", ROLE_CLASS[role])}>{role}</span>;
}

function ScoreCell({value}: {value: number}) {
    return (
        <span className="relative inline-flex items-center justify-center w-9 h-6 rounded overflow-hidden border border-foreground/30 bg-muted/40 font-mono text-[12px] font-extrabold tabular-nums">
            <span className={cn("absolute inset-y-0 left-0", value >= 70 ? "bg-accent" : value >= 45 ? "bg-accent/45" : "bg-foreground/10")} style={{width: `${value}%`}} aria-hidden="true" />
            <span className="relative">{value}</span>
        </span>
    );
}

function Status({p, t}: {p: AuctionPlayer; t: ReturnType<typeof useTranslations<'Fantasy.board'>>}) {
    if (!p.injury) return null;
    const label = p.injury.category === 'suspension' ? t('suspended') : p.injury.category === 'doubtful' ? t('doubtful') : p.injury.category === 'injury' ? t('injured') : t('unavailable');
    return (
        <span className="inline-flex items-center gap-1" title={`${p.injury.description ?? label} · ${t('daysOut', {count: p.injury.daysOut})}`}>
            <Badge variant={p.injury.category === 'suspension' ? 'ink' : 'outline'} className="text-[9px] h-4 px-1">{label}</Badge>
            {p.injury.longTerm && <Badge variant="ink" className="text-[9px] h-4 px-1">{t('longTerm')}</Badge>}
        </span>
    );
}

/** The auction: settings gate, filters, the list with marks and suggested credits, my roster. */
export function AuctionBoard({pool}: {pool: AuctionPool | null}) {
    const t = useTranslations('Fantasy.board');
    const ta = useTranslations('Fantasy.auction');
    const tr = useTranslations('Fantasy.roster');
    const ts = useTranslations('Fantasy.setup');
    const tst = useTranslations('Fantasy.strategies');
    const tt = useTranslations('Fantasy.tiers');
    const router = useRouter();
    const hydrated = useHydrated();
    const config = configStore.useValue();
    const purchases = purchasesStore.useValue();
    const [editing, setEditing] = useState(false);

    const [q, setQ] = useState('');
    const [role, setRole] = useState<FantaRole | 'all'>('all');
    const [tier, setTier] = useState<Tier | 'all'>('all');
    const [view, setView] = useState<'list' | 'tiers'>('list');
    const [teamId, setTeamId] = useState<number | 'all'>('all');
    const [hideBought, setHideBought] = useState(false);
    const [sort, setSort] = useState<SortKey>('overall');
    const [limit, setLimit] = useState(PAGE);
    const [open, setOpen] = useState<number | null>(null);
    const [buying, setBuying] = useState<{player: AuctionPlayer; price: string; manager: number} | null>(null);
    const [lastManager, setLastManager] = useState(0);
    const openBuy = (player: AuctionPlayer) => setBuying({player, price: String(prices.get(player.id) ?? 1), manager: lastManager});

    // List prices assume a full market; the live prices follow what has been bought and paid.
    const listPrices = useMemo(() => {
        if (!pool || !config) return new Map<number, number>();
        return suggestPrices(pool.players, {credits: config.credits, participants: config.participants, slots: config.slots, roleShare: ROLE_SHARE});
    }, [pool, config]);
    // Cheap enough to redo on every render: a few hundred players, a handful of purchases.
    const prices = pool && config ? dynamicPrices(pool.players, listPrices, config, purchases) : listPrices;
    const market = pool && config ? marketState(pool.players, listPrices, config, purchases) : null;
    const bought = useMemo(() => new Map(purchases.map((p) => [p.playerId, p])), [purchases]);
    const tiers = useMemo(() => (pool && config ? assignTiers(pool.players, config) : new Map<number, Tier>()), [pool, config]);
    // Strategies simulated on what is still on the market at live prices, starting from what I already own.
    const plans = useMemo(() => {
        if (!pool || !config) return [];
        const byId = new Map(pool.players.map((p) => [p.id, p]));
        const taken = new Set(purchases.filter((p) => p.manager !== 0).map((p) => p.playerId));
        const mine = purchases.filter((p) => p.manager === 0 && byId.has(p.playerId)).map((p) => ({playerId: p.playerId, role: byId.get(p.playerId)!.role, price: p.price}));
        return rankStrategies(pool.players, prices, config, taken, mine);
    }, [pool, config, prices, purchases]);
    const players = useMemo(() => {
        if (!pool) return [];
        const needle = q.trim().toLowerCase();
        const list = pool.players.filter((p) => (role === 'all' || p.role === role) && (tier === 'all' || tiers.get(p.id) === tier) && (teamId === 'all' || p.team.id === teamId) && (!hideBought || !bought.has(p.id)) && (!needle || p.name.toLowerCase().includes(needle) || p.team.name.toLowerCase().includes(needle)));
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
    if (!config || editing) return <AuctionSetup initial={config} onSave={save} onCancel={config ? () => setEditing(false) : undefined} />;
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
        }
    };
    const confirmBuy = () => {
        if (!buying) return;
        const price = Math.max(0, Math.round(Number(buying.price) || 0));
        purchasesStore.write([...purchases.filter((p) => p.playerId !== buying.player.id), {playerId: buying.player.id, price, manager: buying.manager}]);
        setLastManager(buying.manager);
        setBuying(null);
    };
    const release = (playerId: number) => purchasesStore.write(purchases.filter((p) => p.playerId !== playerId));
    const strategy = plans.find((p) => p.key === config.strategy) ?? null;
    const selectStrategy = (key: StrategyKey | null) => configStore.write({...config, strategy: key});
    const roleShare = strategy?.share ?? ROLE_SHARE;
    const targets = new Set(strategy ? ROLES.flatMap((r) => strategy.picks[r].filter((p) => !bought.has(p.id)).map((p) => p.id)) : []);
    // My ceiling per player: the strategy's slot for its targets, the live price for anyone else, never more than what leaves 1 credit per open slot.
    const room = Math.max(1, left - Math.max(0, freeSlots - 1));
    const maxBidOf = (id: number): number | null => {
        if (!strategy || bought.has(id)) return null;
        const pick = ROLES.flatMap((r) => strategy.picks[r]).find((p) => p.id === id);
        return Math.min(room, pick ? pick.maxBid : (prices.get(id) ?? 1));
    };
    const priceCell = (id: number) => {
        const live = prices.get(id) ?? 1;
        const list = listPrices.get(id) ?? 1;
        const delta = live - list;
        return (
            <span className="inline-flex items-center justify-end gap-1" title={bought.has(id) ? t('paid') : t('listPrice', {price: list})}>
                <span className="font-mono font-extrabold tabular-nums">{live}</span>
                {!bought.has(id) && Math.abs(delta) >= Math.max(2, list * 0.05) && <span className={cn("font-mono text-[10px] font-bold tabular-nums", delta > 0 ? "text-red-700" : "text-emerald-700")}>{delta > 0 ? '▲' : '▼'}{Math.abs(delta)}</span>}
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
                    <span className="ml-auto flex items-center gap-1.5">
                        <button type="button" onClick={() => setEditing(true)} className="bb-btn bg-card px-2.5 h-8 text-[12px] font-extrabold inline-flex items-center gap-1.5"><Settings2 className="w-3.5 h-3.5" aria-hidden="true" />{ta('changeSettings')}</button>
                        <button type="button" onClick={reset} className="bb-btn bg-card px-2.5 h-8 text-[12px] font-extrabold">{ta('reset')}</button>
                    </span>
                </div>

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
                    <select className={selectClass} value={teamId} onChange={(e) => { setTeamId(e.target.value === 'all' ? 'all' : Number(e.target.value)); setLimit(PAGE); }} aria-label={t('allTeams')}>
                        <option value="all">{t('allTeams')}</option>
                        {pool.teams.map((tm) => <option key={tm.id} value={tm.id}>{tm.name}</option>)}
                    </select>
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

                {view === 'tiers' && (
                    <>
                        <TierList players={players} tiers={tiers} prices={prices} bought={bought} targets={targets} onBuy={openBuy} />
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
                                        <tr className={cn("border-t border-muted", purchase && (purchase.manager === 0 ? "bg-accent/15" : "opacity-60"))}>
                                            <td className="px-2 py-1 min-w-0">
                                                <div className="flex items-center gap-2 min-w-0">
                                                    <button type="button" onClick={() => setOpen(expanded ? null : p.id)} aria-expanded={expanded} aria-label={t('seasonsTitle')} className="inline-flex w-5 h-5 items-center justify-center rounded border border-foreground/40 bg-card shrink-0">
                                                        {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                                                    </button>
                                                    <TeamCrest team={p.team} size={16} />
                                                    <span className="flex flex-col leading-tight min-w-0">
                                                        <span className="inline-flex items-center gap-1 min-w-0">
                                                            <Link href={`/players/${p.slug}`} className="font-extrabold text-[13px] truncate hover:underline decoration-accent decoration-[2px] underline-offset-2">{p.name}</Link>
                                                            {targets.has(p.id) && !purchase && <span className="bb-badge bg-accent text-[9px] h-4 px-1 shrink-0" title={tst('target')}>★</span>}
                                                        </span>
                                                        <span className="text-[10px] font-semibold text-muted-foreground truncate">{p.team.name}{p.age !== null ? ` · ${p.age}` : ''} · <span title={t(`confidence.${p.scores.confidence}`)}>{p.scores.sample} PG</span></span>
                                                    </span>
                                                </div>
                                            </td>
                                            <td className="px-1 py-1 text-center"><RoleBadge role={p.role} /></td>
                                            <td className="px-1 py-1 text-center"><TierBadge tier={tiers.get(p.id) ?? 'filler'} /></td>
                                            {SCORE_KEYS.map((k) => <td key={k} className="px-1 py-1 text-center"><ScoreCell value={p.scores[k]} /></td>)}
                                            <td className="px-1 py-1 text-center"><span className="inline-flex items-center justify-center w-9 h-6 rounded bg-foreground text-background font-mono text-[12px] font-extrabold tabular-nums">{p.scores.overall}</span></td>
                                            <td className="px-1 py-1 text-right font-mono font-bold tabular-nums">{p.scores.fantaAvg?.toFixed(2) ?? '–'}</td>
                                            <td className="px-1 py-1 text-right">{priceCell(p.id)}</td>
                                            {strategy && <td className="px-1 py-1 text-right font-mono font-bold tabular-nums text-accent-text">{maxBidOf(p.id) ?? '–'}</td>}
                                            <td className="px-2 py-1 text-right">
                                                <span className="inline-flex items-center gap-1.5 justify-end">
                                                    <Status p={p} t={t} />
                                                    {purchase ? (
                                                        <span className="inline-flex items-center gap-1">
                                                            <span className="text-[11px] font-bold">{t('boughtBy', {manager: managers[purchase.manager] ?? t('me'), price: purchase.price})}</span>
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
                </>)}
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
                        {strategy && <span className="block text-foreground">{tr('strategy', {name: tst(`${strategy.key}.name`)})}</span>}
                    </p>
                    {market && market.purchases > 0 && (
                        <div className="px-3 py-1.5 border-b border-muted text-[11px] font-semibold text-muted-foreground flex flex-col gap-0.5">
                            <span className="text-[10px] font-extrabold uppercase tracking-wide">{tr('market')}</span>
                            <span>{tr('marketMoney', {left: market.remaining, pct: Math.round((market.remaining / (config.credits * config.participants)) * 100)})}</span>
                            <span>{tr('marketTops')}: {ROLES.map((r) => `${r} ${market.byRole[r].topLeft}/${market.byRole[r].topTotal}`).join(' · ')}</span>
                            {market.inflation !== 1 && <span className={cn(market.inflation > 1 ? "text-red-700" : "text-emerald-700")}>{tr('marketMood', {pct: `${market.inflation > 1 ? '+' : ''}${Math.round((market.inflation - 1) * 100)}%`})}</span>}
                        </div>
                    )}
                    {mine.length === 0 ? (
                        <p className="px-3 py-3 text-[12px] font-semibold text-muted-foreground">{tr('empty')}</p>
                    ) : (
                        <ul className="flex flex-col max-h-[50vh] overflow-y-auto">
                            {ROLES.flatMap((r) => mineByRole(r).map((pu) => {
                                const p = byId.get(pu.playerId);
                                if (!p) return null;
                                return (
                                    <li key={pu.playerId} className="flex items-center gap-2 px-3 h-8 border-t border-muted first:border-t-0">
                                        <RoleBadge role={p.role} />
                                        <Link href={`/players/${p.slug}`} className="text-[12px] font-bold truncate hover:underline decoration-accent decoration-[2px] underline-offset-2">{p.name}</Link>
                                        <span className="ml-auto font-mono text-[12px] font-extrabold tabular-nums">{pu.price}</span>
                                        <button type="button" onClick={() => release(pu.playerId)} aria-label={t('release')} className="inline-flex w-5 h-5 items-center justify-center rounded border border-foreground/50 bg-card hover:bg-accent"><X className="w-3 h-3" /></button>
                                    </li>
                                );
                            }))}
                        </ul>
                    )}
                </Panel>
                {managers.length > 1 && (
                    <Panel title={tr('others')}>
                        <ul className="flex flex-col">
                            {managers.slice(1).map((m, i) => {
                                const theirs = purchases.filter((p) => p.manager === i + 1);
                                return (
                                    <li key={m} className="flex items-center gap-2 px-3 h-8 border-t border-muted first:border-t-0 text-[12px] font-bold">
                                        <span className="truncate">{m}</span>
                                        <span className="ml-auto font-mono tabular-nums text-muted-foreground">{theirs.length}/{slotsTotal} · {config.credits - theirs.reduce((s, p) => s + p.price, 0)} cr.</span>
                                    </li>
                                );
                            })}
                        </ul>
                    </Panel>
                )}
                <StrategyPanel plans={plans} selected={strategy?.key ?? null} onSelect={selectStrategy} credits={config.credits} />
            </div>

            {/* Buy sheet */}
            {buying && (
                <div role="dialog" aria-modal="true" aria-label={t('buyTitle')} className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-foreground/40 p-3" onClick={() => setBuying(null)}>
                    <form onSubmit={(e) => { e.preventDefault(); confirmBuy(); }} onClick={(e) => e.stopPropagation()} className="bb-surface w-full max-w-md p-4 flex flex-col gap-3 bg-background">
                        <div className="flex items-center gap-2">
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
                                    {managers.map((m, i) => <option key={i} value={i}>{i === 0 ? `${m} (${t('mine')})` : m}</option>)}
                                </select>
                            </label>
                        </div>
                        <p className="text-[11px] font-semibold text-muted-foreground">
                            {t('columns.price')}: {prices.get(buying.player.id) ?? 1} · {t('listPrice', {price: listPrices.get(buying.player.id) ?? 1})} · {t('columns.fantaAvg')}: {buying.player.scores.fantaAvg?.toFixed(2) ?? '–'}
                            {strategy && maxBidOf(buying.player.id) !== null && <span className="block text-foreground">{t('maxBidHint', {max: maxBidOf(buying.player.id)!})}</span>}
                        </p>
                        <button type="submit" className="bb-btn bg-accent h-10 px-4 text-[13px] font-extrabold">{t('confirm')}</button>
                    </form>
                </div>
            )}
        </div>
    );
}

function FragmentRow({children}: {children: React.ReactNode}) {
    return <>{children}</>;
}

export type {FantaScores};
