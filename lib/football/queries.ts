import 'server-only';
import type {HomeData} from './types';
import {SAMPLE_HOME_DATA} from './sample';

/**
 * Data access for pages. Pages call these functions and never touch
 * Sportmonks directly.
 *
 * Until the sync jobs are implemented the home page is served from sample
 * data. When the football.* tables start filling up, this function will
 * read from Supabase and set `isSample: false`.
 */
export async function getHomeData(): Promise<HomeData> {
    return SAMPLE_HOME_DATA;
}
