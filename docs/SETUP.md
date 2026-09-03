# GiBiScore: attivazione con dati reali

Procedura una tantum per passare dai dati di esempio ai dati API-Football.
Tempo stimato: 20-30 minuti, di cui la maggior parte in attesa dei job.

## 0. Prerequisiti gia' fatti

- Repo `GiBiSociety-XVII/gibiscore` collegato al progetto Vercel, branch `master` = produzione.
- Progetto Supabase "GiBiScore" creato, migrazioni `0001` e `0002` gia' applicate.

## 1. Supabase (5 minuti)

1. Apri il progetto **GiBiScore** su supabase.com.
2. **Project Settings → Data API → Exposed schemas**: aggiungi `football` accanto
   a `public` e salva. Senza questo passaggio il sito non puo' leggere le tabelle
   e continua a mostrare i dati di esempio.
3. **Project Settings → API Keys**:
   - copia la **Publishable key** (`sb_publishable_...`);
   - crea o mostra la **Secret key** (`sb_secret_...`). E' la chiave che i job
     di sync usano per scrivere: non va mai nel codice ne' nel browser.
4. Nella stessa pagina trovi il **Project URL**
   (`https://hhszficxmvfbbodpupxl.supabase.co`).

## 2. API-Football (5 minuti)

1. Registrati su **dashboard.api-football.com** (accesso diretto, non RapidAPI).
2. Il piano **Free** (100 richieste al giorno, tutti gli endpoint e tutte le
   leghe) basta per la prima validazione. Per la produzione serve **Pro**
   (7.500 richieste al giorno) o **Ultra** (75.000).
3. Nella dashboard, sezione **My Access**, copia la **API Key**.
4. Facoltativo ma consigliato: dal tuo computer, con il repo clonato,
   ```bash
   API_FOOTBALL_KEY=latuachiave pnpm probe:api-football
   ```
   scarica in `scratch/api-football/` stato account, leghe, squadre, calendario,
   live, classifica e infortuni della Serie A (~8 richieste). Se qualcosa risponde
   con `errors` non vuoto, si vede subito da qui.

## 3. Variabili d'ambiente su Vercel (5 minuti)

Progetto `gibiscore` → **Settings → Environment Variables**. Aggiungile per
**Production** e **Preview** (spunta entrambi):

| Nome | Valore | Note |
|---|---|---|
| `NEXT_PUBLIC_SITE_URL` | `https://gibiscore.com` | solo Production; in Preview puoi ometterla |
| `NEXT_PUBLIC_SUPABASE_URL` | `https://hhszficxmvfbbodpupxl.supabase.co` | |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | `sb_publishable_...` | dal passo 1.3 |
| `SUPABASE_SECRET_KEY` | `sb_secret_...` | dal passo 1.3, mai pubblica |
| `API_FOOTBALL_KEY` | la chiave del passo 2.3 | mai pubblica |
| `CRON_SECRET` | una stringa casuale lunga | vedi sotto |

Facoltative, utili con il piano Free durante i test:

| Nome | Valore | Effetto |
|---|---|---|
| `API_FOOTBALL_SCOPE` | `featured` | segue solo le leghe in evidenza invece di tutte le ~1.100 |
| `API_FOOTBALL_FEATURED_LEAGUE_IDS` | `135,2` | cambia la lista delle leghe in evidenza senza toccare il codice |
| `API_FOOTBALL_SKIP_SQUADS` | `1` | il job competizioni non scarica le rose (~260 richieste in meno) |

Per generare `CRON_SECRET` da terminale:

```bash
openssl rand -hex 32
```

Vercel invia automaticamente `Authorization: Bearer <CRON_SECRET>` a ogni
chiamata cron quando questa variabile esiste; le route rifiutano tutto il resto.

Dopo aver salvato le variabili: **Deployments → ultimo deploy → Redeploy**.
Le variabili d'ambiente entrano in vigore solo con un nuovo deploy.

## 4. Verifica del deploy e della chiave (2 minuti)

Sostituisci `<deploy>` con il dominio del deploy di produzione
(es. `gibiscore.vercel.app` o `gibiscore.com`).

- `https://<deploy>/api/health` deve rispondere `{"ok":true,...}`.
- `https://<deploy>/api/cron/sync-live` aperta dal browser deve rispondere
  `401 unauthorized`: e' corretto, significa che il segreto protegge le route.
- Controlla piano, quota e copertura per lega:

  ```bash
  curl -H "Authorization: Bearer $CRON_SECRET" "https://<deploy>/api/cron/api-football-status"
  ```

  La risposta elenca il piano, le richieste usate oggi e, per ogni competizione
  configurata, nome trovato, stagione corrente e copertura dichiarata
  (eventi, formazioni, statistiche squadra e giocatore, classifiche, infortuni).
  Costa 7 richieste.

## 5. Primo caricamento dati (10-15 minuti)

I cron partono da soli, ma su un database vuoto conviene lanciare i job a mano
nell'ordine giusto. Dal tuo computer, nella cartella del repo:

```bash
export CRON_SECRET=ilsegreto
export BASE_URL=https://<deploy>

pnpm cron sync-competitions                 # tutte le leghe e stagioni; squadre e rose delle leghe in evidenza (~275 richieste)
pnpm cron "sync-fixtures?window=month"      # tutte le partite da ieri a +30 giorni (32 richieste)
pnpm cron "sync-standings?scope=all"        # classifiche di ogni competizione attiva (~300)
pnpm cron sync-injuries                     # infortuni e squalifiche delle leghe in evidenza (~13)
pnpm cron "sync-backfill?limit=2000"        # calendario completo della stagione + eventi, formazioni e voti delle partite gia' giocate (~150 richieste)
pnpm cron "sync-player-seasons?scope=current"   # statistiche stagionali di ogni giocatore delle leghe in evidenza (~450 richieste)
pnpm cron sync-live                         # partite in corso, se ce ne sono adesso
```

Le stagioni passate (default 3, `API_FOOTBALL_HISTORY_SEASONS`) arrivano da
sole con i cron orari di `sync-backfill` e `sync-player-seasons` nel giro di
un paio di giorni. Per averle subito, ripeti finche' `pending` e `seasons_due`
nella risposta non sono 0 (ogni chiamata dura al massimo 5 minuti):

```bash
pnpm cron "sync-backfill?limit=2000"                 # ~100 richieste a chiamata
pnpm cron "sync-player-seasons?scope=history&budget=1500"   # ~35 richieste per lega-stagione
```

Con il piano **Free** (100 richieste al giorno) imposta prima
`API_FOOTBALL_SCOPE=featured` e `API_FOOTBALL_SKIP_SQUADS=1`.

Senza `pnpm` va bene anche `curl`:

```bash
curl -H "Authorization: Bearer $CRON_SECRET" "$BASE_URL/api/cron/sync-competitions"
```

Ogni job risponde con un JSON tipo:

```json
{"ok":true,"job":"sync-competitions","requests":12,"quota":{"dayLimit":100,"dayRemaining":81},"counters":{"leagues":6,"seasons":6,"teams":112},"warnings":[]}
```

Cosa controllare:

- `ok: true` e `warnings` vuoto o quasi. Un avviso "partial coverage" su una
  lega significa che API-Football non fornisce, per quella stagione, uno tra
  eventi, formazioni o statistiche giocatore: il sito mostra quello che c'e'.
- Nei **log di Vercel** il job competizioni stampa una riga per lega:
  `serie-a: API-Football #135 = "Serie A" (Italy)`. Se un nome non
  corrisponde, l'id in `lib/football/competitions.ts` va corretto.
- Su Supabase, **Table Editor → schema `football`**: `leagues`, `teams`,
  `fixtures`, `standings` devono avere righe; `sync_runs` ha una riga per ogni
  esecuzione con `status`, contatori e avvisi.

## 6. Il sito con i dati reali

Apri la homepage: entro un minuto dal primo `sync-fixtures` il badge
"Dati di esempio" sparisce e compaiono partite e classifica reali. La pagina si
rigenera ogni 60 secondi, quindi il live ha al massimo un minuto di ritardo.

## 7. Cron automatici

Su Vercel, **Settings → Cron Jobs** deve elencare i nove job di `vercel.json`:

| Job | Orario (UTC) |
|---|---|
| `sync-competitions` | ogni giorno alle 04:00 |
| `sync-fixtures?window=month` | ogni giorno alle 04:30 |
| `sync-standings?scope=all` | ogni giorno alle 05:00 |
| `sync-fixtures` | ogni ora al minuto 15 |
| `sync-standings` | ogni 30 minuti |
| `sync-injuries` | ogni 6 ore al minuto 45 |
| `sync-backfill` | ogni ora al minuto 20 |
| `sync-player-seasons` | ogni ora al minuto 40 |
| `sync-live` | ogni minuto |

I cron girano **solo sul deploy di produzione** (branch `master`), non sulle
preview. Consumo tipico: 3.500-4.500 richieste al giorno, dentro il piano Pro.
Con il piano Free i cron automatici esauriscono la quota in poche ore:
attivali solo dopo il passaggio a Pro, oppure lascia i cron e accetta che i
job falliscano con `quota` finche' non aggiorni il piano.

## 8. Dominio

Vercel → progetto `gibiscore` → **Settings → Domains** → aggiungi `gibiscore.com`
e `www.gibiscore.com`, poi imposta i record DNS che Vercel indica presso il tuo
registrar. Quando il dominio e' attivo, aggiorna `NEXT_PUBLIC_SITE_URL` se serve.

## 9. Sviluppo locale (facoltativo)

```bash
cp .env.example .env.local   # incolla gli stessi valori del passo 3
pnpm install
pnpm dev                     # http://localhost:3000
CRON_SECRET=... pnpm cron sync-fixtures   # BASE_URL predefinito: localhost:3000
```

## Se qualcosa non torna

| Sintomo | Causa probabile | Rimedio |
|---|---|---|
| Homepage sempre con "Dati di esempio" | schema `football` non esposto, oppure tabelle vuote | passo 1.2, poi passo 5 |
| Job risponde `401` | `CRON_SECRET` mancante o diverso | passo 3, poi Redeploy |
| Job risponde `502` con `kind: "auth"` | chiave API-Football errata o assente | passo 2.3 e 3, poi Redeploy |
| Job risponde `502` con `kind: "quota"` | richieste giornaliere esaurite | aspetta la mezzanotte UTC o passa a Pro; nel frattempo `API_FOOTBALL_SKIP_SQUADS=1` |
| Avviso "partial coverage" per una lega | API-Football non copre eventi/formazioni/statistiche per quella stagione | nessuna azione: il sito mostra i dati disponibili |
| Classifica assente per una coppa | la competizione non ha una tabella in quella fase | normale, `seasons_without_table` nei contatori |
| Partita live senza statistiche | statistiche pubblicate a fine partita da API-Football per quella lega | arrivano con il job live dopo il fischio finale |
| Giocatore con 0 gol o pagina partita vuota per una gara gia' giocata | partita o dettaglio mai scaricati (giornata precedente all'attivazione) | `sync-backfill?limit=2000`, poi il cron orario tiene il passo |
| Tabella "Statistiche per stagione" vuota | `sync-player-seasons` non ancora eseguito per quella lega | `sync-player-seasons?scope=current` (o `scope=history` per le stagioni passate) |
