import type {VotoRow} from './voti';

/**
 * The Fantacalcio.it "Voti" workbook (Voti_Fantacalcio_Stagione_*_Giornata_N.xlsx,
 * the download of the matchday page, the same Leghe Fantacalcio hands out),
 * read into the site's vote rows. The workbook lists each club as a block:
 * a row with the club's name, a header row (Cod. Ruolo Nome Voto Gf Gs Rp
 * Rs Rf Au Amm Esp Ass), then the players. Columns are found by their
 * header, so their order does not matter. The title row names the round
 * ("Voti Fantacalcio 1ª giornata di campionato"). The workbook carries the
 * three vote sources as three sheets (Fantacalcio, Statistico, Italia):
 * the Fantacalcio one is read, the one Leghe Fantacalcio scores with.
 * Pure: the cells come in as text, from lib/fantasy/xlsx on the server.
 */

export interface VotiWorkbook {
    /** The round the title names, null when it does not. */
    round: number | null;
    /** The sheet read: "Fantacalcio" when the workbook has it, else the first. */
    source: string;
    rows: VotoRow[];
    clubs: number;
}

export interface VotiSheet {
    name: string;
    rows: Array<Array<string | null>>;
}

/** The sheet whose votes count: Fantacalcio's, else the first one. */
export function pickVotiSheet(sheets: VotiSheet[]): VotiSheet | null {
    return sheets.find((s) => /fantacalcio/i.test(s.name)) ?? sheets[0] ?? null;
}

const COLUMNS: Record<string, RegExp> = {cod: /^cod/i, role: /^r(uolo)?$/i, name: /^nome/i, voto: /^voto/i, gf: /^gf$/i, gs: /^gs$/i, rp: /^rp$/i, rs: /^rs$/i, rf: /^rf$/i, au: /^au$/i, amm: /^amm/i, esp: /^esp/i, ass: /^ass/i};

const text = (v: string | null | undefined) => (v === null || v === undefined ? '' : String(v).trim());
const num = (v: string | null | undefined) => {
    const n = Number(text(v).replace(',', '.'));
    return Number.isFinite(n) ? n : 0;
};
/** "6", "6,5", "6*" (no vote) -> the vote or null. */
const voto = (v: string | null | undefined): number | null => {
    const s = text(v);
    if (!s || /\*/.test(s) || /^s\.?v\.?$/i.test(s)) return null;
    const n = Number(s.replace(',', '.'));
    return Number.isFinite(n) && n >= 1 && n <= 10 ? n : null;
};

export function parseVotiWorkbook(sheets: VotiSheet[]): VotiWorkbook {
    const rows: VotoRow[] = [];
    let round: number | null = null;
    let team = '';
    let at: Record<string, number> | null = null;
    const chosen = pickVotiSheet(sheets);
    for (const sheet of chosen ? [chosen] : []) {
        for (const r of sheet.rows) {
            const cells = r.map(text);
            const filled = cells.filter((c) => c !== '');
            if (filled.length === 0) continue;
            // The title names the round: "Voti Fantacalcio 1ª giornata di campionato"
            if (round === null && filled.length === 1) {
                const m = /(\d+)\s*[ªa°]?\s*giornata/i.exec(filled[0]);
                if (m) round = Number(m[1]);
            }
            // A header row names the columns; the block's club is the last lone text before it.
            if (cells.some((c) => COLUMNS.name.test(c)) && cells.some((c) => COLUMNS.voto.test(c))) {
                at = {};
                cells.forEach((c, i) => {
                    for (const [key, re] of Object.entries(COLUMNS)) if (re.test(c) && at![key] === undefined) at![key] = i;
                });
                continue;
            }
            if (filled.length === 1 && !/^\d+$/.test(filled[0]) && !/^voti/i.test(filled[0])) {
                team = filled[0];
                continue;
            }
            if (!at || at.name === undefined) continue;
            const code = cells[at.cod ?? -1] ?? '';
            const name = cells[at.name];
            const role = (cells[at.role ?? -1] ?? '').toUpperCase();
            if (!name || !/^[PDCA]$/.test(role) || (at.cod !== undefined && !/^\d+$/.test(code))) continue;
            rows.push([team, role, name, voto(cells[at.voto]), num(cells[at.gf]), num(cells[at.gs]), num(cells[at.rp]), num(cells[at.rs]), num(cells[at.rf]), num(cells[at.au]), num(cells[at.amm]), num(cells[at.esp]), num(cells[at.ass])]);
        }
    }
    return {round, source: chosen?.name ?? '', rows, clubs: new Set(rows.map((r) => r[0])).size};
}
