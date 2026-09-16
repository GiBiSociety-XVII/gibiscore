import 'server-only';
import {revalidateTag} from 'next/cache';
import {backtestTiers, fitTuning, replaySeason, type ReplaySample} from '@/lib/football/backtest';
import {loadStudyRows} from '@/lib/football/data/study';
import {MODEL_TUNING_TAG, type ModelFit} from '@/lib/football/data/tuning';
import {buildStudy} from '@/lib/football/study';
import {currentSeasons, failSync, finishRun, footballClient, startRun, type SyncRun} from './context';

/**
 * fit-model (weekly)
 *
 * The prediction model tuned on the archive: the current and the
 * previous season of every featured league replayed match by match
 * (backtest.ts), the tuning fitted to the scores that came, the slips
 * the tuned model would have proposed settled. Stored in model_tuning
 * for every prediction to read. No provider request: database only.
 */
export async function fitPredictionModel(): Promise<SyncRun> {
    const db = footballClient();
    const run = await startRun(db, 'fit-model');
    try {
        const current = await currentSeasons(db, 'featured');
        const samples: ReplaySample[] = [];
        const seasons: ModelFit['seasons'] = [];
        for (const season of current) {
            const {data: previousRows, error} = await db.from('seasons').select('id,year').eq('league_id', season.leagueId).lt('year', season.year).order('year', {ascending: false}).limit(2);
            if (error) failSync('seasons.select', error);
            const previous = (previousRows ?? []) as Array<{id: number; year: number}>;
            // The previous season replayed with the one before as its prior; the current one with the previous.
            const chain = [...previous.reverse().map((s) => ({id: s.id, year: s.year})), {id: season.id, year: season.year}];
            let prior = null as ReturnType<typeof buildStudy>;
            for (let i = 0; i < chain.length; i += 1) {
                const rows = await loadStudyRows(chain[i].id);
                if (i > 0 || chain.length === 1) {
                    const replayed = replaySeason(chain[i].id, rows, prior && prior.played >= 30 ? prior : null);
                    samples.push(...replayed);
                    seasons.push({league: season.leagueSlug, year: chain[i].year, matches: replayed.length});
                }
                prior = buildStudy(chain[i].id, rows);
            }
        }
        run.bump('samples', samples.length);
        const fit = fitTuning(samples);
        const tiers = backtestTiers(samples, fit.tuning);
        const value: ModelFit = {tuning: fit.tuning, fittedAt: new Date().toISOString(), samples: fit.samples, seasons: seasons.filter((s) => s.matches > 0), before: Math.round(fit.before * 10000) / 10000, after: Math.round(fit.after * 10000) / 10000, tiers};
        const {error: saveError} = await db.from('model_tuning').upsert({key: 'prediction', value, updated_at: new Date().toISOString()}, {onConflict: 'key'});
        if (saveError) failSync('model_tuning.upsert', saveError);
        revalidateTag(MODEL_TUNING_TAG, 'max');
        run.bump('fitted');
        run.warn(`tuning goals x${fit.tuning.goalScale}, home x${fit.tuning.homeEdge}, rho ${fit.tuning.rho}: log-loss ${value.before} -> ${value.after} on ${fit.samples} matches`);
        await finishRun(db, run, 'ok');
        return run;
    } catch (error) {
        await finishRun(db, run, 'error', (error as Error).message);
        throw error;
    }
}
