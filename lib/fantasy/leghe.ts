import {DEFAULT_CONFIG, DEFAULT_SLOTS, normalizeConfig, type AuctionConfig, type AuctionMode, type Purchase} from './config';
import type {FantaRole} from './scores';

/**
 * Rosters exported by Leghe Fantacalcio ("Esporta rose"): a CSV with
 * the teams one after the other, each block closed by a `$,$,$` line,
 * one row per player as `team name,code,price`. The code is
 * Fantacalcio.it's own ("Cod." on the price list), so the roster is
 * matched to the pool by code, not by name. Pure.
 */

export interface LegheTeam {
    name: string;
    players: Array<{code: number; price: number}>;
}

export function parseLegheRoster(text: string): LegheTeam[] {
    const teams: LegheTeam[] = [];
    let current: LegheTeam | null = null;
    for (const raw of text.replace(/^﻿/, '').split(/\r?\n/)) {
        const line = raw.trim();
        if (!line) continue;
        // A separator closes the block.
        if (/^\$\s*[,;]\s*\$\s*[,;]\s*\$$/.test(line) || /^\$+$/.test(line)) {
            current = null;
            continue;
        }
        // A club's name may carry a comma of its own: everything before the two numbers is the name.
        const m = /^(.*?)\s*[,;]\s*(\d+)\s*[,;]\s*(-?\d+(?:[.,]\d+)?)\s*$/.exec(line);
        if (!m) continue;
        const name = m[1].replace(/^"|"$/g, '').trim();
        const code = Number(m[2]);
        const price = Number(m[3].replace(',', '.'));
        if (!name || !Number.isInteger(code) || !Number.isFinite(price)) continue;
        if (!current || current.name !== name) {
            current = teams.find((t) => t.name === name) ?? null;
            if (!current) {
                current = {name, players: []};
                teams.push(current);
            }
        }
        current.players.push({code, price: Math.max(0, Math.round(price))});
    }
    return teams.filter((t) => t.players.length > 0);
}

export interface ImportablePlayer {
    id: number;
    role: FantaRole;
    listCode: number | null;
}

export interface ImportOptions {
    /** The league's credits per team. */
    credits: number;
    /** Index of the user's team in the export. */
    me: number;
    name: string;
    mode?: AuctionMode;
}

export interface ImportedAuction {
    config: AuctionConfig;
    purchases: Purchase[];
    /** Rows whose code is nobody in the pool (a player who left, a code the list does not carry). */
    unmatched: Array<{team: string; code: number; price: number}>;
}

const ROLES: FantaRole[] = ['P', 'D', 'C', 'A'];

/** Credits per team the export suggests: the usual 500 unless a team has spent more, then the next round hundred. */
export function suggestCredits(teams: LegheTeam[]): number {
    const most = Math.max(0, ...teams.map((t) => t.players.reduce((s, p) => s + p.price, 0)));
    return Math.max(500, Math.ceil(most / 100) * 100);
}

/**
 * The export as an auction of the site: one manager per team, the
 * purchases at the prices paid, the slots per role wide enough for what
 * the teams hold. The rest of the settings are the defaults, to be
 * edited afterwards.
 */
export function buildImportedAuction(teams: LegheTeam[], players: ImportablePlayer[], options: ImportOptions): ImportedAuction {
    const byCode = new Map<number, ImportablePlayer>();
    for (const p of players) if (p.listCode !== null) byCode.set(p.listCode, p);
    const purchases: Purchase[] = [];
    const unmatched: ImportedAuction['unmatched'] = [];
    const held = teams.map(() => ({P: 0, D: 0, C: 0, A: 0}) as Record<FantaRole, number>);
    teams.forEach((team, manager) => {
        for (const row of team.players) {
            const p = byCode.get(row.code);
            if (!p) {
                unmatched.push({team: team.name, code: row.code, price: row.price});
                continue;
            }
            purchases.push({playerId: p.id, price: row.price, manager});
            held[manager][p.role] += 1;
        }
    });
    const mode: AuctionMode = options.mode ?? 'classic';
    const slots = {...DEFAULT_SLOTS[mode]};
    for (const role of ROLES) slots[role] = Math.max(slots[role], ...held.map((h) => h[role]));
    const config = normalizeConfig({
        ...DEFAULT_CONFIG,
        name: options.name,
        league: 'serie-a',
        mode,
        participants: teams.length,
        credits: options.credits,
        slots,
        managers: teams.map((t) => t.name),
        me: Math.min(Math.max(0, options.me), teams.length - 1),
    })!;
    return {config, purchases, unmatched};
}
