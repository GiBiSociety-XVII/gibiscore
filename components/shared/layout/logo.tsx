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

/**
 * Icon + wordmark. Height in px, width follows the 925:232 ratio. Without
 * `dark` the lockup follows the page's theme (light wordmark on the dark
 * theme); `dark={true}` forces the dark-background variant, `dark={false}`
 * the light one.
 */
export function BrandLockup({site = 'gibiscore', height = 30, dark, className, alt}: {site?: GibiSite; height?: number; dark?: boolean; className?: string; alt?: string}) {
    const width = Math.round((height * 925) / 232);
    const label = alt ?? (site === 'gibiscore' ? 'GiBiScore' : site === 'gibiarena' ? 'GiBiArena' : 'GiBiSociety');
    if (dark !== undefined) {
        return <img src={`/brand/svg/${site}-lockup${dark ? '-dark' : ''}.svg`} alt={label} width={width} height={height} className={cn("shrink-0 select-none", className)} draggable={false} />;
    }
    // Two images, one shown per theme; the wrappers carry the switch so the caller's classes stay on the image.
    return (
        <>
            <span className="contents dark:hidden"><img src={`/brand/svg/${site}-lockup.svg`} alt={label} width={width} height={height} className={cn("shrink-0 select-none", className)} draggable={false} /></span>
            <span className="hidden dark:contents"><img src={`/brand/svg/${site}-lockup-dark.svg`} alt={label} width={width} height={height} className={cn("shrink-0 select-none", className)} draggable={false} /></span>
        </>
    );
}

/** Kept for existing imports: the GiBiScore icon. */
export function LogoMark({size = 36, className}: {size?: number; className?: string}) {
    return <BrandIcon size={size} className={className} />;
}
