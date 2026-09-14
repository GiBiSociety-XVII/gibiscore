// A minimal .xlsx reader: the workbook's sheets as arrays of rows of cells
// (strings and numbers as text), enough for the Fantacalcio.it exports.
// No dependency: an .xlsx is a zip of XML.
import {inflateRawSync} from 'node:zlib';

/** Minimal zip reader: central directory -> entries -> inflate. */
function unzip(buf) {
    const entries = new Map();
    let eocd = buf.length - 22;
    while (eocd >= 0 && buf.readUInt32LE(eocd) !== 0x06054b50) eocd -= 1;
    const count = buf.readUInt16LE(eocd + 10);
    let offset = buf.readUInt32LE(eocd + 16);
    for (let i = 0; i < count; i += 1) {
        const method = buf.readUInt16LE(offset + 10);
        const compressed = buf.readUInt32LE(offset + 20);
        const nameLength = buf.readUInt16LE(offset + 28);
        const extraLength = buf.readUInt16LE(offset + 30);
        const commentLength = buf.readUInt16LE(offset + 32);
        const localOffset = buf.readUInt32LE(offset + 42);
        const name = buf.toString('utf8', offset + 46, offset + 46 + nameLength);
        const localNameLength = buf.readUInt16LE(localOffset + 26);
        const localExtraLength = buf.readUInt16LE(localOffset + 28);
        const start = localOffset + 30 + localNameLength + localExtraLength;
        const data = buf.subarray(start, start + compressed);
        entries.set(name, method === 8 ? inflateRawSync(data) : data);
        offset += 46 + nameLength + extraLength + commentLength;
    }
    return entries;
}

const decode = (s) => s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'");

/** The workbook: `sheets` in file order with their names, `rows(sheet)` the cells of one. */
export function readWorkbook(buffer) {
    const files = unzip(buffer);
    const shared = [...(files.get('xl/sharedStrings.xml')?.toString('utf8') ?? '').matchAll(/<si>(.*?)<\/si>/gs)].map((m) => decode([...m[1].matchAll(/<t[^>]*>(.*?)<\/t>/gs)].map((t) => t[1]).join('')));
    const workbook = files.get('xl/workbook.xml')?.toString('utf8') ?? '';
    const rels = Object.fromEntries([...(files.get('xl/_rels/workbook.xml.rels')?.toString('utf8') ?? '').matchAll(/<Relationship [^>]*Id="(rId\d+)"[^>]*Target="([^"]+)"/g)].map((m) => [m[1], m[2]]));
    const sheets = [...workbook.matchAll(/<sheet [^>]*name="([^"]+)"[^>]*r:id="(rId\d+)"/g)].map((m) => ({name: decode(m[1]), path: `xl/${rels[m[2]].replace(/^\//, '').replace(/^xl\//, '')}`}));
    const rows = (sheet) => {
        const xml = files.get(sheet.path)?.toString('utf8') ?? '';
        const out = [];
        for (const row of xml.matchAll(/<row[^>]*>(.*?)<\/row>/gs)) {
            const cells = [];
            for (const cell of row[1].matchAll(/<c r="([A-Z]+)\d+"(?: [^>]*?t="(\w+)")?[^>]*>(.*?)<\/c>/gs)) {
                const col = [...cell[1]].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0) - 1;
                const v = cell[3].match(/<v>(.*?)<\/v>/s)?.[1];
                const inline = cell[3].match(/<t[^>]*>(.*?)<\/t>/s)?.[1];
                cells[col] = cell[2] === 's' && v !== undefined ? shared[Number(v)] : cell[2] === 'inlineStr' ? decode(inline ?? '') : v !== undefined ? decode(v) : null;
            }
            out.push(cells);
        }
        return out;
    };
    return {sheets, rows};
}
