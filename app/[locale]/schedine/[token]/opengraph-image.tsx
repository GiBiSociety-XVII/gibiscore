import {ImageResponse} from 'next/og';
import {getSharedSchedina} from '@/lib/football/data/schedina-share';
import type {LegKey} from '@/lib/football/markets';

export const alt = 'Schedina GiBiScore';
export const size = {width: 1200, height: 630};
export const contentType = 'image/png';

const ink = '#14131A';
const paper = '#F5F3EE';
const accent = '#3BC9FF';

/** The pick of a leg in words, as the ticket prints it (the markets' Italian labels, without the translation layer). */
function legLabel(key: LegKey): string {
    if (key === 'btts') return 'Gol';
    if (key === 'noBtts') return 'No gol';
    if (key.startsWith('over')) return `Over ${key.slice(4, 5)},${key.slice(5)}`;
    if (key.startsWith('under')) return `Under ${key.slice(5, 6)},${key.slice(6)}`;
    return key;
}

const KINDS: Record<string, string> = {single: 'Singola', multiple: 'Multipla', system: 'Sistema'};
const RISKS: Record<string, string> = {low: 'Basso', medium: 'Medio', high: 'Alto'};

/** The shared slip as a picture for the chat and social previews: header, selections, stake and payout, the stamp. */
export default async function Image({params}: {params: Promise<{token: string}>}) {
    const {token} = await params;
    const ticket = await getSharedSchedina(token);
    if (!ticket) {
        return new ImageResponse(
            <div style={{width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: paper, color: ink, fontSize: 48, fontWeight: 800}}>GiBiScore</div>,
            size,
        );
    }
    const status = ticket.hit === null ? 'APERTA' : ticket.hit ? 'VINTA' : 'PERSA';
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
                        <span>SCHEDINA N. {ticket.id}</span>
                        <span style={{fontSize: 20}}>GIBISCORE.COM</span>
                    </div>
                    <div style={{display: 'flex', alignItems: 'center', gap: 12, padding: '14px 28px', borderBottom: `2px dashed ${ink}66`}}>
                        <span style={{background: accent, border: `3px solid ${ink}`, borderRadius: 8, padding: '4px 12px', fontSize: 20, fontWeight: 800}}>{KINDS[ticket.kind] ?? ticket.kind}{ticket.systemOf ? ` ${ticket.systemOf}/${ticket.size}` : ''}</span>
                        <span style={{border: `3px solid ${ink}`, borderRadius: 8, padding: '4px 12px', fontSize: 20, fontWeight: 800}}>{RISKS[ticket.risk] ?? ticket.risk}</span>
                        <span style={{marginLeft: 'auto', fontSize: 20, color: '#6B6976', fontFamily: 'monospace'}}>{ticket.size} selezioni</span>
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
                                        <div style={{fontSize: 28, fontWeight: 800}}>{s.legs.map((l) => legLabel(l.key)).join(' + ')}</div>
                                        <div style={{fontSize: 18, color: '#6B6976', fontFamily: 'monospace'}}>{s.pct}%</div>
                                    </div>
                                </div>
                            );
                        })}
                        {more > 0 && <div style={{fontSize: 18, color: '#6B6976', fontWeight: 700, paddingTop: 6}}>+ altre {more} selezioni</div>}
                    </div>
                    <div style={{display: 'flex', borderTop: `2px dashed ${ink}66`, padding: '12px 28px'}}>
                        {cell('QUOTA', `${ticket.book === null ? '~' : ''}${odds.toFixed(2)}`)}
                        {cell('PROBABILITÀ', `${ticket.pct}%`)}
                        {cell('PUNTATA', ticket.stake !== null ? `${ticket.stake.toFixed(2)} EUR` : '-')}
                        {cell('VINCITA', ticket.payout !== null ? `${ticket.book === null ? '~' : ''}${ticket.payout.toFixed(2)} EUR` : '-')}
                    </div>
                    <div style={{position: 'absolute', right: 40, top: 96, transform: 'rotate(-12deg)', border: `5px solid ${stampColor}`, color: stampColor, borderRadius: 10, padding: '6px 18px', fontSize: 40, fontWeight: 900, letterSpacing: 8, background: '#FFFFFFDD'}}>{status}</div>
                </div>
            </div>
        ),
        size,
    );
}
