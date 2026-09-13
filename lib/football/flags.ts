/** Country flags as served by the data provider's CDN. No server dependency: the scores list renders on the client too. */

export function normalizeCountryCode(code: string | null | undefined): string | null {
    if (!code) return null;
    const c = code.trim().toLowerCase();
    return /^[a-z]{2}$/.test(c) ? c : null;
}

export function flagUrl(code: string | null | undefined): string | null {
    const c = normalizeCountryCode(code);
    return c ? `https://media.api-sports.io/flags/${c}.svg` : null;
}
