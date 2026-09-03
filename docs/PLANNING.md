# GiBiScore — Studio e pianificazione

Documento di lavoro. Si aggiorna man mano che le decisioni vengono prese.
Nulla di quanto scritto qui e' ancora implementato.

## 1. Cosa e' GiBiScore (deciso)

- Dominio: **gibiscore.com**, owner GiBiSociety (stesso team di GiBiArena)
- Sito di **risultati e statistiche calcio**: partite live, classifiche,
  statistiche di giocatori, squadre e campionato. Obiettivo: "studiare" il
  calcio, non solo leggere il punteggio.
- Dati da **API esterne** (vedi sezione 3)
- **Login facoltativo**. Chi ha gia' un account GiBiArena lo usa anche qui
  (stesso Supabase Auth, vedi sezione 5)
- Lingua: **solo italiano** all'inizio, inglese in seguito. Si parte comunque
  con la struttura `app/[locale]` per non dover rifare le route dopo.
- Monetizzazione: **pubblicita' per gli utenti free**; **abbonamento** che
  toglie la pubblicita' e sblocca tutte le funzioni (Stripe, come GiBiArena)
- Repo: `GiBiSociety-XVII/gibiscore` (pubblico), partito vuoto, costruito da zero

## 2. Ancora da decidere

1. Quale API calcio (sezione 3) e quali campionati coprire al lancio.
   Proposta: Serie A + Serie B + Champions League, poi le altre top 5.
2. Quali funzioni sono Premium e quali free (sezione 6).
3. Prezzo dell'abbonamento e se e' lo stesso abbonamento di GiBiArena o uno separato.

## 3. Fonti dati: API calcio a confronto

Verificato a settembre 2026 (prezzi indicativi, da ricontrollare al momento della firma).

| API | Free | A pagamento | Note |
|---|---|---|---|
| **API-Football** (api-sports.io) | 100 richieste/giorno, tutti gli endpoint | da ~19 $/mese, tutte le competizioni | Copertura piu' ampia: live, formazioni, statistiche giocatori, eventi. Piani prepagati, quota bloccata (nessun extra a sorpresa). Buon compromesso per partire. |
| **football-data.org** | 12 competizioni (incluse Serie A, Champions, top 5 europee), 10 chiamate/min, punteggi in ritardo | add-on per live e dati approfonditi | Free "per sempre" dichiarato. Nessuna statistica giocatore nel free. Ottimo per prototipo e classifiche, insufficiente per "studiare i giocatori". |
| **Sportmonks** | solo Superliga danese e Premiership scozzese | da ~29-39 EUR/mese (piano European) | Dati di qualita' professionale, piani per numero di leghe. Il piu' caro dei tre ma il piu' solido se si cresce. |

Consiglio: **API-Football** per partire (free per sviluppare, ~19 $/mese in
produzione), con un layer di cache nostro (sezione 5) cosi' le richieste
verso l'API non crescono con i visitatori. Se in futuro serviranno dati
piu' fini (xG, heatmap) valutare Sportmonks o l'add-on di API-Football.

Regola importante: **mai chiamare l'API dal browser**. Le chiamate passano
sempre dal server (cron + cache in DB) per proteggere la chiave e la quota.

## 4. Direzione grafica: DECISO, opzione A (Bold Blocks, stile GiBiArena)

Scelta il 3 settembre 2026. GiBiScore riprende i token e i componenti
`bb-*` di GiBiArena: sfondo #f5f3ee, inchiostro #14131a, card bianche,
bordi 2.5px, ombre piene, accento lime #b6ff3c, font Geist, radius 12/16px.
La B e' stata scartata perche' troppo simile agli altri siti di live score;
B e C restano come riferimento (tema scuro futuro, pagine di analisi).

Da affinare in fase di implementazione: nelle tabelle dense (classifica
completa, statistiche giocatore) usare bordi interni piu' leggeri per non
perdere leggibilita'.

Bozze su canvas (link nella chat). Tutte mostravano la stessa homepage
(partite live, classifica, giocatore in evidenza, spazio ads, banner Premium)
per un confronto onesto.

| | A · Bold Blocks (stile GiBiArena) | B · Broadcast scuro | C · Quotidiano sportivo |
|---|---|---|---|
| Look | Sfondo caldo #f5f3ee, bordi inchiostro 2.5px, ombre piene, accento lime #b6ff3c, font Geist | Tema scuro, numeri grandi condensati (Barlow Condensed), verde campo, ticker | Carta calda, testata serif (Newsreader), colonne con filetti, verde profondo + rosso live |
| Pro | Un solo ecosistema riconoscibile, componenti `bb-*` riutilizzabili subito | Linguaggio delle app di live score e delle grafiche TV, ottimo di sera e su mobile | Valorizza analisi e lettura, differenzia GiBiScore come sito "di studio" |
| Contro | Bordi spessi mangiano spazio nelle tabelle dense | Si allontana da GiBiArena, contrasti e ads da curare | Meno adatto a scorrere partite live in fretta |


## 5. Stack e architettura proposti

Stesso stack di GiBiArena (Opzione A dello studio precedente), scelto perche'
il sito ha dati live, login, abbonamenti e cron: un sito statico non basta.

| Area | Scelta | Motivo |
|---|---|---|
| Framework | Next.js 16 App Router + React 19 + TypeScript | uguale a GiBiArena |
| Stile | Tailwind CSS 4 + lucide-react | uguale a GiBiArena |
| i18n | next-intl, `app/[locale]`, solo `it` attivo all'inizio | inglese si aggiunge senza rifare le route |
| DB + Auth | Supabase, **progetto dedicato** `gibiscore` | dati calcio separati da GiBiArena |
| Account condiviso | stesso Supabase Auth di GiBiArena? Due strade (sotto) | l'utente ha chiesto login condiviso |
| Pagamenti | Stripe | uguale a GiBiArena |
| Hosting | Vercel, nuovo progetto `gibiscore`, cron in `vercel.json` | uguale a GiBiArena |
| Ads | Adsterra (gia' usato in GiBiArena) | componenti riutilizzabili |
| Package manager | pnpm | uguale a GiBiArena |

### Login condiviso con GiBiArena: due strade

1. **Stesso progetto Supabase di GiBiArena** (schema `gibiscore` separato per
   le tabelle calcio). Login condiviso "gratis": stessa tabella `auth.users`,
   stesso abbonamento visibile da entrambi i siti.
   Contro: i due siti condividono il DB, un problema su uno tocca l'altro.
2. **Progetto Supabase separato** + Auth federata (l'utente si logga su
   GiBiScore con un provider OAuth e si collega l'email). Piu' pulito ma
   l'abbonamento condiviso va sincronizzato a mano via Stripe webhook.

Consiglio: **strada 1**, perche' il login condiviso e l'eventuale abbonamento
unico sono il valore che l'utente ha chiesto. I dati calcio stanno in uno
schema Postgres separato (`football.*`) con le loro RLS.

### Flusso dati

```
API-Football  --cron Vercel (ogni 1-2 min durante le partite, ogni ora altrimenti)-->
Supabase (tabelle football.*: fixtures, standings, players, teams, stats)  -->
Next.js (Server Components + SWR per il live)  -->  utente
```

- Le pagine leggono **solo dal nostro DB**, mai dall'API esterna.
- Cache HTTP breve (`revalidate`) per le pagine live, lunga per storico.

## 6. Mappa del sito (prima versione)

| Route | Contenuto | Free / Premium |
|---|---|---|
| `/` | Partite live, classifica breve, giocatore in evidenza | free |
| `/live` | Tutte le partite di oggi con aggiornamento automatico | free |
| `/serie-a` (per competizione) | Calendario, risultati, classifica completa | free |
| `/squadre/[slug]` | Rosa, forma, statistiche stagionali | base free, avanzate premium |
| `/giocatori/[slug]` | Scheda giocatore, statistiche per partita | base free, confronti e storico premium |
| `/partita/[id]` | Dettaglio partita: eventi, formazioni, statistiche | free, xG e heatmap premium |
| `/classifiche` | Marcatori, assist, cartellini | free |
| `/premium` | Pagina abbonamento | - |
| `/account` | Profilo, abbonamento | login |

## 7. Decisioni infrastrutturali

- **Supabase**: vedi sezione 5 (strada 1 consigliata).
- **Vercel**: nuovo progetto `gibiscore` collegato a questo repo, dominio `gibiscore.com`.
- **Branching**: `main` = produzione; branch `claude/*` per il lavoro assistito, PR verso `main`.
- **Env**: `.env*` mai committati. Chiave API-Football solo lato server.

## 8. Prossimi passi

1. ~~Scegliere la direzione grafica~~ fatto: opzione A.
2. Confermare API-Football e i campionati del lancio.
3. Confermare la strada per il login condiviso (sezione 5).
4. Definire cosa e' Premium (sezione 6).
5. Solo dopo: scaffolding del progetto Next.js.
