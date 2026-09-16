import type {NextRequest} from 'next/server';
import {cronRoute} from '@/lib/football/sync/run-job';
import {fitPredictionModel} from '@/lib/football/sync/fit-model';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/** Weekly: the prediction model tuned on the archive of the featured leagues (no provider request). */
export async function GET(request: NextRequest) {
    return cronRoute(() => fitPredictionModel())(request);
}
