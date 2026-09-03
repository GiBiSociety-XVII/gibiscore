#!/usr/bin/env node
/**
 * Sportmonks probe: hits a few endpoints with your token and saves the raw
 * JSON under scratch/sportmonks/ so payload shapes can be checked before the
 * sync jobs run for real.
 *
 *   SPORTMONKS_API_TOKEN=xxx node scripts/sportmonks-probe.mjs
 *   SPORTMONKS_API_TOKEN=xxx node scripts/sportmonks-probe.mjs fixtures/18535517 "participants;scores;events.type"
 */
import {mkdirSync, writeFileSync} from 'node:fs';

const token = process.env.SPORTMONKS_API_TOKEN;
if (!token) {
    console.error('SPORTMONKS_API_TOKEN is not set');
    process.exit(1);
}

const BASE = 'https://api.sportmonks.com/v3/football';
const LEAGUES = '384,387,390,2,5,2286';
const today = new Date().toISOString().slice(0, 10);
const inAWeek = new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10);

const defaults = [
    ['states', ''],
    ['leagues/384', 'currentSeason'],
    ['leagues/387', 'currentSeason'],
    ['leagues/390', 'currentSeason'],
    ['leagues/2', 'currentSeason'],
    ['leagues/5', 'currentSeason'],
    ['leagues/2286', 'currentSeason'],
    [`fixtures/between/${today}/${inAWeek}`, 'participants;scores;state;round;periods;venue', `fixtureLeagues:${LEAGUES}`],
    ['livescores/inplay', 'participants;scores;state;periods;events.type;statistics.type;lineups.details.type', `fixtureLeagues:${LEAGUES}`],
];

const [, , path, include, filters] = process.argv;
const requests = path ? [[path, include ?? '', filters]] : defaults;

mkdirSync('scratch/sportmonks', {recursive: true});

for (const [p, inc, flt] of requests) {
    const url = new URL(`${BASE}/${p}`);
    if (inc) url.searchParams.set('include', inc);
    if (flt) url.searchParams.set('filters', flt);
    const res = await fetch(url, {headers: {Authorization: token, Accept: 'application/json'}});
    const text = await res.text();
    const file = `scratch/sportmonks/${p.replace(/[^a-z0-9]+/gi, '_')}.json`;
    writeFileSync(file, text);
    let summary = '';
    try {
        const json = JSON.parse(text);
        const data = json.data;
        summary = Array.isArray(data) ? `${data.length} items` : data?.name ?? data?.id ?? '';
        if (json.rate_limit) summary += ` · rate_limit remaining ${json.rate_limit.remaining}`;
        if (json.message) summary += ` · ${json.message}`;
    } catch {
        summary = 'non-JSON response';
    }
    console.log(`${res.status} ${p} -> ${file} (${summary})`);
}
