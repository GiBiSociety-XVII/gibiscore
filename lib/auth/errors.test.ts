import {describe, expect, it} from 'vitest';
import {authErrorKey} from './errors';

describe('authErrorKey', () => {
    it('recognises the messages Supabase Auth sends', () => {
        expect(authErrorKey('Invalid login credentials')).toBe('credentials');
        expect(authErrorKey('User already registered')).toBe('exists');
        expect(authErrorKey('Password should be at least 8 characters')).toBe('weak');
        expect(authErrorKey('Email rate limit exceeded')).toBe('rate');
    });
    it('falls back to a generic message', () => {
        expect(authErrorKey('fetch failed')).toBe('generic');
    });
});
