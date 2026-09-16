import {describe, expect, it} from 'vitest';
import {fantaDisplayName} from './fanta-name';

describe('fantaDisplayName', () => {
    it('takes the fantasy surname with the provider initial in front', () => {
        expect(fantaDisplayName('Valdepenas', 'Valde')).toBe('Valdepenas');
        expect(fantaDisplayName('Carnesecchi', 'M. Carnesecchi')).toBe('M. Carnesecchi');
        expect(fantaDisplayName('Calhanoglu', 'H. Çalhanoğlu')).toBe('H. Calhanoglu');
        expect(fantaDisplayName('Martinez L.', 'Lautaro Martínez')).toBe('L. Martinez');
        expect(fantaDisplayName('Goncalves P.', 'Pote')).toBe('P. Goncalves');
        expect(fantaDisplayName('Ederson D.S.', 'Éderson')).toBe('D. Ederson');
        expect(fantaDisplayName('Rodriguez Ju.', 'J. Rodríguez')).toBe('J. Rodriguez');
    });
    it('keeps a two-word fantasy name as it is', () => {
        expect(fantaDisplayName('Douglas Luiz', 'Douglas Luiz')).toBe('Douglas Luiz');
        expect(fantaDisplayName('Tiago Gabriel', 'Tiago Gabriel')).toBe('Tiago Gabriel');
        expect(fantaDisplayName('Zè Pedro', 'Zé Pedro')).toBe('Zè Pedro');
        expect(fantaDisplayName('De Gea', 'David de Gea')).toBe('De Gea');
    });
});
