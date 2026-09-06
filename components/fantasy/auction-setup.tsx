'use client';

import {useState} from "react";
import {useTranslations} from "next-intl";
import {cn} from "@/components/shared/ui/cn";
import {Panel} from "@/components/shell/panel";
import {AUCTION_LEAGUES, DEFAULT_CONFIG, DEFAULT_SLOTS, totalSlots, type AuctionConfig, type AuctionMode} from "@/lib/fantasy/config";
import type {FantaRole} from "@/lib/fantasy/scores";

const ROLES: FantaRole[] = ['P', 'D', 'C', 'A'];

function Field({label, hint, children, className}: {label: string; hint?: string; children: React.ReactNode; className?: string}) {
    return (
        <label className={cn("flex flex-col gap-1", className)}>
            <span className="text-[11px] font-extrabold uppercase tracking-wide text-muted-foreground">{label}</span>
            {children}
            {hint && <span className="text-[11px] font-semibold text-muted-foreground">{hint}</span>}
        </label>
    );
}

const input = "bb-input h-9 px-2.5 text-[14px] font-semibold w-full";
const numberInput = `${input} font-mono tabular-nums`;

/**
 * Number typed freely (digits, and a sign or decimals when allowed):
 * nothing is clamped while typing, the value is checked when the field
 * is left, and the text is selected on focus so a new number replaces
 * the old one.
 */
function NumberField({value, onCommit, min, max, decimals = false, className}: {value: number; onCommit: (n: number) => void; min: number; max: number; decimals?: boolean; className?: string}) {
    const [text, setText] = useState(String(value));
    const [editing, setEditing] = useState(false);
    const shown = editing ? text : String(value);
    const commit = () => {
        setEditing(false);
        const n = Number(text.replace(',', '.'));
        if (text.trim() === '' || !Number.isFinite(n)) return;
        onCommit(Math.min(max, Math.max(min, decimals ? Math.round(n * 2) / 2 : Math.round(n))));
    };
    return (
        <input
            type="text"
            inputMode={decimals ? 'decimal' : 'numeric'}
            className={cn(numberInput, className)}
            value={shown}
            onFocus={(e) => {
                setText(String(value));
                setEditing(true);
                e.currentTarget.select();
            }}
            onChange={(e) => setText(e.target.value.replace(decimals ? /[^0-9.,-]/g : /[^0-9]/g, '').slice(0, 6))}
            onBlur={commit}
            onKeyDown={(e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    e.currentTarget.blur();
                }
            }}
        />
    );
}

/** Auction settings form: league, mode, credits, squad, scoring rules, modifiers, managers. */
export function AuctionSetup({initial, onSave, onCancel}: {initial: AuctionConfig | null; onSave: (config: AuctionConfig) => void; onCancel?: () => void}) {
    const t = useTranslations('Fantasy.setup');
    const [config, setConfig] = useState<AuctionConfig>(initial ?? DEFAULT_CONFIG);
    const [managersText, setManagersText] = useState((initial?.managers ?? []).join('\n'));
    const set = <K extends keyof AuctionConfig>(key: K, value: AuctionConfig[K]) => setConfig((c) => ({...c, [key]: value}));
    const setMode = (mode: AuctionMode) => setConfig((c) => ({...c, mode, slots: DEFAULT_SLOTS[mode]}));
    const submit = (e: React.FormEvent) => {
        e.preventDefault();
        const managers = managersText.split('\n').map((m) => m.trim()).filter(Boolean).slice(0, 20);
        onSave({...config, managers});
    };

    return (
        <form onSubmit={submit} className="flex flex-col gap-3">
            <Panel title={t('title')}>
                <div className="px-3 py-3 flex flex-col gap-3">
                    <p className="text-[12px] font-semibold text-muted-foreground">{t('intro')}</p>
                    <div className="grid gap-3 grid-cols-1 md:grid-cols-2">
                        <Field label={t('name')}>
                            <input className={input} value={config.name} onChange={(e) => set('name', e.target.value)} placeholder={t('namePlaceholder')} maxLength={40} />
                        </Field>
                        <Field label={t('league')}>
                            <select className={input} value={config.league} onChange={(e) => set('league', e.target.value as AuctionConfig['league'])}>
                                {AUCTION_LEAGUES.map((l) => <option key={l.key} value={l.key}>{t(`leagues.${l.key}`)}</option>)}
                            </select>
                        </Field>
                        <Field label={t('mode')} hint={config.mode === 'mantra' ? t('mantraHint') : undefined}>
                            <div role="radiogroup" className="flex gap-1">
                                {(['classic', 'mantra'] as const).map((m) => (
                                    <button key={m} type="button" role="radio" aria-checked={config.mode === m} onClick={() => setMode(m)} className={cn("bb-btn px-3 h-9 text-[13px] font-extrabold flex-1", config.mode === m ? "bg-foreground text-background" : "bg-card")}>{t(`modes.${m}`)}</button>
                                ))}
                            </div>
                        </Field>
                        <div className="grid grid-cols-2 gap-3">
                            <Field label={t('participants')}>
                                <NumberField value={config.participants} min={2} max={20} onCommit={(n) => set('participants', n)} />
                            </Field>
                            <Field label={t('credits')}>
                                <NumberField value={config.credits} min={50} max={5000} onCommit={(n) => set('credits', n)} />
                            </Field>
                        </div>
                        <Field label={t('priceLevel')} hint={t('priceLevelHint')}>
                            <NumberField value={config.priceLevel} min={50} max={300} onCommit={(n) => set('priceLevel', n)} className="max-w-[140px]" />
                        </Field>
                    </div>
                </div>
            </Panel>

            <div className="grid gap-3 grid-cols-1 md:grid-cols-2">
                <Panel title={t('slots')} action={<span className="text-[11px] font-bold text-muted-foreground">{t('slotsTotal', {count: totalSlots(config.slots)})}</span>}>
                    <div className="grid grid-cols-4 gap-2 px-3 py-3">
                        {ROLES.map((r) => (
                            <Field key={r} label={t(`roles.${r}`)}>
                                <NumberField value={config.slots[r]} min={1} max={12} onCommit={(n) => set('slots', {...config.slots, [r]: n})} />
                            </Field>
                        ))}
                    </div>
                </Panel>
                <Panel title={t('modifiers')}>
                    <div className="grid grid-cols-2 gap-2 px-3 py-3">
                        {(Object.keys(config.modifiers) as Array<keyof AuctionConfig['modifiers']>).map((k) => (
                            <label key={k} className="flex items-center gap-2 text-[13px] font-bold">
                                <input type="checkbox" checked={config.modifiers[k]} onChange={(e) => set('modifiers', {...config.modifiers, [k]: e.target.checked})} className="w-4 h-4 accent-[rgb(var(--accent))]" />
                                {t(`modifier.${k}`)}
                            </label>
                        ))}
                    </div>
                    <label className="flex items-start gap-2 px-3 py-2 border-t border-muted cursor-pointer">
                        <input type="checkbox" checked={config.cupsCount} onChange={(e) => set('cupsCount', e.target.checked)} className="w-4 h-4 mt-0.5 accent-[rgb(var(--accent))]" />
                        <span className="flex flex-col"><span className="text-[13px] font-bold">{t('cupsCount')}</span><span className="text-[11px] font-semibold text-muted-foreground">{t('cupsCountHint')}</span></span>
                    </label>
                </Panel>
            </div>

            <div className="grid gap-3 grid-cols-1 md:grid-cols-2">
                <Panel title={t('rules')}>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 px-3 py-3">
                        {(Object.keys(config.rules) as Array<keyof AuctionConfig['rules']>).map((k) => (
                            <Field key={k} label={t(`rule.${k}`)}>
                                <NumberField value={config.rules[k]} min={-10} max={10} decimals onCommit={(n) => set('rules', {...config.rules, [k]: n})} />
                            </Field>
                        ))}
                        <p className="col-span-full text-[11px] font-semibold text-muted-foreground">{t('rulesHint')}</p>
                    </div>
                </Panel>
                <Panel title={t('managers')}>
                    <div className="px-3 py-3 flex flex-col gap-1">
                        <textarea className={`${input} h-28 py-2 resize-y`} value={managersText} onChange={(e) => setManagersText(e.target.value)} placeholder={'Io\nMarco\nLuca'} />
                        <span className="text-[11px] font-semibold text-muted-foreground">{t('managersHint')}</span>
                    </div>
                </Panel>
            </div>

            <div className="flex items-center gap-2 justify-end">
                {onCancel && <button type="button" onClick={onCancel} className="bb-btn bg-card px-4 h-10 text-[13px] font-extrabold">{t('cancel')}</button>}
                <button type="submit" className="bb-btn bg-accent px-4 h-10 text-[13px] font-extrabold">{t('save')}</button>
            </div>
        </form>
    );
}
