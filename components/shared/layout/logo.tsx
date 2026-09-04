/* eslint-disable @next/next/no-img-element */
import {cn} from "@/components/shared/ui/cn";

/**
 * Identity GiBi assets (public/brand): black tile, GB in Poppins Bold as
 * curves, one glyph and one accent per site. Never rotated, stretched or
 * shadowed; below 32 px the full-accent variant is used.
 */
export type GibiSite = 'gibiscore' | 'gibiarena' | 'gibisociety';

/** Primary icon (black tile). `accent` switches to the full-accent tile for tiny sizes. */
export function BrandIcon({site = 'gibiscore', size = 32, accent = false, className, alt = ''}: {site?: GibiSite; size?: number; accent?: boolean; className?: string; alt?: string}) {
    const variant = accent || size < 32 ? 'icon-accent' : 'icon';
    return <img src={`/brand/svg/${site}-${variant}.svg`} alt={alt} width={size} height={size} className={cn("shrink-0 select-none", className)} draggable={false} />;
}

/** Icon + wordmark, for light (`dark={false}`) or dark backgrounds. Height in px, width follows the 925:232 ratio. */
export function BrandLockup({site = 'gibiscore', height = 30, dark = false, className, alt}: {site?: GibiSite; height?: number; dark?: boolean; className?: string; alt?: string}) {
    const width = Math.round((height * 925) / 232);
    return (
        <img
            src={`/brand/svg/${site}-lockup${dark ? '-dark' : ''}.svg`}
            alt={alt ?? (site === 'gibiscore' ? 'GiBiScore' : site === 'gibiarena' ? 'GiBiArena' : 'GiBiSociety')}
            width={width}
            height={height}
            className={cn("shrink-0 select-none", className)}
            draggable={false}
        />
    );
}

/** Kept for existing imports: the GiBiScore icon. */
export function LogoMark({size = 36, className}: {size?: number; className?: string}) {
    return <BrandIcon size={size} className={className} />;
}
