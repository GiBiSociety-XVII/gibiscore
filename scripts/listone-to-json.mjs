// Converts a fantasy list CSV (Ruolo;Calciatore;Squadra;Quotazione) into the JSON the server imports.
// Usage: node scripts/listone-to-json.mjs core/fantasy/listone/serie-a.csv core/fantasy/listone/serie-a.json
import {readFileSync, writeFileSync} from 'node:fs';

const [, , input, output] = process.argv;
const text = readFileSync(input, 'utf8').replace(/^﻿/, '');
const rows = text.split(/\r?\n/).filter((l) => l.trim().length > 0).slice(1);
const entries = rows.map((line) => {
    const [role, name, team, quote] = line.split(';').map((v) => v.trim().replace(/^"|"$/g, ''));
    return [role, name, team, Number(quote) || 0];
});
writeFileSync(output, `${JSON.stringify(entries)}\n`);
console.log(`${entries.length} entries -> ${output}`);
