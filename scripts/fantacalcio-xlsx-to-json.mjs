// Converts the Fantacalcio.it quotations workbook (Quotazioni_Fantacalcio_Stagione_*.xlsx)
// into the JSON the server imports: [role, name, team, quote, mantra, fvm, gone, code].
// The first sheet lists every player, the "Calciatori Ceduti" sheet the ones who left.
// Usage: node scripts/fantacalcio-xlsx-to-json.mjs core/fantasy/listone/serie-a-fantacalcio.xlsx core/fantasy/listone/serie-a.json
import {readFileSync, writeFileSync} from 'node:fs';
import {readWorkbook} from './xlsx.mjs';

const [, , input, output] = process.argv;
const {sheets: sheetNames, rows} = readWorkbook(readFileSync(input));
const sheetPath = (sheet) => sheet;

const entries = [];
const seen = new Set();
const read = (sheetName, gone) => {
    const sheet = sheetNames.find((s) => s.name === sheetName || (gone ? /cedut/i.test(s.name) : false));
    if (!sheet) return;
    for (const r of rows(sheetPath(sheet))) {
        const [id, role, mantra, name, team, quote, , , , , , fvm] = r;
        if (!id || !/^\d+$/.test(String(id)) || !role || !name) continue;
        if (seen.has(String(id))) continue;
        seen.add(String(id));
        // The list's own code ("Cod."): what Leghe Fantacalcio exports rosters by.
        entries.push([String(role).trim(), String(name).trim(), String(team ?? '').trim(), Number(quote) || 0, String(mantra ?? '').trim(), Number(fvm) || 0, gone, Number(id)]);
    }
};
read(sheetNames[0]?.name, false);
read('Calciatori Ceduti', true);
writeFileSync(output, `${JSON.stringify(entries)}\n`);
console.log(`${entries.length} entries (${entries.filter((e) => e[6]).length} gone) -> ${output}`);
