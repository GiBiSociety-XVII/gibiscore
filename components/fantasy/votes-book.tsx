'use client';

import {useEffect, useMemo, useRef, useState} from "react";
import {useTranslations} from "next-intl";
import {Check, CloudOff, FileUp, Save, Search, X} from "lucide-react";
import {useRouter} from "@/i18n/navigation";
import {cn} from "@/components/shared/ui/cn";
import {Panel} from "@/components/shell/panel";
import {TeamCrest} from "@/components/football/team-crest";
import {RoleBadge} from "./role-badge";
import {cloudUser} from "@/lib/fantasy/cloud";
import {createClient} from "@/lib/db/client";
import {isAdminId} from "@/lib/admin";
import type {BookPlayer, BookRound, VotesBook} from "@/lib/fantasy/votes-data";
import {roundNumber} from "@/lib/fantasy/matchday";
import {readRoundVotes} from "@/lib/fantasy/round-votes";
import {halfVoto, toVoto, type VotoCalibration} from "@/lib/fantasy/voto";
import type {FantaRole} from "@/lib/fantasy/scores";
import type {ManualVote} from "@/lib/fantasy/recap";
import type {VotesFileResponse} from "@/app/api/admin/votes-file/route";

/** A change not yet saved: the vote (0 = no vote, undefined = cleared) and, from a workbook, the events. */
interface Draft {
    voto: number | undefined;
    events?: Pick<ManualVote, 'goals' | 'assists' | 'yellow' | 'red' | 'conceded' | 'penaltiesSaved' | 'penaltiesMissed' | 'ownGoals'>;
}

/** What counts as a typed "no vote". */
const NO_VOTE = new Set(['sv', 's.v.', 's.v', 'nv', '-', '–', '0']);
const ROLE_ORDER: Record<FantaRole, number> = {P: 0, D: 1, C: 2, A: 3};
/** Rows per request the votes route accepts. */
const BATCH = 400;
/** The provider's rating counts as a vote only from this many minutes on. */
const VOTE_MINUTES = 10;

const asText = (v: number | null | undefined) => (v === undefined || v === null ? '' : v === 0 ? 's.v.' : String(v));
const fmt = (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(1));

/** One vote field: "6.5", "7", "sv" (no vote); empty leaves the site's own estimate. Enter or Tab moves on. */
function VoteField({value, estimate, label, disabled, onCommit, onNext}: {value: number | null | undefined; estimate: number | null; label: string; disabled: boolean; onCommit: (voto: number | null | undefined) => void; onNext: () => void}) {
    const [text, setText] = useState(asText(value));
    const shown = useRef(asText(value));
    const incoming = asText(value);
    useEffect(() => {
        if (incoming !== shown.current) {
            shown.current = incoming;
            setText(incoming);
        }
    }, [incoming]);
    const commit = () => {
        const v = text.trim().replace(',', '.').toLowerCase();
        if (v === '') {
            shown.current = '';
            if (value !== undefined && value !== null) onCommit(undefined);
            return;
        }
        if (NO_VOTE.has(v)) {
            setText('s.v.');
            shown.current = 's.v.';
            onCommit(null);
            return;
        }
        const n = Number(v);
        if (!Number.isFinite(n) || n < 1 || n > 10) {
            setText(shown.current);
            return;
        }
        const rounded = halfVoto(n);
        setText(String(rounded));
        shown.current = String(rounded);
        onCommit(rounded);
    };
    return (
        <input
            type="text"
            inputMode="decimal"
            value={text}
            disabled={disabled}
            placeholder={estimate !== null ? fmt(estimate) : '–'}
            title={label}
            aria-label={label}
            data-vote=""
            onChange={(e) => setText(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    commit();
                    onNext();
                }
            }}
            className={cn("bb-input h-8 w-16 px-2 text-center font-mono text-[13px] font-extrabold tabular-nums", text !== '' && "bg-accent/30")}
        />
    );
}

/**
 * The vote book: a round at a time, the players who took the pitch
 * grouped by club in the order of the matches, one field each for the
 * real vote. Saved in the account (the votes route), where the vote
 * scale reads it: every vote typed here moves the site's estimates
 * closer to the real thing.
 */
export function VotesBookView({book, calibration}: {book: VotesBook; calibration: VotoCalibration}) {
    const t = useTranslations('Fantasy.votes');
    const router = useRouter();
    const rounds = book.rounds;
    const [roundKey, setRoundKey] = useState(rounds[rounds.length - 1]?.round ?? '');
    const round: BookRound | undefined = rounds.find((r) => r.round === roundKey) ?? rounds[rounds.length - 1];
    const [team, setTeam] = useState<number | null>(null);
    const [query, setQuery] = useState('');
    const [signedIn, setSignedIn] = useState<boolean | null>(null);
    // Votes changed on this page and not yet saved: per round, per player, the vote (0 = typed no vote,
    // undefined = cleared) and, from a workbook, the events that go with it.
    const [drafts, setDrafts] = useState<Record<string, Record<number, Draft>>>({});
    const [save, setSave] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
    // The last workbook loaded for the round shown: what it filled and what it left out.
    const [file, setFile] = useState<{round: string; state: 'loading'} | {round: string; state: 'done'; result: VotesFileResponse} | {round: string; state: 'mismatch'; fileRound: number; selectedRound: number} | {round: string; state: 'error'; reason: string} | null>(null);
    useEffect(() => {
        let alive = true;
        cloudUser().then((u) => { if (alive) setSignedIn(isAdminId(u?.id)); }).catch(() => { if (alive) setSignedIn(false); });
        return () => { alive = false; };
    }, []);

    const teamsById = useMemo(() => new Map(book.teams.map((x) => [x.id, x])), [book.teams]);
    // What the account holds, read straight from the database on opening and after every save: the static
    // page can be a copy from before the last save, the database is never.
    const [saved, setSaved] = useState<Record<string, Record<number, number | undefined>>>({});
    const [live, setLive] = useState(0);
    useEffect(() => {
        let alive = true;
        let supabase: ReturnType<typeof createClient>;
        try {
            supabase = createClient();
        } catch {
            return;
        }
        readRoundVotes(supabase, book.seasonId)
            .then((data) => {
                if (!alive) return;
                const next: Record<string, Record<number, number | undefined>> = {};
                for (const r of data) {
                    next[r.round] = next[r.round] ?? {};
                    next[r.round][r.player_id] = r.voto === null ? undefined : Number(r.voto);
                }
                // Every round the database knows: a player it does not list is not typed, whatever the page says.
                for (const r of book.rounds) next[r.round] = next[r.round] ?? {};
                for (const r of book.rounds) for (const p of r.players) if (!(p.id in next[r.round])) next[r.round][p.id] = undefined;
                setSaved(next);
            })
            .catch(() => undefined);
        return () => {
            alive = false;
        };
    }, [book, live]);
    const typedOf = (roundKey: string, p: BookPlayer): number | undefined => {
        const s = saved[roundKey];
        if (s && p.id in s) return s[p.id];
        return p.typed === null ? undefined : p.typed;
    };
    const draft = round ? drafts[round.round] ?? {} : {};
    const shownVote = (p: BookPlayer): number | null | undefined => (round && p.id in draft ? draft[p.id].voto : round ? typedOf(round.round, p) : undefined);
    const dirty = Object.values(drafts).reduce((s, d) => s + Object.keys(d).length, 0);

    // The clubs in the order of the round's matches: home then away, so the list follows the fixtures.
    const clubs = useMemo(() => {
        if (!round) return [];
        const seen: number[] = [];
        for (const m of round.matches) for (const id of [m.home.id, m.away.id]) if (!seen.includes(id)) seen.push(id);
        return seen;
    }, [round]);
    const q = query.trim().toLowerCase();
    const groups = clubs
        .filter((id) => team === null || id === team)
        .map((id) => {
            const players = (round?.players ?? [])
                .filter((p) => p.teamId === id && (q === '' || p.name.toLowerCase().includes(q)))
                .sort((a, b) => ROLE_ORDER[a.role] - ROLE_ORDER[b.role] || b.minutes - a.minutes || a.name.localeCompare(b.name));
            const match = round?.matches.find((m) => m.home.id === id || m.away.id === id);
            return {id, players, match};
        })
        .filter((g) => g.players.length > 0);
    const typedCount = (round?.players ?? []).filter((p) => shownVote(p) !== undefined).length;
    const total = round?.players.length ?? 0;

    const setVote = (p: BookPlayer, voto: number | null | undefined) => {
        if (!round) return;
        setDrafts((d) => {
            const next = {...(d[round.round] ?? {})};
            const original = typedOf(round.round, p);
            const same = voto === original || (voto === null && original === 0) || (voto === 0 && original === null);
            if (same && !next[p.id]?.events) delete next[p.id];
            else next[p.id] = {...next[p.id], voto: voto === null ? 0 : voto};
            return {...d, [round.round]: next};
        });
        setSave('idle');
    };
    /** The Fantacalcio.it workbook of the round: read on the server, laid over the fields here, saved with the button as anything typed. */
    const loadFile = async (chosen: globalThis.File | null) => {
        if (!chosen || !round) return;
        const key = round.round;
        setFile({round: key, state: 'loading'});
        try {
            const form = new FormData();
            form.append('file', chosen);
            form.append('round', key);
            const res = await fetch('/api/admin/votes-file', {method: 'POST', body: form});
            if (res.status === 409) {
                const body = (await res.json()) as {fileRound: number; selectedRound: number};
                setFile({round: key, state: 'mismatch', fileRound: body.fileRound, selectedRound: body.selectedRound});
                return;
            }
            if (res.status === 401 || res.status === 403) { setSignedIn(false); setFile({round: key, state: 'error', reason: t('signIn')}); return; }
            if (!res.ok) { setFile({round: key, state: 'error', reason: res.status === 422 ? t('fileWrong') : t('fileError')}); return; }
            const result = (await res.json()) as VotesFileResponse;
            setDrafts((d) => {
                const next = {...(d[key] ?? {})};
                for (const v of result.matched) next[v.id] = {voto: v.voto === null ? 0 : v.voto, events: {goals: v.goals, assists: v.assists, yellow: v.yellow, red: v.red, conceded: v.conceded, penaltiesSaved: v.penaltiesSaved, penaltiesMissed: v.penaltiesMissed, ownGoals: v.ownGoals}};
                return {...d, [key]: next};
            });
            setSave('idle');
            setFile({round: key, state: 'done', result});
        } catch {
            setFile({round: key, state: 'error', reason: t('fileError')});
        }
    };
    const focusNext = (index: number) => {
        const inputs = document.querySelectorAll<HTMLInputElement>('input[data-vote]');
        inputs[index + 1]?.focus();
        inputs[index + 1]?.select();
    };

    const flush = async () => {
        if (dirty === 0 || save === 'saving') return;
        setSave('saving');
        try {
            for (const [key, d] of Object.entries(drafts)) {
                const r = rounds.find((x) => x.round === key);
                if (!r) continue;
                const entries = Object.entries(d);
                for (let i = 0; i < entries.length; i += BATCH) {
                    const votes: Record<number, ManualVote> = {};
                    const remove: number[] = [];
                    for (const [id, {voto, events}] of entries.slice(i, i + BATCH)) {
                        const p = r.players.find((x) => x.id === Number(id));
                        if (!p) continue;
                        if (voto === undefined) remove.push(p.id);
                        else votes[p.id] = {teamId: p.teamId, voto, goals: p.goals, assists: p.assists, yellow: p.yellow, red: p.red, conceded: p.conceded, penaltiesSaved: p.penaltiesSaved, penaltiesMissed: p.penaltiesMissed, ownGoals: p.ownGoals, ...events, at: new Date().toISOString()};
                    }
                    const res = await fetch('/api/fantasy/votes', {method: 'POST', headers: {'content-type': 'application/json'}, body: JSON.stringify({seasonId: book.seasonId, round: key, votes, remove})});
                    if (res.status === 401 || res.status === 403) { setSignedIn(false); setSave('error'); return; }
                    if (!res.ok) throw new Error(String(res.status));
                }
            }
            setSaved((s) => {
                const next = {...s};
                for (const [key, d] of Object.entries(drafts)) next[key] = {...(next[key] ?? {}), ...Object.fromEntries(Object.entries(d).map(([id, v]) => [Number(id), v.voto]))};
                return next;
            });
            setDrafts({});
            setSave('saved');
            setFile(null);
            setLive((n) => n + 1);
            router.refresh();
        } catch {
            setSave('error');
        }
    };

    if (rounds.length === 0 || !round) return <p className="bb-surface px-3 py-3 text-[13px] font-semibold text-muted-foreground">{t('noRounds')}</p>;
    let inputIndex = -1;
    return (
        <div className="flex flex-col gap-3">
            {/* The round, the club, the search: one row */}
            <div className="bb-surface px-3 py-2 flex flex-wrap items-center gap-2">
                <div className="flex flex-wrap items-center gap-1" role="tablist" aria-label={t('rounds')}>
                    {rounds.map((r) => {
                        const done = r.players.filter((p) => typedOf(r.round, p) !== undefined).length;
                        const full = r.players.length > 0 && done >= r.players.length;
                        return (
                            <button key={r.round} type="button" role="tab" aria-selected={r.round === round.round} onClick={() => setRoundKey(r.round)} title={t('roundDone', {done, total: r.players.length})} className={cn("bb-btn h-8 min-w-8 px-2 font-mono text-[12px] font-extrabold inline-flex items-center gap-1", r.round === round.round ? "bg-foreground text-background" : full ? "bg-emerald-200" : done > 0 ? "bg-amber-200" : "bg-card")}>
                                {r.number ?? roundNumber(r.round) ?? r.round}
                            </button>
                        );
                    })}
                </div>
                <select value={team ?? ''} onChange={(e) => setTeam(e.target.value === '' ? null : Number(e.target.value))} aria-label={t('team')} className="bb-input h-8 px-2 text-[12px] font-bold">
                    <option value="">{t('allTeams')}</option>
                    {clubs.map((id) => <option key={id} value={id}>{teamsById.get(id)?.name ?? id}</option>)}
                </select>
                <label className="relative">
                    <Search className="w-3.5 h-3.5 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                    <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('search')} aria-label={t('search')} className="bb-input h-8 pl-7 pr-2 w-40 text-[12px] font-semibold" />
                </label>
                <span className="ml-auto flex items-center gap-2 text-[12px] font-semibold">
                    <span className={cn("bb-badge font-mono text-[11px]", typedCount >= total && total > 0 ? "bg-emerald-200" : typedCount > 0 ? "bg-amber-200" : "bg-card")}>{typedCount}/{total}</span>
                    {signedIn === false && <span className="inline-flex items-center gap-1 text-red-700" title={t('signInHint')}><CloudOff className="w-3.5 h-3.5" aria-hidden="true" />{t('signIn')}</span>}
                    <label className={cn("bb-btn bg-card h-8 px-3 text-[12px] font-extrabold inline-flex items-center gap-1.5 cursor-pointer", (signedIn === false || file?.state === 'loading') && "opacity-50 pointer-events-none")} title={t('uploadHint')}>
                        <FileUp className="w-3.5 h-3.5" aria-hidden="true" />
                        {file?.state === 'loading' ? t('uploading') : t('upload')}
                        <input type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" className="sr-only" disabled={signedIn === false || file?.state === 'loading'} onChange={(e) => { void loadFile(e.target.files?.[0] ?? null); e.target.value = ''; }} />
                    </label>
                    <button type="button" onClick={flush} disabled={dirty === 0 || save === 'saving' || signedIn === false} className={cn("bb-btn h-8 px-3 text-[12px] font-extrabold inline-flex items-center gap-1.5 disabled:opacity-50", dirty > 0 ? "bg-accent" : "bg-card")}>
                        {save === 'saved' && dirty === 0 ? <Check className="w-3.5 h-3.5" aria-hidden="true" /> : <Save className="w-3.5 h-3.5" aria-hidden="true" />}
                        {save === 'saving' ? t('saving') : save === 'saved' && dirty === 0 ? t('saved') : dirty > 0 ? t('save', {count: dirty}) : t('saveNone')}
                    </button>
                    {save === 'error' && <span className="text-red-700">{t('saveError')}</span>}
                </span>
            </div>

            {file && file.round === round.round && file.state !== 'loading' && (
                <div className={cn("bb-surface px-3 py-2 flex flex-wrap items-start gap-x-3 gap-y-1 text-[12px] font-semibold", file.state === 'done' ? (file.result.missing.length === 0 && file.result.unmatched.length === 0 ? "bg-emerald-100" : "bg-amber-100") : "bg-red-100")}>
                    {file.state === 'mismatch' && (
                        <>
                            <span className="font-extrabold text-red-800">{t('fileMismatch', {fileRound: file.fileRound, selectedRound: file.selectedRound})}</span>
                            {rounds.some((r) => r.number === file.fileRound) && <button type="button" onClick={() => { setRoundKey(rounds.find((r) => r.number === file.fileRound)!.round); setFile(null); }} className="bb-btn bg-card h-7 px-2.5 text-[11px] font-extrabold">{t('goToRound', {round: file.fileRound})}</button>}
                        </>
                    )}
                    {file.state === 'error' && <span className="font-extrabold text-red-800">{file.reason}</span>}
                    {file.state === 'done' && (
                        <span className="flex flex-col gap-0.5 min-w-0">
                            <span className="font-extrabold">{t('fileSummary', {round: file.result.fileRound ?? '?', voted: file.result.voted, matched: file.result.matched.length, players: round.players.length})}{file.result.renamed > 0 ? ` ${t('fileRenamed', {count: file.result.renamed})}` : ''}</span>
                            {file.result.missing.length > 0 && <span>{t('fileMissing', {count: file.result.missing.length})}: {file.result.missing.map((m) => m.name).join(', ')}</span>}
                            {file.result.unmatched.length > 0 && <span className="text-muted-foreground">{t('fileUnmatched', {count: file.result.unmatched.length})}: {file.result.unmatched.slice(0, 30).map((u) => `${u.name} (${u.team})`).join(', ')}{file.result.unmatched.length > 30 ? '…' : ''}</span>}
                            {file.result.missing.length === 0 && file.result.unmatched.length === 0 && <span>{t('fileAllGood')}</span>}
                        </span>
                    )}
                    <button type="button" onClick={() => setFile(null)} aria-label={t('placeCancel')} className="ml-auto inline-flex w-6 h-6 items-center justify-center rounded border border-foreground/40 bg-background"><X className="w-3 h-3" aria-hidden="true" /></button>
                </div>
            )}
            {groups.length === 0 ? (
                <p className="bb-surface px-3 py-3 text-[13px] font-semibold text-muted-foreground">{t('noPlayers')}</p>
            ) : (
                <div className="grid gap-3 grid-cols-1 lg:grid-cols-2">
                    {groups.map((g) => {
                        const club = teamsById.get(g.id);
                        const m = g.match;
                        const done = g.players.filter((p) => shownVote(p) !== undefined).length;
                        return (
                            <Panel
                                key={g.id}
                                title={<span className="inline-flex items-center gap-2">{club && <TeamCrest team={club} size={20} />}{club?.name ?? g.id}</span>}
                                action={<span className="inline-flex items-center gap-2 text-[11px] font-semibold text-muted-foreground">{m && <span className="font-mono">{m.home.name} {m.score ? `${m.score[0]}-${m.score[1]}` : '–'} {m.away.name}</span>}<span className={cn("bb-badge font-mono text-[10px]", done >= g.players.length ? "bg-emerald-200" : done > 0 ? "bg-amber-200" : "bg-card")}>{done}/{g.players.length}</span></span>}
                            >
                                <ul className="flex flex-col">
                                    {g.players.map((p) => {
                                        inputIndex += 1;
                                        const index = inputIndex;
                                        const estimate = p.rating !== null && p.minutes >= VOTE_MINUTES ? halfVoto(toVoto(p.rating, p.role, calibration)) : null;
                                        const bonus = [p.goals > 0 && `${p.goals}G`, p.assists > 0 && `${p.assists}A`, p.yellow > 0 && 'amm.', p.red > 0 && 'esp.', p.role === 'P' && p.conceded > 0 && `${p.conceded} sub.`, p.penaltiesSaved > 0 && 'rig. parato', p.penaltiesMissed > 0 && 'rig. sbagliato', p.ownGoals > 0 && 'autogol'].filter(Boolean).join(' · ');
                                        return (
                                            <li key={p.id} className={cn("flex items-center gap-2 px-3 h-10 border-t border-muted first:border-t-0 text-[13px]", p.id in draft && "bg-accent/15")}>
                                                <RoleBadge role={p.role} />
                                                <span className="flex flex-col leading-tight min-w-0">
                                                    <span className="font-extrabold truncate">{p.name}</span>
                                                    <span className="text-[10px] font-semibold text-muted-foreground truncate">{p.minutes}&apos;{bonus ? ` · ${bonus}` : ''}</span>
                                                </span>
                                                <span className="ml-auto flex items-center gap-1.5 shrink-0">
                                                    {p.rating !== null && <span className="font-mono text-[10px] font-bold tabular-nums text-muted-foreground" title={t('ratingHint', {rating: p.rating.toFixed(1)})}>{p.rating.toFixed(1)}</span>}
                                                    <VoteField value={shownVote(p)} estimate={estimate} label={t('voteLabel', {name: p.name})} disabled={signedIn === false} onCommit={(v) => setVote(p, v)} onNext={() => focusNext(index)} />
                                                </span>
                                            </li>
                                        );
                                    })}
                                </ul>
                            </Panel>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
