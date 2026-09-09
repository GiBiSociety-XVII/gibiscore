import {describe, expect, it} from 'vitest';
import {localePath, safeNext} from './next';

describe('localePath', () => {
    it('prefixes only the other locales', () => {
        expect(localePath('it', '/account')).toBe('/account');
        expect(localePath('en', '/account')).toBe('/en/account');
    });
});

describe('safeNext', () => {
    it('keeps a same-site path', () => {
        expect(safeNext('/it/fantacalcio/asta?league=serie-a', 'it')).toBe('/it/fantacalcio/asta?league=serie-a');
    });
    it('refuses anything that could leave the site', () => {
        expect(safeNext('//evil.example', 'it')).toBe('/fantacalcio/asta');
        expect(safeNext('https://evil.example', 'it')).toBe('/fantacalcio/asta');
        expect(safeNext('/\\evil.example', 'it')).toBe('/fantacalcio/asta');
        expect(safeNext(undefined, 'it')).toBe('/fantacalcio/asta');
        expect(safeNext(['/a', '/b'], 'it')).toBe('/fantacalcio/asta');
    });
});
