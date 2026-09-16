'use client';

import {useEffect, useMemo, useRef, useState} from "react";
import {useTranslations} from "next-intl";
import {Check, CloudOff, Save, Search} from "lucide-react";
import {useRouter} from "@/i18n/navigation";
import {cn} from "@/components/shared/ui/cn";
import {Panel} from "@/components/shell/panel";
import {TeamCrest} from "@/components/football/team-crest";
import {RoleBadge} from "./role-badge";
import {cloudUser} from "@/lib/fantasy/cloud";
import type {BookPlayer, BookRound, VotesBook} from "@/lib/fantasy/votes-data";
import {roundNumber} from "@/lib/fantasy/matchday";
import {toVoto, type VotoCalibration} from "@/lib/fantasy/voto";
import type {FantaRole} from "@/lib/fantasy/scores";
import type {ManualVote} from "@/lib/fantasy/recap";

/** What counts as a typed "no vote". */
const NO_VOTE = new Set(['sv', 's.v.', 's.v', 'nv', '-', '–', '0']);
const ROLE_ORDER: Record<FantaRole, number> = {P: 0, D: 1, C: 2, A: 3};
/** Rows per request the votes route accepts. */
const BATCH = 400;
/** The provider's rating counts as a vote only from this many minutes on. */
const VOTE_MINUTES = 10;

const asText = (v: number | null | undefined) => (v === undefined || v === null ? '' : v === 0 ? 's.v.' : String(v));
const fmt = (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(2).replace(/0$/, ''));

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
        const rounded = Math.round(n * 4) / 4;
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
    // Votes changed on this page and not yet saved: per round, per player, the vote (null = typed no vote, undefined = cleared).
    const [drafts, setDrafts] = useState<Record<string, Record<number, number | null | undefined>>>({});
    const [save, setSave] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
    useEffect(() => {
        let alive = true;
        cloudUser().then((u) => { if (alive) setSignedIn(u !== null); }).catch(() => { if (alive) setSignedIn(false); });
        return () => { alive = false; };
    }, []);

    const teamsById = useMemo(() => new Map(book.teams.map((x) => [x.id, x])), [book.teams]);
    const draft = round ? drafts[round.round] ?? {} : {};
    const shownVote = (p: BookPlayer): number | null | undefined => (p.id in draft ? draft[p.id] : p.typed === null ? undefined : p.typed);
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
            const original = p.typed === null ? undefined : p.typed;
            const same = voto === original || (voto === null && original === 0) || (voto === 0 && original === null);
            if (same) delete next[p.id];
            else next[p.id] = voto === null ? 0 : voto;
            return {...d, [round.round]: next};
        });
        setSave('idle');
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
                    for (const [id, voto] of entries.slice(i, i + BATCH)) {
                        const p = r.players.find((x) => x.id === Number(id));
                        if (!p) continue;
                        if (voto === undefined) remove.push(p.id);
                        else votes[p.id] = {teamId: p.teamId, voto, goals: p.goals, assists: p.assists, yellow: p.yellow, red: p.red, conceded: p.conceded, penaltiesSaved: p.penaltiesSaved, penaltiesMissed: p.penaltiesMissed, ownGoals: p.ownGoals, at: new Date().toISOString()};
                    }
                    const res = await fetch('/api/fantasy/votes', {method: 'POST', headers: {'content-type': 'application/json'}, body: JSON.stringify({seasonId: book.seasonId, round: key, votes, remove})});
                    if (res.status === 401) { setSignedIn(false); setSave('error'); return; }
                    if (!res.ok) throw new Error(String(res.status));
                }
            }
            setDrafts({});
            setSave('saved');
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
                        const done = r.players.filter((p) => p.typed !== null).length;
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
                    <button type="button" onClick={flush} disabled={dirty === 0 || save === 'saving' || signedIn === false} className={cn("bb-btn h-8 px-3 text-[12px] font-extrabold inline-flex items-center gap-1.5 disabled:opacity-50", dirty > 0 ? "bg-accent" : "bg-card")}>
                        {save === 'saved' && dirty === 0 ? <Check className="w-3.5 h-3.5" aria-hidden="true" /> : <Save className="w-3.5 h-3.5" aria-hidden="true" />}
                        {save === 'saving' ? t('saving') : save === 'saved' && dirty === 0 ? t('saved') : dirty > 0 ? t('save', {count: dirty}) : t('saveNone')}
                    </button>
                    {save === 'error' && <span className="text-red-700">{t('saveError')}</span>}
                </span>
            </div>

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
                                        const estimate = p.rating !== null && p.minutes >= VOTE_MINUTES ? toVoto(p.rating, p.role, calibration) : null;
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
