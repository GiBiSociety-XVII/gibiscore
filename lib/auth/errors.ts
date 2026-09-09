/** Supabase Auth error → the key of the message to show; 'generic' when unknown. */
export type AuthErrorKey = 'credentials' | 'unconfirmed' | 'exists' | 'weak' | 'rate' | 'generic';

export function authErrorKey(message: string): AuthErrorKey {
    const m = message.toLowerCase();
    if (m.includes('invalid login') || m.includes('invalid credentials')) return 'credentials';
    if (m.includes('not confirmed')) return 'unconfirmed';
    if (m.includes('already registered') || m.includes('already exists')) return 'exists';
    if (m.includes('password') && (m.includes('weak') || m.includes('at least') || m.includes('should contain'))) return 'weak';
    if (m.includes('rate limit') || m.includes('too many')) return 'rate';
    return 'generic';
}
