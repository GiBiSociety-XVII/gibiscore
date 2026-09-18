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
app/[locale]/        route (`it` all'indirizzo semplice, `en` sotto /en; le lingue stanno in i18n/routing.ts)
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
  Supercoppa, le tre coppe UEFA e le altre top 5 europee. Dettaglio completo
  al ritmo più alto: squadre e rose, formazioni, statistiche squadra e
  giocatore a ogni minuto di gioco, infortuni, quote ogni tre ore,
  classifiche a fine giornata, archivio delle stagioni passate, pronostici
  e schedine.
- **base** (`tier = basic`): tutto il resto. Tutto quello che il provider
  dichiara di coprire per quella lega (`leagues.season_coverage`, letto da
  `lib/football/coverage.ts`), a un ritmo più lento e solo per la stagione
  in corso: calendario completo, risultati ed eventi live, formazioni e
  statistiche delle partite ogni tre minuti di gioco e a fine gara,
  classifiche a ogni risultato, squadre e rose (aggiornate ogni settimana),
  statistiche stagionali dei giocatori, infortuni e quote (una volta al
  giorno) dove coperti. Una lega senza copertura per un dato non viene mai
  interrogata per quello. Nessun archivio delle stagioni passate e nessun
  pronostico nella pagina Pronostici.

La lista in evidenza è in `lib/football/competitions.ts`
(`API_FOOTBALL_FEATURED_LEAGUE_IDS` per cambiarla senza codice);
`API_FOOTBALL_SCOPE=featured` limita il sito alle sole leghe in evidenza.

I job stanno in `lib/football/sync/` e sono esposti come route cron protette
da `CRON_SECRET` (`vercel.json` definisce gli orari). Il piano API-Football è
**Mega: 900 richieste al minuto, 150.000 al giorno**, e i limiti li fa
rispettare il client (`lib/api-football/client.ts`), non i singoli job:

- ogni richiesta passa da un freno al minuto condiviso (600 al minuto per i
  job batch, il resto resta al job live e a un eventuale job lanciato a mano);
  se il provider risponde comunque "troppe richieste" il job batch aspetta un
  minuto e riprova, il job live lascia perdere fino al minuto dopo;
- ogni risposta aggiorna il conteggio giornaliero, salvato in `sync_state` e
  letto da tutti i job prima di partire. Tre classi di job: **essenziali**
  (live, calendario, competizioni) girano sempre; **ordinari** (classifiche,
  infortuni) tengono 5.000 richieste di riserva; **archivio** (rose,
  statistiche stagionali, partite passate) partono solo con più di 20.000
  richieste ancora disponibili.

Il piano è largo, ma nessun job gira a vuoto: una richiesta parte solo
quando qualcosa può essere cambiato. Una lega che non gioca non viene
interrogata (classifiche solo dopo un risultato, infortuni solo con una
partita in arrivo, statistiche solo dopo una giornata), e a mercato chiuso
rose e cessioni restano ferme.

| Job | Frequenza | Richieste | Cosa fa |
|---|---|---|---|
| `sync-live` | ogni minuto | 0 se nessuna partita può essere in corso; altrimenti 1, più 1 ogni 20 partite in evidenza in corso, più 1 ogni 60 partite base coperte in corso | punteggi ed eventi di tutte le partite in corso dal feed live; formazioni, statistiche e voti (per id) per le partite in evidenza a ogni giro, per quelle base coperte ogni tre minuti, per tutte a fine gara |
| `sync-fixtures` | ogni ora | 3 | tutte le partite di ieri, oggi e domani (una richiesta per giorno) |
| `sync-fixtures?window=month` | ogni giorno | 32 | finestra estesa a +30 giorni |
| `sync-standings` | ogni ora | 0-13 in evidenza, fino a 300 base | classifiche delle stagioni con un risultato da quando la tabella è stata salvata: prima le leghe in evidenza (comunque una volta al giorno), poi quelle base coperte |
| `sync-injuries` | ogni 30 minuti | 0-13, più le poche leghe base coperte | infortuni e squalifiche delle leghe con una partita nei prossimi 7 giorni (una riga per partita saltata: da qui `lib/football/spells.ts` ricava durata e rientro) |
| `sync-competitions` | ogni giorno | 1 + fino a 200 | tutte le leghe e stagioni correnti con la copertura dichiarata, stagioni passate delle leghe in evidenza; squadre di ogni stagione corrente (`season_teams`, con paese, stadio e anno di fondazione) una volta a settimana, prima le leghe in evidenza poi 200 base a giro |
| `sync-squads` | ogni ora | 0 a mercato chiuso, ~2 per club in evidenza (~520, una volta al giorno) a mercato aperto; 1 per club base, fino a 300 a giro | rose e feed cessioni (arrivi e partenze) di ogni club in evidenza, i più vecchi prima; a mercato chiuso solo le rose vecchie di una settimana; poi le rose dei club base vecchie di una settimana (~8.500 club, un giro completo alla settimana); quel che non entra nei 4 minuti passa al giro dopo |
| `sync-backfill` | ogni ora | 0 se niente manca, fino a ~250 liste + 50 dettaglio | calendario completo di ogni stagione (leghe in evidenza: corrente + `API_FOOTBALL_HISTORY_SEASONS` passate; leghe base: la corrente) e dettaglio (eventi, formazioni, statistiche, voti) delle partite finite mai scaricato, dove il provider lo copre, dalle più recenti, 1.000 partite per giro |
| `sync-player-seasons` | ogni ora | 0 senza giornate giocate, ~35 per lega-stagione dopo (budget 1.500 a giro) | statistiche stagionali per giocatore (presenze, minuti, voto, gol, assist, tiri, passaggi, contrasti, duelli, dribbling, falli, cartellini, rigori) in `player_season_stats`: leghe in evidenza con le stagioni passate (una volta sola), poi le leghe base coperte (~500), solo stagione corrente e senza il payload grezzo |
| `sync-lineups` | ogni 5 minuti | 0 senza calci d'inizio vicini, 1 ogni 20 partite | formazioni ufficiali delle partite che iniziano entro 90 minuti (leghe in evidenza e base coperte), salvate come formazioni attese per la giornata del fantacalcio |
| `sync-odds` | ogni 3 ore | 1 per partita: in evidenza dei prossimi 3 giorni a ogni giro, base coperte dei prossimi 2 giorni una volta al giorno (fino a 600 a giro) | quote pre-partita dei bookmaker (`fixture_odds`); nello stesso giro scrive le giocate del modello per le partite in evidenza e chiude quelle finite |
| `prune` | ogni notte | 0 | pulizia del database: dettaglio delle partite delle leghe base più vecchie di due stagioni, payload grezzi del provider oltre due stagioni, giri dei job oltre 30 giorni, registro delle notifiche mandate oltre 14 giorni, errori del sito oltre 30 giorni |

Consumo tipico a regime: 10.000-20.000 richieste al giorno nei weekend
(live di ~1.500 partite base e formazioni/statistiche di quelle coperte,
quote, classifiche), 3.000-6.000 nei giorni feriali; il primo giro sulle
leghe base (calendari, squadre, rose, statistiche stagionali, dettaglio
delle partite già giocate) costa qualche decina di migliaia di richieste
spalmate su alcuni giorni. L'archivio storico delle leghe in evidenza si
completa in un giorno.

### Cosa il database dimentica

Calendario, risultati e classifiche di ogni competizione restano per
sempre: sono piccoli e sono quello di cui sono fatte le pagine. Il job
`prune`, una volta a notte, toglie solo ciò che non viene più letto:

- il dettaglio delle partite delle leghe base (eventi, voti e statistiche
  dei giocatori, statistiche squadra, formazioni) da due stagioni
  indietro in giù. La stagione in corso e quella prima restano intere, e
  le leghe in evidenza non vengono mai toccate: pagine giocatore, studio
  e modello del fantacalcio leggono tre stagioni.
- i payload grezzi del provider (`player_season_raw`) più vecchi delle
  statistiche che ne sono state ricavate: nel sito non li legge nessuno.
- la contabilità che invecchia: giri dei job, registro delle notifiche
  già mandate, errori del sito.

Cancellare non restringe il disco da solo: Postgres riusa lo spazio per
quello che arriva, ed è esattamente lo scopo. Ogni giro ha un tetto di
4.000 partite, così un arretrato di anni si spalma su qualche notte
invece di martellare il database. Le soglie stanno in cima a
`lib/football/sync/prune.ts`.

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
che i cron orari smaltiscono in un giorno (o subito, lanciando i job a mano).

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

## Notifiche push

Un utente con l'account riceve sul telefono o sul computer, anche a sito
chiuso, le notifiche delle partite delle competizioni e delle squadre che ha
tra i preferiti: calcio d'inizio, fine primo tempo, finale, ogni gol con chi
ha segnato, espulsioni e formazioni ufficiali. Web Push standard
(`web-push`, chiavi VAPID in `NEXT_PUBLIC_VAPID_PUBLIC_KEY` e
`VAPID_PRIVATE_KEY`): su Android e desktop con qualsiasi browser, su iPhone
e iPad solo con il sito aggiunto alla schermata Home.

- `lib/notifications/events.ts` (puro, testato): dallo stato salvato e da
  quello appena letto dal provider ricava cosa è successo; ogni notifica ha
  una chiave e la tabella `notified` fa da registro, così un secondo giro del
  job o un feed che rielenca gli eventi non manda due volte lo stesso gol. Un
  evento più vecchio di 12 minuti di gioco non è più una notizia: al primo
  giro dopo un deploy non arriva tutto il primo tempo.
- `lib/notifications/dispatch.ts`: chiamato da `sync-live` a ogni giro e da
  `sync-lineups`; trova chi segue la partita (`user_favorites`), rispetta
  l'interruttore generale e i tipi scelti (`notification_settings`) e le
  partite silenziate (`muted_fixtures`), manda a ogni browser iscritto
  (`push_subscriptions`) e dimentica i browser che il servizio push dice
  spariti. Ogni notifica è scritta in tutte le lingue del sito e ogni
  browser riceve la sua (`push_subscriptions.locale`, salvata quando si
  iscrive), compreso il link che apre.
- Gli errori del sito finiscono in `error_log` (tabella riservata alla
  chiave di servizio): le letture fallite del livello dati e quello che
  il confine d'errore di una pagina cattura nel browser, mandato da
  `/api/errors`. Lo stesso messaggio ripetuto nel minuto conta una volta
  sola con un contatore. Si leggono in `/admin/sync`, sotto i job, e il
  job `prune` li tiene a 30 giorni.
- Il profilo (`/account`) attiva o disattiva il dispositivo, mette in pausa
  tutto, sceglie i tipi; la campanella nella pagina della partita silenzia
  quella sola partita (niente spoiler mentre la si guarda). Il service worker
  è `public/sw.js`: mostra la notifica e al tocco apre la partita.

## Identità

I file del marchio (icone, favicon, lockup di GiBiScore, GiBiArena e
GiBiSociety) e le regole d'uso stanno in `public/brand/` (`README.txt`).
Accento di GiBiScore `#3BC9FF` (`--accent`), testo colorato su chiaro
`#0A72A8` (`--accent-text`), tile e testo `#14131A`. Il favicon usa la
variante ad accento pieno, iOS la tile nera, `theme-color` `#14131A`.

## Pagine

Struttura alla Diretta/Sofascore: barra laterale con le competizioni
principali e tutti i paesi, lista risultati al centro, classifiche nella
colonna di destra. URL in inglese.

Il sito è in italiano e in inglese: l'italiano sta all'indirizzo semplice
(`/predictions`), l'inglese sotto il prefisso (`/en/predictions`). Nella barra
c'è il codice dell'altra lingua: porta alla stessa pagina, con la stessa query,
e next-intl ricorda la scelta nel suo cookie. I testi stanno in
`core/<area>/i18n/<lingua>/<Namespace>.json`, un file per namespace e per
lingua, con le stesse chiavi. Fuori dai testi delle pagine: la pagina di
errore, l'immagine della schedina condivisa e le notifiche push hanno il
loro piccolo dizionario nel file (non possono usare next-intl); ogni browser
salva la lingua con cui si è iscritto (`push_subscriptions.locale`) e riceve
le notifiche, e il link che aprono, in quella.

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
