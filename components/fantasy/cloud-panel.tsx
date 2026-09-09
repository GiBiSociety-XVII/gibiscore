'use client';

import {Cloud, CloudOff, Trash2} from "lucide-react";
import {useEffect, useRef, useState} from "react";
import {useFormatter, useLocale, useTranslations} from "next-intl";
import {Link} from "@/i18n/navigation";
import {cn} from "@/components/shared/ui/cn";
import {Panel} from "@/components/shell/panel";
import type {AuctionConfig, Purchase} from "@/lib/fantasy/config";
import {cloudUser, deleteAuction, listAuctions, loadAuction, saveAuction, type CloudAuction, type CloudUser} from "@/lib/fantasy/cloud";
import {cloudStore, configStore, purchasesStore} from "@/lib/fantasy/store";

/** A change is written to the cloud this long after the last one. */
const AUTOSAVE_MS = 2_500;

/**
 * The auction in the cloud: sign-in prompt for visitors; for the signed-in
 * user, save the auction on this device (then every change follows by
 * itself), load one saved earlier, delete it. With no auction configured
 * yet (`config` null) only the saved list shows, to start from one.
 */
export function CloudPanel({config, purchases}: {config: AuctionConfig | null; purchases: Purchase[]}) {
    const t = useTranslations('Fantasy.cloud');
    const format = useFormatter();
    const locale = useLocale();
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

    const next = `/${locale}/fantacalcio/asta`;
    const btn = "bb-btn h-8 px-2.5 text-[12px] font-extrabold inline-flex items-center gap-1 disabled:opacity-50";

    if (user === undefined) return null;
    if (!user) {
        if (!config) return null;
        return (
            <Panel title={t('title')}>
                <div className="px-3 py-3 flex flex-col gap-2">
                    <p className="text-[12px] font-semibold text-muted-foreground">{t('signedOut')}</p>
                    <Link href={{pathname: '/account', query: {next}}} className={cn(btn, "bg-accent self-start")}>
                        <Cloud className="w-3.5 h-3.5" /> {t('signIn')}
                    </Link>
                </div>
            </Panel>
        );
    }

    const linked = link ? saved.find((r) => r.id === link.id) : undefined;
    return (
        <Panel title={t('title')} action={<span className="text-[11px] font-semibold text-muted-foreground truncate max-w-[50%]">{user.email}</span>}>
            <div className="px-3 py-3 flex flex-col gap-3">
                {config && (
                    <div className="flex flex-col gap-2">
                        <p className="text-[12px] font-semibold text-muted-foreground">
                            {link
                                ? pending || busy === 'save'
                                    ? t('saving')
                                    : t('savedAt', {when: format.relativeTime(new Date(link.savedAt))})
                                : t('notSaved')}
                        </p>
                        <div className="flex flex-wrap gap-2">
                            <button type="button" onClick={() => void save(false)} disabled={busy !== null} className={cn(btn, "bg-accent")}>
                                <Cloud className="w-3.5 h-3.5" /> {link ? t('saveNow') : t('save')}
                            </button>
                            {link && (
                                <button type="button" onClick={() => void save(true)} disabled={busy !== null} className={cn(btn, "bg-card")}>
                                    {t('saveAsNew')}
                                </button>
                            )}
                            {link && (
                                <button type="button" onClick={() => cloudStore.write(null)} disabled={busy !== null} className={cn(btn, "bg-card")} title={t('unlinkHint')}>
                                    <CloudOff className="w-3.5 h-3.5" /> {t('unlink')}
                                </button>
                            )}
                        </div>
                    </div>
                )}
                {error && <p role="alert" className="text-[12px] font-bold text-red-800">{error}</p>}
                <div className="flex flex-col gap-1">
                    <p className="text-[11px] font-extrabold uppercase tracking-wide text-muted-foreground">{t('saved', {count: saved.length})}</p>
                    {saved.length === 0 ? (
                        <p className="text-[12px] font-semibold text-muted-foreground">{config ? t('noneYet') : t('noneToLoad')}</p>
                    ) : (
                        <ul className="flex flex-col divide-y divide-muted">
                            {saved.map((row) => {
                                const current = linked?.id === row.id;
                                return (
                                    <li key={row.id} className={cn("flex items-center gap-2 py-1.5", current && "font-extrabold")}>
                                        <div className="min-w-0 flex-1">
                                            <p className="text-[13px] truncate">{row.name}{current && <span className="ml-1 text-[10px] uppercase text-muted-foreground">{t('current')}</span>}</p>
                                            <p className="text-[11px] font-semibold text-muted-foreground">{t('rowMeta', {league: row.league, purchases: row.purchasesCount, when: format.relativeTime(new Date(row.updatedAt))})}</p>
                                        </div>
                                        <button type="button" onClick={() => void load(row)} disabled={busy !== null} className={cn(btn, "bg-card")}>{t('load')}</button>
                                        <button type="button" onClick={() => void remove(row)} disabled={busy !== null} aria-label={t('delete')} title={t('delete')} className={cn(btn, "bg-card px-2")}><Trash2 className="w-3.5 h-3.5" /></button>
                                    </li>
                                );
                            })}
                        </ul>
                    )}
                </div>
            </div>
        </Panel>
    );
}
