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
supabase/migrations/ schema del database (tabelle in `public`)
```

## Sincronizzazione dati (API-Football)

GiBiScore segue **tutte** le competizioni pubblicate da API-Football (~1.100
tra campionati e coppe), divise in due livelli:

- **in evidenza** (`tier = featured`): Serie A, Serie B, Coppa Italia,
  Supercoppa, le tre coppe UEFA e le altre top 5 europee. Dettaglio completo:
  squadre e rose, formazioni, statistiche squadra e giocatore, infortuni,
  classifiche aggiornate a fine giornata.
- **base** (`tier = basic`): tutto il resto. Calendario, risultati, eventi
  live e classifiche una volta al giorno. Le squadre nascono dalle partite.

La lista in evidenza è in `lib/football/competitions.ts`
(`API_FOOTBALL_FEATURED_LEAGUE_IDS` per cambiarla senza codice);
`API_FOOTBALL_SCOPE=featured` limita il sito alle sole leghe in evidenza.

I job stanno in `lib/football/sync/` e sono esposti come route cron protette
da `CRON_SECRET` (`vercel.json` definisce gli orari). Il piano API-Football è
**Pro: 300 richieste al minuto, 7.500 al giorno**, e i limiti li fa
rispettare il client (`lib/api-football/client.ts`), non i singoli job:

- ogni richiesta passa da un freno al minuto condiviso (180 al minuto per i
  job batch, il resto resta al job live e a un eventuale job lanciato a mano);
  se il provider risponde comunque "troppe richieste" il job batch aspetta un
  minuto e riprova, il job live lascia perdere fino al minuto dopo;
- ogni risposta aggiorna il conteggio giornaliero, salvato in `sync_state` e
  letto da tutti i job prima di partire. Tre classi di job: **essenziali**
  (live, calendario, competizioni) girano sempre; **ordinari** (classifiche,
  infortuni, mercato) tengono 800 richieste di riserva; **archivio** (rose,
  statistiche stagionali, partite passate) partono solo con più di 2.500
  richieste ancora disponibili.

| Job | Frequenza | Richieste | Cosa fa |
|---|---|---|---|
| `sync-live` | ogni minuto | 0 se nessuna partita può essere in corso; altrimenti 1, più 1 ogni 20 partite in evidenza ogni 3 minuti | punteggi ed eventi di tutte le partite in corso dal feed live; formazioni, statistiche e voti (per id) solo per le partite in evidenza, ogni 3 minuti e a fine gara |
| `sync-fixtures` | ogni ora | 3 | tutte le partite di ieri, oggi e domani (una richiesta per giorno) |
| `sync-fixtures?window=month` | ogni giorno | 32 | finestra estesa a +30 giorni |
| `sync-standings` | ogni ora | 0-13 | classifiche delle leghe in evidenza, solo se una loro partita è finita da quando la tabella è stata salvata |
| `sync-standings?scope=all` | ogni giorno | fino a 300 | classifiche delle altre competizioni con un risultato nelle ultime 24 ore |
| `sync-injuries` | ogni 8 ore | ~13 | infortuni e squalifiche, leghe in evidenza (una riga per partita saltata: da qui `lib/football/spells.ts` ricava durata e rientro) |
| `sync-market` | ogni 4 ore | ~20 | feed cessioni dei club delle leghe d'asta (Serie A, `API_FOOTBALL_MARKET_LEAGUE_IDS`): arrivi in rosa e partenze nel giro di ore; fuori dalle finestre di mercato solo il primo giro del giorno |
| `sync-competitions` | ogni giorno | ~15 | tutte le leghe e stagioni correnti, stagioni passate delle leghe in evidenza, squadre di ogni stagione in evidenza (`season_teams`) |
| `sync-squads` | lunedì e giovedì | ~2 per club (~520) | rose e feed cessioni di ogni club in evidenza, i più vecchi prima; quel che non entra nei 4 minuti passa al giro dopo |
| `sync-backfill` | ogni ora | fino a ~15 | archivio delle leghe in evidenza: calendario completo di ogni stagione (corrente + `API_FOOTBALL_HISTORY_SEASONS` passate) e dettaglio (eventi, formazioni, voti) delle partite finite mai scaricato, dalle più recenti, 200 partite per giro |
| `sync-player-seasons` | ogni ora | ~35 per lega-stagione, solo dopo una giornata giocata, max 300 per giro | statistiche stagionali per giocatore (presenze, minuti, voto, gol, assist, tiri, passaggi, contrasti, duelli, dribbling, falli, cartellini, rigori) in `player_season_stats`; stagioni passate una volta sola |

Consumo tipico a regime: 1.500-2.500 richieste al giorno nei weekend di
campionato (di cui ~900 del live), meno di 1.000 nei giorni senza partite.
Il resto del piano lo usano, entro la riserva, l'archivio storico e le rose.

### Archivio storico

Per formule, medie e confronti servono anche le stagioni passate. I due job
`sync-backfill` e `sync-player-seasons` importano, per ogni lega in evidenza,
la stagione corrente più `API_FOOTBALL_HISTORY_SEASONS` (default 3) stagioni
precedenti: calendario e risultati, eventi, formazioni, statistiche squadra,
voti e statistiche per giocatore di ogni partita, e gli aggregati stagionali
di API-Football (`player_season_stats`). Tutto finisce nel database
una volta sola, poi le pagine e i calcoli leggono solo da lì. Costo una tantum:
~20 richieste per lega-stagione di dettaglio partite + ~35 di statistiche
giocatori, cioè circa 2.000-2.500 richieste per 13 leghe × 3 stagioni,
spalmate dai cron orari in tre o quattro giorni entro la riserva giornaliera
(o prima, lanciando i job a mano con `limit`/`budget` più alti nei giorni
senza partite).

Primo avvio su un database vuoto, nell'ordine:

```bash
CRON_SECRET=... BASE_URL=https://<deploy> pnpm cron sync-competitions                   # leghe, stagioni, squadre (~15 richieste)
CRON_SECRET=... BASE_URL=https://<deploy> pnpm cron sync-squads                         # rose e cessioni dei club in evidenza (~520, in due giri)
CRON_SECRET=... BASE_URL=https://<deploy> pnpm cron "sync-fixtures?window=month"        # partite da ieri a +30 giorni (32)
CRON_SECRET=... BASE_URL=https://<deploy> pnpm cron sync-standings                      # classifiche in evidenza (~13)
CRON_SECRET=... BASE_URL=https://<deploy> pnpm cron sync-injuries                       # infortuni (~13)
CRON_SECRET=... BASE_URL=https://<deploy> pnpm cron "sync-backfill?limit=1000"          # calendario completo + dettaglio delle partite gia' giocate (~100 richieste a giro)
CRON_SECRET=... BASE_URL=https://<deploy> pnpm cron "sync-player-seasons?scope=current&budget=600"  # statistiche stagionali dei giocatori (~450 richieste)
```

Diagnostica del piano e della copertura per lega in evidenza:
`GET /api/cron/api-football-status` con lo stesso header di autorizzazione.

Ogni esecuzione scrive una riga in `sync_runs` con contatori, richieste usate
e avvisi: è il primo posto dove guardare se qualcosa manca. `sync_state`
tiene l'ultima lettura della quota giornaliera.

## Identità

I file del marchio (icone, favicon, lockup di GiBiScore, GiBiArena e
GiBiSociety) e le regole d'uso stanno in `public/brand/` (`README.txt`).
Accento di GiBiScore `#3BC9FF` (`--accent`), testo colorato su chiaro
`#0A72A8` (`--accent-text`), tile e testo `#14131A`. Il favicon usa la
variante ad accento pieno, iOS la tile nera, `theme-color` `#14131A`.

## Pagine

Struttura alla Diretta/Sofascore: barra laterale con le competizioni
principali e tutti i paesi, lista risultati al centro, classifiche nella
colonna di destra. URL in inglese, testi in italiano.

| URL | Contenuto |
|---|---|
| `/` | partite di oggi, tutte le competizioni (filtri Tutte / Live / Finite / Programma) |
| `/live` | solo partite in corso |
| `/scores/2026-09-05` | partite di un giorno qualsiasi |
| `/competitions` | competizioni principali e tutti i paesi (`?q=` filtra) |
| `/stats` | marcatori, assist e voti migliori di ogni competizione principale |
| `/injuries` | infortunati e squalificati delle competizioni principali: da quanto sono fuori, partite saltate e rientro indicativo |
| `/predictions` | pronostici statistici delle prossime partite (probabilità 1-X-2, gol attesi, over, entrambe a segno) |
| `/fantacalcio` | sezione fantacalcio (pagine dedicate: il fantacalcio non compare nelle pagine generali) |
| `/fantacalcio/asta` | asta: configurazione della lega (campionato, Classic/Mantra, crediti, rosa, punteggi, modificatori) e listone con voti 1-100 (titolarità, bonus, voto, malus, fisico, club), fantamedia stimata, crediti consigliati e tabellone acquisti; impostazioni e acquisti restano nel browser (`lib/fantasy/`); fasce per ruolo e nove strategie d'asta simulate sul listone |
| `/compare?a=&b=` | due giocatori a confronto sulla stessa stagione, con valori ogni 90 minuti |
| `/search?q=` | ricerca squadre, giocatori e competizioni (suggerimenti live nella barra) |
| `/competitions/serie-a` | partite per giornata, classifica, squadre, statistiche (gol, xG, over 2,5, casa/trasferta), marcatori e assist per stagione |
| `/matches/123` | tabellino: cronaca, formazioni, statistiche, voti; classifica e precedenti a lato |
| `/teams/inter-505` | partite, rosa, posizioni in classifica |
| `/players/n-gonzalez-1234` (`/2024` per una stagione) | totali, statistiche per stagione, partita per partita |

## Database

Progetto Supabase dedicato "GiBiScore". Tutte le tabelle stanno nello schema
`public`, visibile nel Table Editor e nella Data API senza configurazione:
lettura pubblica via RLS, scrittura solo con la chiave di servizio dei job;
`sync_runs`, `sync_state` e `player_season_raw` non sono leggibili dal sito.
Le migrazioni stanno in `supabase/migrations/` e si applicano in ordine.
