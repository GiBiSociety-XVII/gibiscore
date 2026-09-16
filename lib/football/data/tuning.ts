import 'server-only';
import {unstable_cache} from 'next/cache';
import type {TierRecord} from '../backtest';
import {DEFAULT_TUNING, type PredictionTuning} from '../prediction';
import {footballDb, logReadError} from './shared';

/** What fit-model stores: the tuning in force and how it was fitted. */
export interface ModelFit {
    tuning: PredictionTuning;
    fittedAt: string;
    /** Replayed matches behind the fit, and the seasons (league slug and year) they came from. */
    samples: number;
    seasons: Array<{league: string; year: number; matches: number}>;
    /** Log-loss of the untuned and of the tuned model on the replays. */
    before: number;
    after: number;
    /** The slips the tuned model would have proposed on the replays, settled. */
    tiers: Record<'safe' | 'balanced' | 'bold', TierRecord>;
}

export const MODEL_TUNING_TAG = 'model-tuning';

/** The last fit stored by fit-model; null before the first. Cached an hour, refreshed by the fit. */
export const getModelFit = unstable_cache(
    async (): Promise<ModelFit | null> => {
        try {
            const {data, error} = await footballDb().from('model_tuning').select('value').eq('key', 'prediction').maybeSingle();
            if (error) throw error;
            const value = data?.value as ModelFit | undefined;
            return value && value.tuning ? value : null;
        } catch (error) {
            logReadError('getModelFit', error);
            return null;
        }
    },
    ['model-fit'],
    {revalidate: 3600, tags: [MODEL_TUNING_TAG]},
);

/** The tuning every prediction runs with: the fitted one, the untuned model until a fit exists. */
export async function getPredictionTuning(): Promise<PredictionTuning> {
    return (await getModelFit())?.tuning ?? DEFAULT_TUNING;
}
