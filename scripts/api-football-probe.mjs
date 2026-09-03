#!/usr/bin/env node
/**
 * API-Football probe: hits a few endpoints with your key and saves the raw
 * JSON under scratch/api-football/ so payload shapes can be checked before
 * the sync jobs run for real. Uses about 8 requests.
 *
 *   API_FOOTBALL_KEY=xxx node scripts/api-football-probe.mjs
 *   API_FOOTBALL_KEY=xxx node scripts/api-football-probe.mjs fixtures "id=1234567"
 */
import {mkdirSync, writeFileSync} from 'node:fs';

const key = process.env.API_FOOTBALL_KEY;
if (!key) {
    console.error('API_FOOTBALL_KEY is not set');
    process.exit(1);
}

const BASE = 'https://v3.football.api-sports.io';
const today = new Date().toISOString().slice(0, 10);
const inAWeek = new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10);
const year = new Date().getMonth() >= 6 ? new Date().getFullYear() : new Date().getFullYear() - 1;

const defaults = [
    ['status', ''],
    ['leagues', 'id=135'],
    ['leagues', 'id=2'],
    ['teams', `league=135&season=${year}`],
    ['fixtures', `league=135&season=${year}&from=${today}&to=${inAWeek}`],
    ['fixtures', 'live=135-136-137-2-3-848'],
    ['standings', `league=135&season=${year}`],
    ['injuries', `league=135&season=${year}`],
];

const [, , path, query] = process.argv;
const requests = path ? [[path, query ?? '']] : defaults;

mkdirSync('scratch/api-football', {recursive: true});

for (const [p, q] of requests) {
    const url = `${BASE}/${p}${q ? `?${q}` : ''}`;
    const res = await fetch(url, {headers: {'x-apisports-key': key, Accept: 'application/json'}});
    const text = await res.text();
    const file = `scratch/api-football/${`${p}_${q}`.replace(/[^a-z0-9]+/gi, '_').slice(0, 80)}.json`;
    writeFileSync(file, text);
    let summary = '';
    try {
        const json = JSON.parse(text);
        summary = `${json.results ?? '?'} results`;
        const errors = Array.isArray(json.errors) ? json.errors : Object.entries(json.errors ?? {}).map(([k, v]) => `${k}: ${v}`);
        if (errors.length) summary += ` · errors: ${errors.join('; ')}`;
    } catch {
        summary = 'non-JSON response';
    }
    const quota = `${res.headers.get('x-ratelimit-requests-remaining') ?? '?'}/${res.headers.get('x-ratelimit-requests-limit') ?? '?'} left today`;
    console.log(`${res.status} ${p}?${q} -> ${file} (${summary}; ${quota})`);
}
