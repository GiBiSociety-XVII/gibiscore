# GiBiScore — Studio e pianificazione

Documento di lavoro. Si aggiorna man mano che le decisioni vengono prese.
Nulla di quanto scritto qui e' ancora implementato.

## 1. Cosa sappiamo

- Dominio: **gibiscore.com**
- Owner: GiBiSociety (stesso team di GiBiArena)
- Repo: `GiBiSociety-XVII/gibiscore` (pubblico), partito vuoto
- Deve nascere **da zero**, non come fork o sotto-sezione di GiBiArena

## 2. Cosa NON sappiamo ancora (domande aperte)

1. **Cosa mostra GiBiScore?** Il nome suggerisce "punteggi". Ipotesi possibili:
   - risultati live / classifiche sportive (calcio, ecc.)
   - risultati e classifiche esport (LoL, Clash of Clans, tornei)
   - classifiche/punteggi dei giochi e degli utenti GiBiSociety (leaderboard cross-sito)
   - altro
2. **Pubblico e lingue**: stesse 5 lingue di GiBiArena (it, en, es, fr, de) con default `it`, o solo italiano/inglese?
3. **Sorgente dati**: API esterne (quali?), inserimento manuale da pannello admin, o dati gia' presenti nel DB di GiBiArena?
4. **Utenti e login**: serve un account? Se si', condiviso con GiBiArena (stesso Supabase Auth) o indipendente?
5. **Monetizzazione**: ads (come GiBiArena), premium via Stripe, nessuna?
6. **"Pagina web"**: una singola landing/one-page o un sito multi-pagina?
7. **Identita' visiva**: riprendere lo stile GiBiArena o look completamente nuovo?

## 3. Cosa abbiamo studiato: lo stack di GiBiArena

Riferimento utile perche' team, hosting e strumenti sono gli stessi.

| Area | GiBiArena |
|---|---|
| Framework | Next.js 16 (App Router) + React 19 + TypeScript |
| Stile | Tailwind CSS 4, icone `lucide-react`, font Geist |
| i18n | `next-intl`, route `app/[locale]/...`, locali it/en/es/fr/de |
| Database / Auth | Supabase (progetto "GiBiArena", `@supabase/ssr`) |
| Hosting | Vercel (team "GiBiSociety's", piano Pro), cron in `vercel.json` |
| Pagamenti | Stripe |
| Extra | PWA + push notifications, Vercel Analytics, `@vercel/blob` |
| Package manager | pnpm |
| Struttura | `app/` route, `components/`, `core/` (logica per dominio), `lib/` (db, integrazioni), `supabase/migrations/` |

Nota: al momento nel team Vercel non risulta nessun progetto collegato via MCP (lista vuota),
quindi il progetto Vercel di GiBiScore andra' creato da zero al momento del deploy.
Anche il progetto Supabase esistente e' uno solo (GiBiArena).

## 4. Opzioni di stack per GiBiScore

### Opzione A — Stesso stack di GiBiArena (consigliata di default)
Next.js + Tailwind + next-intl su Vercel, Supabase solo se servono dati/utenti.
- Pro: know-how gia' acquisito, componenti e pattern riutilizzabili, stesso deploy.
- Contro: overkill se il sito e' una semplice pagina statica.

### Opzione B — Sito statico leggero (Astro o HTML/Tailwind puro)
- Pro: velocissimo, costo zero, ideale per una one-page informativa.
- Contro: se poi servono dati live, login o pannelli admin si deve migrare.

### Opzione C — Next.js minimale senza DB
Un solo locale all'inizio, dati da API esterne o file statici, DB aggiunto dopo.
Compromesso tra A e B.

La scelta dipende dalle risposte alla sezione 2, soprattutto alla domanda 1 e 3.

## 5. Decisioni infrastrutturali da prendere (indipendenti dal contenuto)

- **Supabase**: nuovo progetto dedicato oppure stesso progetto di GiBiArena con schema separato.
  Consiglio: progetto dedicato, per non accoppiare i due siti.
- **Vercel**: nuovo progetto `gibiscore` collegato a questo repo, dominio `gibiscore.com`.
- **Branching**: `main` = produzione; branch `claude/*` per il lavoro assistito, PR verso `main`.
- **Env**: `.env*` mai committati (stessa regola di GiBiArena).

## 6. Prossimi passi

1. Rispondere alle domande della sezione 2.
2. Scegliere lo stack (sezione 4) e fissare le decisioni della sezione 5.
3. Definire la mappa delle pagine (sitemap) e le fonti dati.
4. Solo dopo: scaffolding del progetto.
