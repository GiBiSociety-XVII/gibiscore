import {describe, expect, it} from 'vitest';
import {cleanName, decodeEntities, guessLostBytes, repairName, unmangle} from './names';

describe('decodeEntities', () => {
    it('decodes the named and numeric entities the provider uses', () => {
        expect(decodeEntities('M&apos;Bala Nzola')).toBe("M'Bala Nzola");
        expect(decodeEntities('J. O&apos;Reilly-O&apos;Sullivan')).toBe("J. O'Reilly-O'Sullivan");
        expect(decodeEntities('D&#39;Ambrosio &amp; C. &#x27;')).toBe("D'Ambrosio & C. '");
    });
    it('leaves text without entities alone', () => {
        expect(decodeEntities('K. Yıldız')).toBe('K. Yıldız');
    });
});

describe('unmangle', () => {
    it('reads UTF-8 shown as Latin-1 back', () => {
        expect(unmangle('O. HÃ¸jlund')).toBe('O. Højlund');
        expect(unmangle('JoÃ£o Vasconcelos')).toBe('João Vasconcelos');
        expect(unmangle('J. LÃ¤hteenmÃ¤ki')).toBe('J. Lähteenmäki');
        expect(unmangle('C. Inao OulaÃ¯')).toBe('C. Inao Oulaï');
    });
    it('keeps real Scandinavian and Portuguese letters', () => {
        expect(unmangle('O. Ågren')).toBe('O. Ågren');
        expect(unmangle('E. Äijälä')).toBe('E. Äijälä');
        expect(unmangle('Miguel Ângelo Ferreira Pires')).toBe('Miguel Ângelo Ferreira Pires');
    });
    it('keeps sound letters next to damaged ones', () => {
        expect(unmangle('Gylfi Berg SnÃ¦hólm')).toBe('Gylfi Berg Snæhólm');
    });
});

describe('guessLostBytes', () => {
    it('restores the Slavic letters whose second byte was dropped', () => {
        expect(guessLostBytes('M. JoviÄ')).toBe('M. Jović');
        expect(guessLostBytes('M. LjubiÄiÄ')).toBe('M. Ljubičić');
        expect(guessLostBytes('J. UsaviÄius')).toBe('J. Usavičius');
        expect(guessLostBytes('M. Å eva')).toBe('M. Ševa');
        expect(guessLostBytes('K. UrbaÅski')).toBe('K. Urbański');
        expect(guessLostBytes('E. SÅowikowski')).toBe('E. Słowikowski');
        expect(guessLostBytes('W. Å»oÅneczko')).toBe('W. Żołneczko');
    });
    it('does not touch letters that are real at the start of a word', () => {
        expect(guessLostBytes('P. Åslund')).toBe('P. Åslund');
        expect(guessLostBytes('Bo Åsulv Hegland')).toBe('Bo Åsulv Hegland');
        expect(guessLostBytes('E. Äijälä')).toBe('E. Äijälä');
    });
});

describe('cleanName', () => {
    it('does the whole treatment', () => {
        expect(cleanName('M&apos;Bala Nzola')).toBe("M'Bala Nzola");
        expect(cleanName('K. N’Dri')).toBe("K. N'Dri");
        expect(cleanName('D. N´Guessan')).toBe("D. N'Guessan");
        expect(cleanName('J.  McGinn')).toBe('J. McGinn');
        expect(cleanName(' Reed Baker-Whiting')).toBe('Reed Baker-Whiting');
        expect(cleanName('Alejandro Vergaz\t')).toBe('Alejandro Vergaz');
        expect(cleanName('Dani MartÃ­nez')).toBe('Dani Martínez');
    });
    it('leaves a sound name untouched', () => {
        expect(cleanName('H. Çalhanoğlu')).toBe('H. Çalhanoğlu');
        expect(cleanName('Ł. Skorupski')).toBe('Ł. Skorupski');
    });
});

describe('repairName', () => {
    it('takes the damaged word from the last name', () => {
        expect(repairName('L. JovanoviÄ', 'Lazar', 'Jovanović')).toBe('L. Jovanović');
        expect(repairName('S. ÄukanoviÄ', 'Stefan', 'Đukanović')).toBe('S. Đukanović');
        expect(repairName('A. DÄncuÈ', 'Andrei', 'Dăncuș')).toBe('A. Dăncuș');
        expect(repairName('M. RÄcÄÈan', 'Mihai Florin', 'Răcășan')).toBe('M. Răcășan');
        expect(repairName('N. Äelik', 'Nidal', 'Čelik')).toBe('N. Čelik');
        expect(repairName('A. Å utkoviÄ', 'Arman', 'Šutković')).toBe('A. Šutković');
    });
    it('repairs the initial from the first name', () => {
        expect(repairName('Ã. Umathum', 'Ádám', 'Umathum')).toBe('Á. Umathum');
        expect(repairName('L. Ãstman', 'Leo Håkan', 'Östman')).toBe('L. Östman');
    });
    it('falls back to the plain rules without parts', () => {
        expect(repairName('M&apos;Bala Nzola', "M'Bala", 'Nzola')).toBe("M'Bala Nzola");
        expect(repairName('S. PirgiÄ', null, null)).toBe('S. Pirgić');
        expect(repairName('Ãlvaro Killane', 'Álvaro', 'Killane Giardini')).toBe('Álvaro Killane');
    });
    it('restores a letter whose lost byte was a no-break space', () => {
        expect(repairName('J. MalusÃ ', 'Joel', 'Malusà')).toBe('J. Malusà');
    });
    it('leaves a damaged letter it cannot name', () => {
        expect(repairName('S. AÄalarov', 'Sanan', 'Aghalarov')).toBe('S. AÄalarov');
        expect(repairName('A. ChinteÈ', null, null)).toBe('A. ChinteÈ');
    });
    it('does not let a mangled part damage a sound name', () => {
        expect(repairName('M. Svilar', 'MomÄilo', 'Svilar')).toBe('M. Svilar');
        expect(repairName('A. Gomez', 'Ãlex', 'Gómez')).toBe('A. Gomez');
    });
});
