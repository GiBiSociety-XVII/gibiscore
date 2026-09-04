'use client';

import {CalendarDays} from "lucide-react";
import {useRouter} from "@/i18n/navigation";

/** Calendar icon hiding a native date input: picking a day opens its scores page. */
export function DatePicker({value, today, label}: {value: string; today: string; label: string}) {
    const router = useRouter();
    return (
        <label className="relative inline-flex items-center h-7 w-7 justify-center rounded-md hover:bg-muted cursor-pointer" aria-label={label} title={label}>
            <CalendarDays className="w-4 h-4" />
            <input
                type="date"
                defaultValue={value}
                className="absolute inset-0 opacity-0 cursor-pointer"
                onChange={(e) => {
                    const day = e.target.value;
                    if (/^\d{4}-\d{2}-\d{2}$/.test(day)) router.push(day === today ? '/' : `/scores/${day}`);
                }}
            />
        </label>
    );
}
