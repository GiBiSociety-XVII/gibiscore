import {ImageResponse} from 'next/og';
import {getSharedSchedina} from '@/lib/football/data/schedina-share';
import type {LegKey} from '@/lib/football/markets';

export const alt = 'Schedina GiBiScore';
export const size = {width: 1200, height: 630};
export const contentType = 'image/png';

const ink = '#14131A';
const paper = '#F5F3EE';
const accent = '#3BC9FF';

/** The words of the image per language (the image is drawn outside the translation layer). */
const WORDS = {
    it: {btts: 'Gol', noBtts: 'No gol', decimal: ',', kinds: {single: 'Singola', multiple: 'Multipla', system: 'Sistema'}, risks: {low: 'Basso', medium: 'Medio', high: 'Alto'}, selections: 'selezioni', more: '+ altre {n} selezioni', slip: 'SCHEDINA N.', odds: 'QUOTA', chance: 'PROBABILITÀ', stake: 'PUNTATA', payout: 'VINCITA', open: 'APERTA', won: 'VINTA', lost: 'PERSA'},
    en: {btts: 'BTTS yes', noBtts: 'BTTS no', decimal: '.', kinds: {single: 'Single', multiple: 'Accumulator', system: 'System'}, risks: {low: 'Low', medium: 'Medium', high: 'High'}, selections: 'selections', more: '+ {n} more selections', slip: 'BETTING SLIP NO.', odds: 'ODDS', chance: 'PROBABILITY', stake: 'STAKE', payout: 'PAYOUT', open: 'OPEN', won: 'WON', lost: 'LOST'},
} as const;
type Words = (typeof WORDS)[keyof typeof WORDS];

/** The pick of a leg in words, as the ticket prints it. */
function legLabel(key: LegKey, w: Words): string {
    if (key === 'btts') return w.btts;
    if (key === 'noBtts') return w.noBtts;
    if (key.startsWith('over')) return `Over ${key.slice(4, 5)}${w.decimal}${key.slice(5)}`;
    if (key.startsWith('under')) return `Under ${key.slice(5, 6)}${w.decimal}${key.slice(6)}`;
    return key;
}

/** The shared slip as a picture for the chat and social previews: header, selections, stake and payout, the stamp. */
export default async function Image({params}: {params: Promise<{token: string; locale: string}>}) {
    const {token, locale} = await params;
    const w: Words = locale === 'en' ? WORDS.en : WORDS.it;
    const ticket = await getSharedSchedina(token);
    if (!ticket) {
        return new ImageResponse(
            <div style={{width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: paper, color: ink, fontSize: 48, fontWeight: 800}}>GiBiScore</div>,
            size,
        );
    }
    const status = ticket.hit === null ? w.open : ticket.hit ? w.won : w.lost;
    const stampColor = ticket.hit === null ? '#6B6976' : ticket.hit ? '#047857' : '#B91C1C';
    const odds = ticket.book ?? ticket.fair;
    const rows = ticket.selections.slice(0, 5);
    const more = ticket.selections.length - rows.length;
    const cell = (label: string, value: string) => (
        <div style={{display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1}}>
            <div style={{fontSize: 34, fontWeight: 800, fontFamily: 'monospace'}}>{value}</div>
            <div style={{fontSize: 16, fontWeight: 700, color: '#6B6976', letterSpacing: 2}}>{label}</div>
        </div>
    );
    return new ImageResponse(
        (
            <div style={{width: '100%', height: '100%', display: 'flex', background: paper, padding: 36}}>
                <div style={{display: 'flex', flexDirection: 'column', width: '100%', height: '100%', background: '#FFFFFF', border: `4px solid ${ink}`, borderRadius: 24, overflow: 'hidden', position: 'relative'}}>
                    <div style={{display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: ink, color: paper, padding: '14px 28px', fontSize: 24, fontWeight: 800, letterSpacing: 4, fontFamily: 'monospace'}}>
                        <span>{w.slip} {ticket.id}</span>
                        <span style={{fontSize: 20}}>GIBISCORE.COM</span>
                    </div>
                    <div style={{display: 'flex', alignItems: 'center', gap: 12, padding: '14px 28px', borderBottom: `2px dashed ${ink}66`}}>
                        <span style={{background: accent, border: `3px solid ${ink}`, borderRadius: 8, padding: '4px 12px', fontSize: 20, fontWeight: 800}}>{w.kinds[ticket.kind as keyof Words['kinds']] ?? ticket.kind}{ticket.systemOf ? ` ${ticket.systemOf}/${ticket.size}` : ''}</span>
                        <span style={{border: `3px solid ${ink}`, borderRadius: 8, padding: '4px 12px', fontSize: 20, fontWeight: 800}}>{w.risks[ticket.risk as keyof Words['risks']] ?? ticket.risk}</span>
                        <span style={{marginLeft: 'auto', fontSize: 20, color: '#6B6976', fontFamily: 'monospace'}}>{ticket.size} {w.selections}</span>
                    </div>
                    <div style={{display: 'flex', flexDirection: 'column', padding: '6px 28px', flex: 1}}>
                        {rows.map((s, i) => {
                            const r = ticket.results?.[i] ?? null;
                            return (
                                <div key={s.fixtureId} style={{display: 'flex', alignItems: 'center', gap: 16, padding: '9px 0', borderBottom: i < rows.length - 1 ? `2px dashed ${ink}33` : 'none', background: r === true ? '#ECFDF5' : r === false ? '#FEF2F2' : 'transparent'}}>
                                    {/* A filled dot, no glyph: the image font may lack the check marks. */}
                                    <div style={{width: 40, height: 40, borderRadius: 20, border: `4px solid ${r === true ? '#047857' : r === false ? '#B91C1C' : '#C9C6BD'}`, background: r === true ? '#047857' : r === false ? '#B91C1C' : 'transparent', display: 'flex'}} />
                                    <div style={{display: 'flex', flexDirection: 'column', flex: 1}}>
                                        <div style={{fontSize: 28, fontWeight: 800}}>{s.home} - {s.away}</div>
                                        <div style={{fontSize: 18, color: '#6B6976', fontWeight: 600}}>{s.competition}</div>
                                    </div>
                                    <div style={{display: 'flex', flexDirection: 'column', alignItems: 'flex-end'}}>
                                        <div style={{fontSize: 28, fontWeight: 800}}>{s.legs.map((l) => legLabel(l.key, w)).join(' + ')}</div>
                                        <div style={{fontSize: 18, color: '#6B6976', fontFamily: 'monospace'}}>{s.pct}%</div>
                                    </div>
                                </div>
                            );
                        })}
                        {more > 0 && <div style={{fontSize: 18, color: '#6B6976', fontWeight: 700, paddingTop: 6}}>{w.more.replace('{n}', String(more))}</div>}
                    </div>
                    <div style={{display: 'flex', borderTop: `2px dashed ${ink}66`, padding: '12px 28px'}}>
                        {cell(w.odds, `${ticket.book === null ? '~' : ''}${odds.toFixed(2)}`)}
                        {cell(w.chance, `${ticket.pct}%`)}
                        {cell(w.stake, ticket.stake !== null ? `${ticket.stake.toFixed(2)} EUR` : '-')}
                        {cell(w.payout, ticket.payout !== null ? `${ticket.book === null ? '~' : ''}${ticket.payout.toFixed(2)} EUR` : '-')}
                    </div>
                    <div style={{position: 'absolute', right: 40, top: 96, transform: 'rotate(-12deg)', border: `5px solid ${stampColor}`, color: stampColor, borderRadius: 10, padding: '6px 18px', fontSize: 40, fontWeight: 900, letterSpacing: 8, background: '#FFFFFFDD'}}>{status}</div>
                </div>
            </div>
        ),
        size,
    );
}
