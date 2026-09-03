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
- Monetizzazione: **per ora tutto gratis**, nessun abbonamento. Premium e
  abbonamenti si valutano in futuro. La pubblicita' resta possibile fin da
  subito (componenti Adsterra di GiBiArena) ma non e' un requisito del lancio.
- Fornitore dati: **API-Football** (api-sports.io), piano Pro o Ultra. Deciso il 3 settembre
  2026 dopo aver visto il listino Sportmonks: il pacchetto completo superava i 400 euro al
  mese, il piano Starter da 29 euro limita a 5 leghe senza coppe europee.
- Infrastruttura: **progetto Supabase dedicato a GiBiScore**, separato da
  GiBiArena. Al massimo si condivide l'autenticazione (sezione 5).
- Repo: `GiBiSociety-XVII/gibiscore` (pubblico), partito vuoto, costruito da zero

## 2. Ancora da decidere

Nessuna decisione bloccante. Lo studio e' chiuso il 3 settembre 2026.
Restano da verificare in fase di sviluppo:
1. Copertura reale di Serie B e Coppa Italia durante il trial Sportmonks.
2. Come condividere l'autenticazione tra due progetti Supabase (sezione 5),
   solo quando il login diventera' davvero utile.

## 3. Fonti dati: DECISO, API-Football (cambio del 3 settembre 2026)

**Decisione finale: API-Football**, piano Pro (~19 $/mese, 7.500 richieste al
giorno) o Ultra (~29 $/mese, 75.000). Tutte le leghe incluse, comprese le coppe
europee; eventi, formazioni, statistiche squadra e giocatore con rating,
infortuni, classifiche, xG di squadra dove disponibile, storico stagioni.
Mancano rispetto a Sportmonks: xG per singolo tiro, formazioni attese,
pressure index, tutti extra a pagamento anche li'.

Perche' non Sportmonks: il pacchetto completo visto al checkout superava i 400
euro al mese; il piano Starter da 29 euro limita a 5 leghe e le coppe europee
richiedono un piano speciale da altri 29 euro; xG e previsioni sono add-on.
Per un sito gratuito il rapporto dati/costo di API-Football e' migliore.

Il confronto originale resta sotto come storico.

### Confronto originale (settembre 2026, prima del cambio)

Obiettivo dichiarato: **pacchetto completo**, non il minimo per partire.
Servono, per ogni partita: pre-match (formazioni probabili, infortuni,
squalifiche, precedenti, forma), live (eventi minuto per minuto,
formazioni ufficiali, statistiche squadra e giocatore in tempo reale, xG),
post-match (statistiche finali, voti giocatore) e, in prospettiva, quote
e dati utili a previsioni e fantacalcio.

Verificato a settembre 2026 dai siti dei fornitori e da confronti terzi.
Prezzi indicativi, da ricontrollare prima della firma.

### Matrice di copertura

| Dato | API-Football | Sportmonks | TheStatsAPI | football-data.org |
|---|---|---|---|---|
| Calendario, risultati, classifiche | si | si | si | si (free) |
| Eventi live minuto per minuto | si | si | si | no (in ritardo) |
| Formazioni ufficiali | si | si | si | no |
| Formazioni probabili (pre-match) | no | si (Expected Lineups, premium) | no | no |
| Statistiche squadra per partita | si | si | si | no |
| Statistiche giocatore per partita | si | si | si | no |
| Voto/rating giocatore | si | si | non verificato | no |
| Infortuni e squalifiche | si | si | non verificato | no |
| xG (expected goals) | **no** | si, add-on da ~15 EUR/mese (3 livelli: 12h dopo, subito, live) | si, incluso, anche per singolo tiro | no |
| Quote bookmaker | si (endpoint odds) | si, piano All-In (50+ bookmaker, 150+ mercati) | si (Bet365, Pinnacle, Betfair...) | no |
| Previsioni pre-calcolate | si | si (piano All-In) | no | no |
| Serie A / Serie B / Coppa Italia | si / si / si | si / si / si (European Plan) | 150 competizioni, Italia da verificare | solo Serie A |
| Storico | si | si | 10 anni | limitato |
| Prezzo indicativo | free 100 req/giorno; da ~19 $/mese | European Plan ~39 EUR/mese + xG ~15 EUR; All-In per quote e previsioni | da 50 $/mese, trial 7 giorni | free |

### Proposta di pacchetto

**Fornitore principale: Sportmonks, European Plan + add-on xG**
(~55 EUR/mese al lancio, All-In in seguito per quote e previsioni).
Motivi:
- e' l'unico dei quattro che copre tutto l'elenco sopra da un solo
  fornitore, incluse formazioni probabili e xG live;
- Serie A, Serie B e Coppa Italia sono nel piano base europeo insieme a
  Champions, Europa League e top 5;
- ha gia' dati pensati per prodotti fantasy (rating, formazioni attese,
  eventi live) che servono alla fase 2;
- API v3 ben documentata, trial 14 giorni per verificare tutto prima di pagare.

**Alternativa: API-Football** (~19 $/mese). Costa meno e copre quasi tutto,
ma non ha xG ne' formazioni probabili: per il "pacchetto completo" andrebbe
affiancato a TheStatsAPI (50 $/mese) e si finirebbe a pagare di piu' con due
integrazioni da mantenere.

**Da non usare**: football-data.org (free ma solo risultati e classifiche)
e scraping di siti come FBref, Understat o Fantacalcio.it (vietato dai loro
termini, fragile, rischio legale per un sito commerciale).

Decisione presa: **Sportmonks European Plan + xG**. Prima del
contratto faremo il trial di 14 giorni controllando sul campo la copertura
reale di Serie B e Coppa Italia (le pagine di copertura dichiarano gli id
delle leghe, ma la completezza puo' variare per stagione).

### Campionati al lancio (proposta)

Serie A, Serie B, Coppa Italia, Champions League, Europa League,
Conference League. Le altre top 5 (Premier, Liga, Bundesliga, Ligue 1)
sono gia' nel piano e si possono attivare quando la UI e' pronta.

### Regola di architettura

**Mai chiamare l'API dal browser**. Cron Vercel + cache in Supabase
(sezione 5). Le pagine leggono solo dal nostro DB. Questo tiene le chiamate
verso il fornitore indipendenti dal numero di visitatori.

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
| DB + Auth | Supabase, **progetto dedicato** `gibiscore` (deciso) | dati calcio separati da GiBiArena |
| Account condiviso | progetto separato; condivisione dell'auth in un secondo momento (sotto) | deciso: al massimo si condivide l'auth |
| Pagamenti | nessuno al lancio; Stripe in futuro se arrivera' il Premium | deciso: tutto gratis per ora |
| Hosting | Vercel, nuovo progetto `gibiscore`, cron in `vercel.json` | uguale a GiBiArena |
| Ads | Adsterra (gia' usato in GiBiArena) | componenti riutilizzabili |
| Package manager | pnpm | uguale a GiBiArena |

### Login e condivisione con GiBiArena (deciso: progetto separato)

Il progetto Supabase di GiBiScore e' separato. Il login e' facoltativo e
al lancio serve a poco (tutto e' gratis), quindi non blocca nulla.

Piano in due tempi:
1. **Lancio**: Supabase Auth del progetto GiBiScore con gli stessi provider
   di GiBiArena (email + gli stessi OAuth). Chi ha un account GiBiArena si
   registra con la stessa email: account tecnicamente distinti, esperienza
   simile. Nessuna dipendenza tra i due progetti.
2. **Quando servira' davvero un account unico** (preferiti, notifiche,
   eventuale Premium): valutare la funzione "third-party auth" di Supabase
   per far accettare al progetto GiBiScore i token emessi dal progetto
   GiBiArena, oppure un piccolo servizio di collegamento account via email
   verificata. Da studiare nel dettaglio in quel momento, non ora.

Nel DB di GiBiScore i dati calcio vanno in uno schema dedicato (`football.*`)
e i dati utente in `public.*`, cosi' la parte calcio resta indipendente
dall'autenticazione qualunque strada si scelga.

### Flusso dati

```
API-Football  --cron Vercel (ogni 1-2 min durante le partite, ogni ora altrimenti)-->
Supabase (tabelle football.*: fixtures, standings, players, teams, stats)  -->
Next.js (Server Components + SWR per il live)  -->  utente
```

- Le pagine leggono **solo dal nostro DB**, mai dall'API esterna.
- Cache HTTP breve (`revalidate`) per le pagine live, lunga per storico.

## 6. Mappa del sito (aggiornata al 3 settembre 2026)

URL in inglese come su GiBiArena, testi in italiano. Tutto gratis al lancio.

| Route | Contenuto | Stato |
|---|---|---|
| `/` | Partite del momento, classifica Serie A, giocatore in evidenza | fatta |
| `/live` | Partite di ieri, oggi e domani per competizione, live in cima | fatta |
| `/competitions` | Elenco competizioni seguite | fatta |
| `/competitions/[slug]` | Classifica completa (con gironi), prossime partite e risultati per giornata, live | fatta |
| `/matches/[id]` | Scoreboard, cronaca, formazioni, statistiche squadra, voti e fantavoto giocatori | fatta |
| `/teams/[slug]` | Posizione in classifica, ultime e prossime partite, rosa, indisponibili | fatta |
| `/players/[slug]` | Scheda, totali stagionali, partita per partita con voto e fantavoto | fatta |
| `/account` | Profilo, preferiti (solo se loggato) | da fare |
| ricerca squadre/giocatori | dalla barra in alto | da fare |
| classifiche marcatori, assist, cartellini | per competizione | da fare |

## 7. Decisioni infrastrutturali

- **Supabase**: vedi sezione 5 (strada 1 consigliata).
- **Vercel**: nuovo progetto `gibiscore` collegato a questo repo, dominio `gibiscore.com`.
- **Branching**: `master` = produzione (come GiBiArena); branch `claude/*` per il lavoro assistito, PR verso `master`.
- **Env**: `.env*` mai committati. Chiave API-Football solo lato server.

## 8. Prossimi passi

1. ~~Scegliere la direzione grafica~~ fatto: opzione A.
2. ~~Attivare il trial Sportmonks~~ sostituito da API-Football: verificare la copertura
   con `/api/cron/api-football-status` e il primo giro dei job.
3. ~~Confermare la strada per il login condiviso~~ fatto: progetto Supabase separato.
4. ~~Definire cosa e' Premium~~ fatto: tutto gratis per ora.
5. ~~Scaffolding del progetto Next.js~~ fatto (3 settembre 2026).
6. ~~Job di sincronizzazione~~ riscritti per API-Football, testati sui mapper; da
   validare con la chiave reale (`pnpm probe:api-football`, poi i cron).
7. ~~Pagine: partita, squadra, giocatore, calendario per competizione~~ fatte (3 settembre 2026).
   Restano: ricerca, classifiche marcatori/assist, account.
8. Login facoltativo con Supabase Auth.

## 9. Fase 2 (in seguito): analisi, previsioni, scommesse, fantacalcio

Non si costruisce ora. Si registra qui perche' condiziona le scelte di oggi:
il DB deve conservare **tutto lo storico** (eventi, statistiche per
giocatore, xG, quote pre-match e di chiusura) fin dal primo giorno, perche'
i modelli si addestrano sul passato e non si puo' tornare indietro a
raccogliere dati non salvati.

### 9.1 Previsione risultati

1. **Baseline statistica**: modello di Poisson / Dixon-Coles sui gol, con
   forza attacco e difesa per squadra e fattore campo. Semplice, spiegabile,
   funziona sorprendentemente bene. Si costruisce in SQL + un cron notturno.
2. **Modello con feature ricche**: gradient boosting (LightGBM o simile) con
   xG rolling, forma, riposo tra le partite, assenze pesate per minuti
   giocati, formazioni probabili. Richiede almeno 2-3 stagioni di storico.
3. **Valutazione onesta**: backtest per giornata, mai "in-sample". Metriche:
   log-loss e Brier score, confrontati con le quote di chiusura dei
   bookmaker (che sono il riferimento piu' difficile da battere).

Dove girano i modelli: all'inizio dentro Next.js/Supabase (Poisson e' poca
matematica). Per il gradient boosting servira' un piccolo servizio Python
separato (cron) che scrive le previsioni nel DB. Le previsioni pre-calcolate
di Sportmonks (All-In) possono servire da confronto o da fallback.

### 9.2 Consigli scommesse

Il "consiglio" e' la differenza tra la probabilita' del nostro modello e
quella implicita nella quota (value bet). Serve lo storico quote per
calibrare. **Vincolo legale importante (Italia, Decreto Dignita' 2018)**:
e' vietata qualsiasi pubblicita', anche indiretta, di gioco con vincita in
denaro, inclusi banner, affiliazioni e sponsorizzazioni di bookmaker.
Restano leciti i contenuti informativi (analisi, pronostici, confronto quote)
se trasparenti e non ingannevoli, secondo le linee guida AGCOM. Conseguenze
pratiche:
- niente link affiliati o banner di bookmaker sul sito;
- la sezione pronostici deve essere informativa, con disclaimer;
- attenzione anche alle reti pubblicitarie (Adsterra): bloccare la categoria
  gambling nelle campagne servite in Italia.
Il governo sta valutando allentamenti nel 2026, da seguire.

### 9.3 Fantacalcio

- **Non esiste un'API ufficiale dei voti** (Fantacalcio.it, Gazzetta, Corriere
  pubblicano i voti sui loro siti; lo scraping e' vietato dai termini).
- Strada proposta: calcolare un **nostro "fantavoto"** a partire dal rating
  giocatore e dagli eventi (gol, assist, cartellini, rigori, gol subiti per
  i portieri) forniti dall'API, dichiarandolo come nostro e non "ufficiale".
- Funzioni ad alto valore: formazioni probabili (dall'API), infortuni e
  squalifiche, calendario delle prossime 5 giornate per squadra (difficolta'),
  "chi schierare" basato sulle previsioni della sezione 9.1, storico
  fantavoto per giocatore.
- Se un giorno si introdurra' il Premium, e' il candidato naturale.

### 9.4 Cosa fare gia' nella fase 1 per non chiudersi porte

- Salvare eventi, statistiche giocatore, xG e quote per ogni partita, non
  solo il risultato.
- Tabelle con chiavi stabili (id fornitore + id nostro) per poter cambiare
  fornitore senza perdere lo storico.
- Snapshot delle quote pre-match a orari fissi (es. 24h e 1h prima) e alla
  chiusura.
