import {flagUrl} from "@/lib/football/data/shared";
import {cn} from "@/components/shared/ui/cn";

/** Country flag (or competition logo for international ones), plain img: hundreds per page. */
export function Flag({code, logoUrl, size = 16, className}: {code: string | null | undefined; logoUrl?: string | null; size?: number; className?: string}) {
    const src = flagUrl(code) ?? logoUrl ?? null;
    return (
        <span className={cn("inline-flex items-center justify-center shrink-0 overflow-hidden rounded-[3px]", className)} style={{width: size, height: size}}>
            {src ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={src} alt="" width={size} height={size} loading="lazy" className="object-contain w-full h-full" />
            ) : (
                <span className="w-full h-full rounded-full bg-muted" />
            )}
        </span>
    );
}
