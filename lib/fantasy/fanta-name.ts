import {splitDbName} from './listone';

/**
 * A player's name the way Fantacalcio.it writes it, shaped like the
 * site's names: the fantasy surname (or nickname) with the initial in
 * front. "Valdepenas" for "Valde", "L. Martinez" for "Lautaro Martínez"
 * and "Martinez L.", "P. Goncalves" for "Pote" and "Goncalves P.",
 * "Douglas Luiz" as it is. The fantasy name commands: it is what the
 * readers know; the initial keeps the site's names one shape and the
 * list matching working.
 */
export function fantaDisplayName(fantaName: string, providerName: string): string {
    const clean = fantaName.replace(/\s+/g, ' ').trim();
    // "Martinez L.", "Ederson D.S.", "Rodriguez Ju.": the initial tokens at the end
    const m = /^(.+?)(\s+(?:[A-Za-zÀ-ÿ]{1,2}\.)+)$/.exec(clean);
    const base = m ? m[1].trim() : clean;
    const fantaInitial = m ? m[2].trim()[0].toUpperCase() : null;
    const words = base.split(' ');
    // Two words with no initial ("Douglas Luiz", "Tiago Gabriel", "Zè Pedro"): the name as it is.
    if (words.length > 1 && !m) return base;
    const provider = splitDbName(providerName);
    const initial = (provider.tokens.length > 0 && provider.initial ? provider.initial.toUpperCase() : null) ?? fantaInitial;
    return initial ? `${initial}. ${base}` : base;
}
