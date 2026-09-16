import {describe, expect, it} from 'vitest';
import {parseVotiWorkbook} from './voti-workbook';

const sheet: Array<Array<string | null>> = [
    ['Voti Fantacalcio 1ª giornata di campionato'],
    ['Solo su www.fantacalcio.it i voti ufficiali per la tua lega'],
    ['Atalanta'],
    ['Cod.', 'Ruolo', 'Nome', 'Voto', 'Gf', 'Gs', 'Rp', 'Rs', 'Rf', 'Au', 'Amm', 'Esp', 'Ass'],
    ['4431', 'P', 'Carnesecchi', '6.5', '0', '1', '0', '0', '0', '0', '0', '0', '1'],
    ['554', 'D', 'Zappacosta', '6*', '0', '0', '0', '0', '0', '0', '0', '0', '0'],
    ['4971', 'ALL', 'Juric', '6', '0', '0', '0', '0', '0', '0', '0', '0', '0'],
    ['Bologna'],
    ['Cod.', 'Ruolo', 'Nome', 'Voto', 'Gf', 'Gs', 'Rp', 'Rs', 'Rf', 'Au', 'Amm', 'Esp', 'Ass'],
    ['2167', 'C', 'Orsolini', '7,5', '1', '0', '0', '0', '1', '0', '1', '0', '0'],
];

describe('parseVotiWorkbook', () => {
    it('reads the round from the title and one row per player, the coach left out', () => {
        const book = parseVotiWorkbook([{name: 'Fantacalcio', rows: sheet}]);
        expect(book.round).toBe(1);
        expect(book.source).toBe('Fantacalcio');
        expect(book.clubs).toBe(2);
        expect(book.rows).toEqual([
            ['Atalanta', 'P', 'Carnesecchi', 6.5, 0, 1, 0, 0, 0, 0, 0, 0, 1],
            ['Atalanta', 'D', 'Zappacosta', null, 0, 0, 0, 0, 0, 0, 0, 0, 0],
            ['Bologna', 'C', 'Orsolini', 7.5, 1, 0, 0, 0, 1, 0, 1, 0, 0],
        ]);
    });
    it('has no round when the title does not name one', () => {
        expect(parseVotiWorkbook([{name: 'Voti', rows: sheet.slice(2)}]).round).toBeNull();
    });
    it('reads the Fantacalcio sheet when the workbook carries the three sources, else the first', () => {
        const other = sheet.map((r) => r.map((c) => (c === '6.5' ? '8' : c)));
        expect(parseVotiWorkbook([{name: 'Statistico', rows: other}, {name: 'Fantacalcio', rows: sheet}, {name: 'Italia', rows: other}]).rows[0][3]).toBe(6.5);
        expect(parseVotiWorkbook([{name: 'Statistico', rows: other}, {name: 'Italia', rows: sheet}]).source).toBe('Statistico');
    });
});
