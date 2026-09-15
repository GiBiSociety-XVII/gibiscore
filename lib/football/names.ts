/**
 * Names as the provider sends them are not always names as people write
 * them: HTML entities ("M&apos;Bala"), UTF-8 read as Latin-1 ("JovanoviÄ"
 * for "Jović"), typographic apostrophes, doubled or stray spaces. Every
 * name goes through here before it is stored, and the same rules repair
 * what was stored before.
 */

const ENTITIES: Record<string, string> = {amp: '&', apos: "'", quot: '"', lt: '<', gt: '>', nbsp: ' '};

/** "&apos;" -> "'", "&#39;" -> "'", "&#x27;" -> "'"; unknown entities stay. */
export function decodeEntities(value: string): string {
    return value.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, code: string) => {
        if (code[0] === '#') {
            const n = code[1]?.toLowerCase() === 'x' ? Number.parseInt(code.slice(2), 16) : Number.parseInt(code.slice(1), 10);
            return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : match;
        }
        return ENTITIES[code.toLowerCase()] ?? match;
    });
}

/** A UTF-8 lead byte shown as a Latin-1 letter, followed by what was its continuation byte. */
const MOJIBAKE = /[\u00C2-\u00DF][\u0080-\u00BF]|[\u00E0-\u00EF][\u0080-\u00BF]{2}/;

/**
 * Text that was UTF-8 but got read as Latin-1 ("HÃ¸jlund"), decoded back
 * ("Højlund"). Only the damaged pairs are re-read, so a name that mixes
 * damaged and sound letters keeps the sound ones.
 */
export function unmangle(value: string): string {
    if (!MOJIBAKE.test(value)) return value;
    return value.replace(new RegExp(MOJIBAKE.source, 'g'), (pair) => {
        const decoded = Buffer.from(pair, 'latin1').toString('utf8');
        return decoded.includes('\uFFFD') ? pair : decoded;
    });
}

/**
 * The same damage with the second byte lost on the way (a control
 * character dropped, a no-break space turned into a space): "Jović" became
 * "JoviÄ", "Ševa" became "Å eva". Undone only where the shape is
 * unambiguous: an Ä or Å inside or at the end of a word, never at its
 * start, so a real "Åberg" or "Äijälä" is not touched.
 */
export function guessLostBytes(value: string): string {
    return value
        .replace(/\u00C5\u00BB/g, 'Ż')
        // "Å eva" -> "Ševa": a lone Å followed by a space and a lower-case letter never starts a real word
        .replace(/(^|[\s-])\u00C5 (?=\p{Ll})/gu, '$1Š')
        // ...ić: Ä at the end of a word
        .replace(/(?<=\p{L})\u00C4(?=$|[\s-])/gu, 'ć')
        // Ljubičić, Voitinovičius: Ä inside a word that ends the Slavic or Lithuanian way (elsewhere it could be ğ)
        .replace(/(?<=\p{L})\u00C4(?=\p{Ll}*(?:ć|ius)(?:$|[\s-]))/gu, 'č')
        // Urbański, Słowikowski: Å inside a word
        .replace(/(?<=\p{L})\u00C5(?=ski)/gu, 'ń')
        .replace(/(?<=\p{L})\u00C5(?=\p{Ll})/gu, 'ł');
}

/** Curly and spacing apostrophes to the plain one; whitespace to single spaces. */
export function tidy(value: string): string {
    return value
        .replace(/[\u2018\u2019\u201B\u2032\u00B4`\u02BC\u02B9]/g, "'")
        .replace(/[\s\u00A0]+/g, ' ')
        .trim();
}

/** The whole treatment for a name that comes alone. */
export function cleanName(value: string): string {
    return tidy(guessLostBytes(unmangle(decodeEntities(value))));
}

/** What a word looks like after the damage `guessLostBytes` undoes: the way to recognise it in a damaged name. */
function mangled(word: string): string {
    return Buffer.from(word, 'utf8')
        .toString('latin1')
        .replace(/[\u0080-\u009F]/g, '')
        .replace(/\u00A0/g, ' ');
}

/**
 * A display name repaired with the help of the first and last name when
 * the provider gives them: "L. JovanoviÄ" with last name "Jovanović"
 * becomes "L. Jovanović", "Ã. Umathum" with first name "Ádám" becomes
 * "Á. Umathum". Words the parts cannot vouch for follow `cleanName`.
 */
export function repairName(name: string, first: string | null | undefined, last: string | null | undefined): string {
    let out = tidy(unmangle(decodeEntities(name)));
    const words = [first, last]
        .map((p) => (p ? cleanName(p) : ''))
        .flatMap((p) => p.split(/[\s-]+/))
        .filter((w) => w.length > 1 && !MOJIBAKE.test(w) && mangled(w) !== w);
    for (const w of words) {
        const m = mangled(w);
        if (!m) continue;
        out = out.split(m).join(w);
        // A no-break space that became the trailing space `tidy` removed ("MalusÃ " for "Malusà")
        if (m.endsWith(' ') && out.endsWith(m.trimEnd())) out = `${out.slice(0, -m.trimEnd().length)}${w}`;
        // The initial, when the damaged letter is the first of a given name
        if (out.startsWith(`${m[0]}.`) && w[0] !== m[0]) out = `${w[0]}${out.slice(m[0].length)}`;
    }
    return tidy(guessLostBytes(out));
}
