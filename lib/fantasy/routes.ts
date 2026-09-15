import type {AuctionLeague} from './config';

/**
 * The fantasy pages are static, one per league, so they come from the
 * CDN instead of a server render on every visit: Serie A at the plain
 * address, the other leagues in a segment of their own.
 */
export const auctionPath = (league: AuctionLeague) => (league === 'serie-a' ? '/fantacalcio/asta' : (`/fantacalcio/asta/${league}` as const));
export const lineupPath = (league: AuctionLeague) => (league === 'serie-a' ? '/fantacalcio/formazione' : (`/fantacalcio/formazione/${league}` as const));
