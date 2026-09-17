'use client';

import {useEffect, useState} from "react";
import {Bell, BellOff, BellRing, Smartphone} from "lucide-react";
import {useTranslations} from "next-intl";
import {Panel} from "@/components/shell/panel";
import {cn} from "@/components/shared/ui/cn";
import {Help} from "@/components/fantasy/help";
import {currentSubscription, KINDS, pushSupport, subscribePush, unsubscribePush, type PushSupport} from "@/lib/notifications/client";

type Kind = (typeof KINDS)[number];
interface Settings {
    enabled: boolean;
    kinds: Record<Kind, boolean>;
    devices: number;
}

/**
 * The notifications of the favourite competitions and teams, on the
 * profile page: this device on or off, the master switch, one switch
 * per kind. Everything is saved as it is touched.
 */
export function NotificationsPanel() {
    const t = useTranslations('Account.profile.notifications');
    const [support, setSupport] = useState<PushSupport | null>(null);
    const [device, setDevice] = useState<'on' | 'off' | 'busy'>('off');
    const [denied, setDenied] = useState(false);
    const [settings, setSettings] = useState<Settings | null>(null);
    const [state, setState] = useState<'idle' | 'saving' | 'error'>('idle');

    useEffect(() => {
        let alive = true;
        const support = pushSupport();
        queueMicrotask(() => setSupport(support));
        if (support === 'ok') currentSubscription().then((sub) => { if (alive) setDevice(sub ? 'on' : 'off'); }).catch(() => undefined);
        fetch('/api/notifications/settings').then((r) => (r.ok ? (r.json() as Promise<Settings>) : null)).then((s) => { if (alive && s) setSettings(s); }).catch(() => undefined);
        return () => { alive = false; };
    }, []);

    const toggleDevice = async () => {
        if (device === 'busy') return;
        setDevice('busy');
        setDenied(false);
        if (await currentSubscription()) {
            await unsubscribePush();
            setDevice('off');
            setSettings((s) => (s ? {...s, devices: Math.max(0, s.devices - 1)} : s));
            return;
        }
        const result = await subscribePush();
        if (result === 'ok') {
            setDevice('on');
            setSettings((s) => (s ? {...s, devices: s.devices + 1} : s));
        } else {
            setDevice('off');
            if (result === 'denied') setDenied(true);
        }
    };

    const save = async (next: Settings) => {
        setSettings(next);
        setState('saving');
        try {
            const res = await fetch('/api/notifications/settings', {method: 'POST', headers: {'content-type': 'application/json'}, body: JSON.stringify({enabled: next.enabled, kinds: next.kinds})});
            setState(res.ok ? 'idle' : 'error');
        } catch {
            setState('error');
        }
    };

    const switchClass = (on: boolean) => cn("bb-btn h-8 px-3 text-[12px] font-extrabold inline-flex items-center gap-1.5", on ? "bg-foreground text-background" : "bg-card");

    return (
        <Panel title={t('title')} action={settings && settings.devices > 0 ? <span className="font-mono text-[11px] text-muted-foreground inline-flex items-center gap-1"><Smartphone className="w-3 h-3" aria-hidden="true" />{t('devices', {count: settings.devices})}</span> : undefined}>
            <div className="px-3 py-2 flex flex-col gap-3 text-[13px]">
                <p className="text-[12px] font-semibold text-muted-foreground leading-snug">{t('intro')}</p>

                {/* This device */}
                <div className="flex flex-wrap items-center gap-2">
                    {support === 'ok' && (
                        <button type="button" onClick={toggleDevice} disabled={device === 'busy'} className={cn("bb-btn h-9 px-3 text-[12px] font-extrabold inline-flex items-center gap-1.5 disabled:opacity-60", device === 'on' ? "bg-card" : "bg-accent")}>
                            {device === 'on' ? <><BellOff className="w-3.5 h-3.5" aria-hidden="true" />{t('deviceOff')}</> : <><BellRing className="w-3.5 h-3.5" aria-hidden="true" />{t('deviceOn')}</>}
                        </button>
                    )}
                    <span className="text-[12px] font-semibold text-muted-foreground">
                        {support === 'ok' && (device === 'on' ? t('deviceIsOn') : t('deviceIsOff'))}
                        {support === 'ios-install' && t('iosInstall')}
                        {support === 'unsupported' && t('unsupported')}
                        {support === 'not-configured' && t('notConfigured')}
                    </span>
                    {denied && <span className="text-[12px] font-semibold text-red-700">{t('denied')}</span>}
                </div>

                {/* The switches */}
                {settings && (
                    <div className="flex flex-col gap-2 border-t border-muted pt-3">
                        <div className="flex items-center gap-2 flex-wrap">
                            <button type="button" onClick={() => save({...settings, enabled: !settings.enabled})} className={switchClass(settings.enabled)} aria-pressed={settings.enabled}>
                                {settings.enabled ? <Bell className="w-3.5 h-3.5" aria-hidden="true" /> : <BellOff className="w-3.5 h-3.5" aria-hidden="true" />}
                                {settings.enabled ? t('masterOn') : t('masterOff')}
                            </button>
                            <Help boxed text={t('masterHint')} />
                            {state === 'saving' && <span className="text-[11px] font-semibold text-muted-foreground">{t('saving')}</span>}
                            {state === 'error' && <span className="text-[11px] font-semibold text-red-700">{t('error')}</span>}
                        </div>
                        <div className={cn("flex flex-wrap gap-1.5", !settings.enabled && "opacity-50")}>
                            {KINDS.map((k) => (
                                <button key={k} type="button" disabled={!settings.enabled} onClick={() => save({...settings, kinds: {...settings.kinds, [k]: !settings.kinds[k]}})} aria-pressed={settings.kinds[k]} className={switchClass(settings.kinds[k])}>
                                    {t(`kinds.${k}`)}
                                </button>
                            ))}
                        </div>
                        <p className="text-[11px] font-semibold text-muted-foreground leading-snug">{t('muteHint')}</p>
                    </div>
                )}
            </div>
        </Panel>
    );
}
