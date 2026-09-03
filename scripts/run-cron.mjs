#!/usr/bin/env node
/**
 * Trigger a cron route locally or on a deployment with the CRON_SECRET.
 *
 *   CRON_SECRET=xxx node scripts/run-cron.mjs sync-competitions
 *   CRON_SECRET=xxx BASE_URL=https://gibiscore.vercel.app node scripts/run-cron.mjs sync-live
 */
const job = process.argv[2];
const secret = process.env.CRON_SECRET;
const base = process.env.BASE_URL ?? 'http://localhost:3000';

if (!job || !secret) {
    console.error('usage: CRON_SECRET=... [BASE_URL=...] node scripts/run-cron.mjs <job>');
    process.exit(1);
}

const res = await fetch(`${base}/api/cron/${job}`, {headers: {Authorization: `Bearer ${secret}`}});
const body = await res.text();
console.log(res.status, body);
process.exit(res.ok ? 0 : 1);
