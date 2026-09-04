'use client';

import {useState, type ReactNode} from "react";

export interface SelectPanel {
    id: string;
    label: string;
    content: ReactNode;
}

/** A <select> that reveals one of many server-rendered panels (rounds of a season). */
export function SelectPanels({panels, defaultId, label}: {panels: SelectPanel[]; defaultId?: string; label: string}) {
    const [active, setActive] = useState(defaultId && panels.some((p) => p.id === defaultId) ? defaultId : panels[0]?.id);
    if (panels.length === 0) return null;
    return (
        <div className="flex flex-col gap-2">
            <label className="flex items-center gap-2 text-[12px] font-extrabold uppercase tracking-wide text-muted-foreground">
                {label}
                <select value={active} onChange={(e) => setActive(e.target.value)} className="bb-input px-2 h-8 text-[13px] font-bold normal-case tracking-normal text-foreground">
                    {panels.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
                </select>
            </label>
            {panels.map((p) => (
                <div key={p.id} hidden={p.id !== active} className="flex flex-col gap-3 min-w-0">{p.content}</div>
            ))}
        </div>
    );
}
