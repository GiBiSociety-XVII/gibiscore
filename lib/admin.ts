/**
 * The site's administrator: one account, named by its user id in
 * NEXT_PUBLIC_PREMIUM_ADMIN_UID (the same convention as GiBiArena). Public
 * on purpose: the id is not a secret, the session is; the pages only hide
 * themselves, the routes that write check the signed-in user against it.
 */
export const ADMIN_UID = process.env.NEXT_PUBLIC_PREMIUM_ADMIN_UID ?? '';

export const isAdminId = (id: string | null | undefined): boolean => ADMIN_UID !== '' && id === ADMIN_UID;
