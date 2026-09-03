# GiBiScore

Sito di risultati e statistiche calcio di GiBiSociety: partite live, classifiche,
statistiche e schede di squadre e giocatori. Progetto separato da
[GiBiArena](https://github.com/GiBiSociety-XVII/gibiarena), con cui condivide lo
stile grafico e lo stack.

- Studio e decisioni: [`docs/PLANNING.md`](docs/PLANNING.md)
- Attivazione con dati reali: [`docs/SETUP.md`](docs/SETUP.md)
- Stack: Next.js 16 (App Router) · React 19 · TypeScript · Tailwind CSS 4 ·
  next-intl · Supabase · Vercel · pnpm
- Dati: API-Football v3 (api-sports.io), letti solo dal server e messi in cache
  nel nostro database (le pagine non chiamano mai l'API esterna)

## Avvio locale

```bash
pnpm install
cp .env.example .env.local   # poi compila i valori
pnpm dev
```

Apri http://localhost:3000. Finché la sincronizzazione dati non è attiva la
homepage mostra dati di esempio (badge "Dati di esempio").

## Comandi

| Comando | Cosa fa |
|---|---|
| `pnpm dev` | server di sviluppo |
| `pnpm build` | build di produzione |
| `pnpm lint` | ESLint |
| `pnpm test` | test unitari (vitest) dei mapper API-Football |
| `pnpm probe:api-football` | scarica payload grezzi da API-Football in `scratch/` per verificarne la forma (~8 richieste) |
| `pnpm cron <job>` | lancia un job di sync (serve `CRON_SECRET`, opzionale `BASE_URL`) |

## Struttura

```
app/[locale]/        route (solo `it` per ora, l'inglese si aggiunge in i18n/routing.ts)
app/api/             health check, cron e diagnostica (protetti da CRON_SECRET)
components/shared/   primitivi UI "Bold Blocks" (button, card, badge, input), app bar, footer
components/home/     componenti della homepage
core/<area>/i18n/    messaggi next-intl, un file per namespace
lib/db/              client Supabase (browser, server, public, service)
lib/api-football/    client server-only, tipi e mapper (testati) di API-Football
lib/football/        competizioni seguite, job di sync, tipi di lettura, query per le pagine
supabase/migrations/ schema `football.*`
```

## Sincronizzazione dati (API-Football)

GiBiScore segue **tutte** le competizioni pubblicate da API-Football (~1.100
tra campionati e coppe), divise in due livelli:

- **in evidenza** (`tier = featured`): Serie A, Serie B, Coppa Italia,
  Supercoppa, le tre coppe UEFA e le altre top 5 europee. Dettaglio completo:
  squadre e rose, formazioni, statistiche squadra e giocatore, infortuni,
  classifiche ogni 30 minuti.
- **base** (`tier = basic`): tutto il resto. Calendario, risultati, eventi
  live e classifiche una volta al giorno. Le squadre nascono dalle partite.

La lista in evidenza è in `lib/football/competitions.ts`
(`API_FOOTBALL_FEATURED_LEAGUE_IDS` per cambiarla senza codice);
`API_FOOTBALL_SCOPE=featured` limita il sito alle sole leghe in evidenza.

I job stanno in `lib/football/sync/` e sono esposti come route cron protette
da `CRON_SECRET` (`vercel.json` definisce gli orari):

| Job | Frequenza | Richieste | Cosa fa |
|---|---|---|---|
| `sync-competitions` | ogni giorno | ~275 | tutte le leghe e stagioni correnti; squadre e rose delle leghe in evidenza |
| `sync-fixtures` | ogni ora | 9 | tutte le partite da ieri a +7 giorni (una richiesta per giorno) |
| `sync-fixtures?window=month` | ogni giorno | 32 | finestra estesa a +30 giorni |
| `sync-standings` | ogni 30 min | ~13 | classifiche delle leghe in evidenza |
| `sync-standings?scope=all` | ogni giorno | ~300 | classifiche di ogni competizione attiva |
| `sync-injuries` | ogni 6 ore | ~13 | infortuni e squalifiche, leghe in evidenza |
| `sync-backfill` | ogni ora | fino a 10 | dettaglio (eventi, formazioni, voti) delle partite finite delle leghe in evidenza mai scaricato: recupera il pregresso |
| `sync-live` | ogni minuto | 1 + 1 ogni 20 partite in evidenza | punteggi ed eventi di tutte le partite in corso; formazioni, statistiche e voti per quelle in evidenza |

Consumo tipico: 3.500-4.500 richieste al giorno, dentro il piano Pro (7.500).
Con Ultra (75.000) c'è margine per promuovere altre leghe al livello in evidenza.

Primo avvio su un database vuoto, nell'ordine:

```bash
CRON_SECRET=... BASE_URL=https://<deploy> pnpm cron sync-competitions
CRON_SECRET=... BASE_URL=https://<deploy> pnpm cron "sync-fixtures?window=month"
CRON_SECRET=... BASE_URL=https://<deploy> pnpm cron "sync-standings?scope=all"
CRON_SECRET=... BASE_URL=https://<deploy> pnpm cron sync-injuries
CRON_SECRET=... BASE_URL=https://<deploy> pnpm cron "sync-backfill?limit=1000"   # dettaglio delle partite gia' giocate (~50 richieste)
```

Diagnostica del piano e della copertura per lega in evidenza:
`GET /api/cron/api-football-status` con lo stesso header di autorizzazione.

Ogni esecuzione scrive una riga in `football.sync_runs` con contatori,
richieste usate e avvisi: è il primo posto dove guardare se qualcosa manca.

## Database

Progetto Supabase dedicato "GiBiScore". Lo schema `football` va esposto nel
pannello Supabase (Project Settings → Data API → Exposed schemas) una volta sola.
Le migrazioni stanno in `supabase/migrations/` e si applicano in ordine.
