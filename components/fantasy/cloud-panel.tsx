'use client';

import {ChevronDown, Cloud, CloudOff, Copy, ExternalLink, Share2, Trash2} from "lucide-react";
import {useEffect, useRef, useState} from "react";
import {useFormatter, useTranslations} from "next-intl";
import {Link} from "@/i18n/navigation";
import {cn} from "@/components/shared/ui/cn";
import {Panel} from "@/components/shell/panel";
import type {AuctionConfig, Purchase} from "@/lib/fantasy/config";
import {cloudUser, deleteAuction, listAuctions, loadAuction, saveAuction, shareAuction, unshareAuction, type CloudAuction, type CloudUser} from "@/lib/fantasy/cloud";
import {cloudStore, configStore, purchasesStore} from "@/lib/fantasy/store";

/** A change is written to the cloud this long after the last one. */
const AUTOSAVE_MS = 2_500;
const NEXT = '/fantacalcio/asta';
const btn = "bb-btn h-8 px-2.5 text-[12px] font-extrabold inline-flex items-center gap-1 disabled:opacity-50";

/**
 * The auction in the cloud: sign-in prompt for visitors; for the signed-in
 * user, save the auction on this device (then every change follows by
 * itself), load one saved earlier, delete it.
 *
 * Two faces: a button in the auction's toolbar that opens a menu with all
 * of it (`CloudMenu`), and a panel with the saved list alone above the
 * setup, to start from one when no auction is configured (`CloudPanel`).
 */
function useCloud(config: AuctionConfig | null, purchases: Purchase[]) {
    const t = useTranslations('Fantasy.cloud');
    const link = cloudStore.useValue();
    const [user, setUser] = useState<CloudUser | null | undefined>(undefined);
    const [saved, setSaved] = useState<CloudAuction[]>([]);
    const [busy, setBusy] = useState<'save' | 'load' | 'delete' | null>(null);
    const [error, setError] = useState<string | null>(null);
    // What the linked row holds: a different config or purchases on this device is a change to write.
    const [synced, setSynced] = useState<{config: AuctionConfig | null; purchases: Purchase[]}>(() => ({config, purchases}));
    const [refreshKey, setRefreshKey] = useState(0);

    useEffect(() => {
        let alive = true;
        cloudUser()
            .then((u) => {
                if (alive) setUser(u);
            })
            .catch(() => {
                if (alive) setUser(null);
            });
        return () => {
            alive = false;
        };
    }, []);

    useEffect(() => {
        if (!user) return;
        let alive = true;
        listAuctions()
            .then((rows) => {
                if (alive) setSaved(rows);
            })
            .catch((e: Error) => {
                if (alive) setError(e.message);
            });
        return () => {
            alive = false;
        };
    }, [user, refreshKey]);

    const save = async (asNew: boolean) => {
        if (!user || !config) return;
        setBusy('save');
        setError(null);
        try {
            const id = await saveAuction({id: asNew ? null : (link?.id ?? null), name: config.name || t('unnamed'), config, purchases}, user.id);
            cloudStore.write({id, savedAt: new Date().toISOString()});
            setSynced({config, purchases});
            setRefreshKey((k) => k + 1);
        } catch (e) {
            setError((e as Error).message);
        } finally {
            setBusy(null);
        }
    };

    // A change on this device follows to the linked row a moment after the last one.
    const pending = !!link && !!user && !!config && (config !== synced.config || purchases !== synced.purchases);
    const saveRef = useRef(save);
    useEffect(() => {
        saveRef.current = save;
    });
    useEffect(() => {
        if (!pending) return;
        const timer = window.setTimeout(() => void saveRef.current(false), AUTOSAVE_MS);
        return () => window.clearTimeout(timer);
    }, [pending, config, purchases]);

    const load = async (row: CloudAuction) => {
        if (link?.id !== row.id && config && purchases.length > 0 && !link && !window.confirm(t('loadConfirm'))) return;
        setBusy('load');
        setError(null);
        try {
            const data = await loadAuction(row.id);
            if (!data) {
                setError(t('gone'));
                setRefreshKey((k) => k + 1);
                return;
            }
            configStore.write(data.config);
            purchasesStore.write(data.purchases);
            cloudStore.write({id: row.id, savedAt: row.updatedAt});
            setSynced({config: data.config, purchases: data.purchases});
        } catch (e) {
            setError((e as Error).message);
        } finally {
            setBusy(null);
        }
    };

    const remove = async (row: CloudAuction) => {
        if (!window.confirm(t('deleteConfirm', {name: row.name}))) return;
        setBusy('delete');
        setError(null);
        try {
            await deleteAuction(row.id);
            if (link?.id === row.id) cloudStore.write(null);
            setSaved((rows) => rows.filter((r) => r.id !== row.id));
        } catch (e) {
            setError((e as Error).message);
        } finally {
            setBusy(null);
        }
    };

    const unlink = () => cloudStore.write(null);

    // The group's link for the linked auction: opened here, closed here.
    const shareToken = link ? (saved.find((r) => r.id === link.id)?.shareToken ?? null) : null;
    const share = async () => {
        if (!link) return;
        setBusy('save');
        setError(null);
        try {
            const token = await shareAuction(link.id);
            setSaved((rows) => rows.map((r) => (r.id === link.id ? {...r, shareToken: token} : r)));
        } catch (e) {
            setError((e as Error).message);
        } finally {
            setBusy(null);
        }
    };
    const unshare = async () => {
        if (!link) return;
        setBusy('save');
        setError(null);
        try {
            await unshareAuction(link.id);
            setSaved((rows) => rows.map((r) => (r.id === link.id ? {...r, shareToken: null} : r)));
        } catch (e) {
            setError((e as Error).message);
        } finally {
            setBusy(null);
        }
    };
    return {link, user, saved, busy, error, pending, save, load, remove, unlink, shareToken, share, unshare};
}

/** The share block of the menu: open the link, copy it, close it. */
function ShareBlock({cloud}: {cloud: Cloud}) {
    const t = useTranslations('Fantasy.cloud');
    const [copied, setCopied] = useState(false);
    const path = cloud.shareToken ? `/fantacalcio/asta/condivisa/${cloud.shareToken}` : null;
    const url = path && typeof window !== 'undefined' ? `${window.location.origin}${path}` : null;
    const copy = async () => {
        if (!url) return;
        try {
            await navigator.clipboard.writeText(url);
            setCopied(true);
            window.setTimeout(() => setCopied(false), 2000);
        } catch {
            window.prompt(t('shareCopy'), url);
        }
    };
    return (
        <div className="flex flex-col gap-1.5 border-t border-muted pt-2">
            <p className="text-[11px] font-extrabold uppercase tracking-wide text-muted-foreground">{t('share')}</p>
            <p className="text-[11px] font-semibold text-muted-foreground">{cloud.link ? t('shareHint') : t('shareNeedsSave')}</p>
            {cloud.link && (
                <div className="flex flex-wrap gap-2">
                    {cloud.shareToken ? (
                        <>
                            <button type="button" onClick={() => void copy()} disabled={cloud.busy !== null} className={cn(btn, "bg-accent")}><Copy className="w-3.5 h-3.5" /> {copied ? t('shareCopied') : t('shareCopy')}</button>
                            <a href={path!} target="_blank" rel="noopener noreferrer" className={cn(btn, "bg-card")}><ExternalLink className="w-3.5 h-3.5" /> {t('shareOpen')}</a>
                            <button type="button" onClick={() => void cloud.unshare()} disabled={cloud.busy !== null} className={cn(btn, "bg-card")}>{t('shareStop')}</button>
                        </>
                    ) : (
                        <button type="button" onClick={() => void cloud.share()} disabled={cloud.busy !== null} className={cn(btn, "bg-card")}><Share2 className="w-3.5 h-3.5" /> {t('share')}</button>
                    )}
                </div>
            )}
        </div>
    );
}

type Cloud = ReturnType<typeof useCloud>;

/** The list of saved auctions with load and delete. */
function SavedList({cloud, config, onDone}: {cloud: Cloud; config: AuctionConfig | null; onDone?: () => void}) {
    const t = useTranslations('Fantasy.cloud');
    const format = useFormatter();
    const linked = cloud.link ? cloud.saved.find((r) => r.id === cloud.link!.id) : undefined;
    return (
        <div className="flex flex-col gap-1">
            <p className="text-[11px] font-extrabold uppercase tracking-wide text-muted-foreground">{t('saved', {count: cloud.saved.length})}</p>
            {cloud.saved.length === 0 ? (
                <p className="text-[12px] font-semibold text-muted-foreground">{config ? t('noneYet') : t('noneToLoad')}</p>
            ) : (
                <ul className="flex flex-col divide-y divide-muted max-h-[40vh] overflow-y-auto [scrollbar-width:thin]">
                    {cloud.saved.map((row) => {
                        const current = linked?.id === row.id;
                        return (
                            <li key={row.id} className={cn("flex items-center gap-2 py-1.5", current && "font-extrabold")}>
                                <div className="min-w-0 flex-1">
                                    <p className="text-[13px] truncate">{row.name}{current && <span className="ml-1 text-[10px] uppercase text-muted-foreground">{t('current')}</span>}</p>
                                    <p className="text-[11px] font-semibold text-muted-foreground">{t('rowMeta', {league: row.league, purchases: row.purchasesCount, when: format.relativeTime(new Date(row.updatedAt))})}</p>
                                </div>
                                <button type="button" onClick={() => { void cloud.load(row).then(() => onDone?.()); }} disabled={cloud.busy !== null} className={cn(btn, "bg-card")}>{t('load')}</button>
                                <button type="button" onClick={() => void cloud.remove(row)} disabled={cloud.busy !== null} aria-label={t('delete')} title={t('delete')} className={cn(btn, "bg-card px-2")}><Trash2 className="w-3.5 h-3.5" /></button>
                            </li>
                        );
                    })}
                </ul>
            )}
        </div>
    );
}

/** In the auction's toolbar: one button with the cloud state, a menu with save, the saved list, sign-in. */
export function CloudMenu({config, purchases}: {config: AuctionConfig; purchases: Purchase[]}) {
    const t = useTranslations('Fantasy.cloud');
    const format = useFormatter();
    const cloud = useCloud(config, purchases);
    const [open, setOpen] = useState(false);
    const root = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!open) return;
        const onDown = (e: MouseEvent) => {
            if (root.current && !root.current.contains(e.target as Node)) setOpen(false);
        };
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') setOpen(false);
        };
        document.addEventListener('mousedown', onDown);
        document.addEventListener('keydown', onKey);
        return () => {
            document.removeEventListener('mousedown', onDown);
            document.removeEventListener('keydown', onKey);
        };
    }, [open]);

    if (cloud.user === undefined) return null;
    const {link, user} = cloud;
    const saving = cloud.pending || cloud.busy === 'save';
    const label = !user ? t('menuSignedOut') : !link ? t('menuNotSaved') : saving ? t('saving') : t('menuSaved');
    const Icon = user && link ? Cloud : CloudOff;

    return (
        <div ref={root} className="relative">
            <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-haspopup="dialog" className={cn(btn, user && link ? "bg-accent" : "bg-card")} title={user ? (link ? t('savedAt', {when: format.relativeTime(new Date(link.savedAt))}) : t('notSaved')) : t('signedOut')}>
                <Icon className="w-3.5 h-3.5" aria-hidden="true" />
                <span className="hidden sm:inline">{label}</span>
                <ChevronDown className="w-3 h-3" aria-hidden="true" />
            </button>
            {open && (
                <div role="dialog" aria-label={t('title')} className="absolute right-0 top-full mt-2 w-[min(22rem,calc(100vw-2rem))] z-40 bb-surface bg-background shadow-[6px_6px_0_rgb(var(--foreground))] p-3 flex flex-col gap-3 text-left">
                    {!user ? (
                        <>
                            <p className="text-[12px] font-semibold text-muted-foreground">{t('signedOut')}</p>
                            <Link href={{pathname: '/signin', query: {next: NEXT}}} className={cn(btn, "bg-accent self-start")}>
                                <Cloud className="w-3.5 h-3.5" /> {t('signIn')}
                            </Link>
                        </>
                    ) : (
                        <>
                            <div className="flex items-center justify-between gap-2">
                                <p className="text-[11px] font-extrabold uppercase tracking-wide text-muted-foreground">{t('title')}</p>
                                <span className="text-[11px] font-semibold text-muted-foreground truncate">{user.email}</span>
                            </div>
                            <p className="text-[12px] font-semibold text-muted-foreground">
                                {link ? (saving ? t('saving') : t('savedAt', {when: format.relativeTime(new Date(link.savedAt))})) : t('notSaved')}
                            </p>
                            <div className="flex flex-wrap gap-2">
                                <button type="button" onClick={() => void cloud.save(false)} disabled={cloud.busy !== null} className={cn(btn, "bg-accent")}>
                                    <Cloud className="w-3.5 h-3.5" /> {link ? t('saveNow') : t('save')}
                                </button>
                                {link && (
                                    <button type="button" onClick={() => void cloud.save(true)} disabled={cloud.busy !== null} className={cn(btn, "bg-card")}>{t('saveAsNew')}</button>
                                )}
                                {link && (
                                    <button type="button" onClick={cloud.unlink} disabled={cloud.busy !== null} className={cn(btn, "bg-card")} title={t('unlinkHint')}>
                                        <CloudOff className="w-3.5 h-3.5" /> {t('unlink')}
                                    </button>
                                )}
                            </div>
                            {cloud.error && <p role="alert" className="text-[12px] font-bold text-red-800">{cloud.error}</p>}
                            <ShareBlock cloud={cloud} />
                            <SavedList cloud={cloud} config={config} onDone={() => setOpen(false)} />
                        </>
                    )}
                </div>
            )}
        </div>
    );
}

/** Above the setup, with no auction configured: the saved auctions, to start from one. Nothing for visitors. */
export function CloudPanel({purchases}: {purchases: Purchase[]}) {
    const t = useTranslations('Fantasy.cloud');
    const cloud = useCloud(null, purchases);
    if (!cloud.user) return null;
    return (
        <Panel title={t('title')} action={<span className="text-[11px] font-semibold text-muted-foreground truncate max-w-[50%]">{cloud.user.email}</span>}>
            <div className="px-3 py-3 flex flex-col gap-3">
                {cloud.error && <p role="alert" className="text-[12px] font-bold text-red-800">{cloud.error}</p>}
                <SavedList cloud={cloud} config={null} />
            </div>
        </Panel>
    );
}
