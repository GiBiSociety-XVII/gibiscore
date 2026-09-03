# GiBiScore: attivazione con dati reali

Procedura una tantum per passare dai dati di esempio ai dati Sportmonks.
Tempo stimato: 20-30 minuti, di cui la maggior parte in attesa dei job.

## 0. Prerequisiti gia' fatti

- Repo `GiBiSociety-XVII/gibiscore` collegato al progetto Vercel, branch `master` = produzione.
- Progetto Supabase "GiBiScore" creato, migrazione `0001_football_schema.sql` gia' applicata.

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

## 2. Sportmonks (5 minuti)

1. Registrati su sportmonks.com e attiva il **trial di 14 giorni** del piano
   **European Plan**. Se il trial lo consente, aggiungi l'add-on **xG**.
2. **My Sportmonks → API tokens**: crea un token e copialo.
3. Facoltativo ma consigliato: dal tuo computer, con il repo clonato,
   ```bash
   SPORTMONKS_API_TOKEN=iltuotoken pnpm probe:sportmonks
   ```
   scarica in `scratch/sportmonks/` i payload grezzi di stati, leghe, calendario
   e partite live. Se una lega risponde con un nome inatteso o con 403
   (non inclusa nel piano), si vede subito da qui.

## 3. Variabili d'ambiente su Vercel (5 minuti)

Progetto `gibiscore` → **Settings → Environment Variables**. Aggiungile per
**Production** e **Preview** (spunta entrambi):

| Nome | Valore | Note |
|---|---|---|
| `NEXT_PUBLIC_SITE_URL` | `https://gibiscore.com` | solo Production; in Preview puoi ometterla |
| `NEXT_PUBLIC_SUPABASE_URL` | `https://hhszficxmvfbbodpupxl.supabase.co` | |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | `sb_publishable_...` | dal passo 1.3 |
| `SUPABASE_SECRET_KEY` | `sb_secret_...` | dal passo 1.3, mai pubblica |
| `SPORTMONKS_API_TOKEN` | il token del passo 2.2 | mai pubblico |
| `CRON_SECRET` | una stringa casuale lunga | vedi sotto |

Per generare `CRON_SECRET` da terminale:

```bash
openssl rand -hex 32
```

Vercel invia automaticamente `Authorization: Bearer <CRON_SECRET>` a ogni
chiamata cron quando questa variabile esiste; le route rifiutano tutto il resto.

Dopo aver salvato le variabili: **Deployments → ultimo deploy → Redeploy**.
Le variabili d'ambiente entrano in vigore solo con un nuovo deploy.

## 4. Verifica del deploy (1 minuto)

Sostituisci `<deploy>` con il dominio del deploy di produzione
(es. `gibiscore.vercel.app` o `gibiscore.com`).

- `https://<deploy>/api/health` deve rispondere `{"ok":true,...}`.
- `https://<deploy>/api/cron/sync-live` aperta dal browser deve rispondere
  `401 unauthorized`: e' corretto, significa che il segreto protegge le route.

## 5. Primo caricamento dati (10-15 minuti)

I cron partono da soli, ma su un database vuoto conviene lanciare i job a mano
nell'ordine giusto. Dal tuo computer, nella cartella del repo:

```bash
export CRON_SECRET=ilsegreto
export BASE_URL=https://<deploy>

pnpm cron sync-competitions   # leghe, stagioni correnti, squadre, rose (~130 richieste, fino a 5 min)
pnpm cron sync-fixtures       # calendario e risultati da ieri a +14 giorni
pnpm cron sync-standings      # classifiche
pnpm cron sync-live           # partite in corso, se ce ne sono adesso
```

Senza `pnpm` va bene anche `curl`:

```bash
curl -H "Authorization: Bearer $CRON_SECRET" "$BASE_URL/api/cron/sync-competitions"
```

Ogni job risponde con un JSON tipo:

```json
{"ok":true,"job":"sync-competitions","requests":131,"counters":{"leagues":6,"seasons":6,"teams":112,"players":2900},"warnings":[]}
```

Cosa controllare:

- `ok: true` e `warnings` vuoto o quasi.
- Nei **log di Vercel** (Deployments → deploy → Logs, oppure Observability → Logs)
  il job competizioni stampa una riga per lega: `serie-a: Sportmonks #384 = "Serie A"`.
  Se un nome non corrisponde alla lega attesa, l'id in
  `lib/football/competitions.ts` va corretto.
- Su Supabase, **Table Editor → schema `football`**: `leagues`, `teams`,
  `fixtures`, `standings` devono avere righe; `sync_runs` ha una riga per ogni
  esecuzione con `status`, contatori e avvisi.

## 6. Il sito con i dati reali

Apri la homepage: entro un minuto dal primo `sync-fixtures` il badge
"Dati di esempio" sparisce e compaiono partite e classifica reali. La pagina si
rigenera ogni 60 secondi, quindi il live ha al massimo un minuto di ritardo.

## 7. Cron automatici

Su Vercel, **Settings → Cron Jobs** deve elencare i quattro job di `vercel.json`:

| Job | Orario (UTC) |
|---|---|
| `sync-competitions` | ogni giorno alle 04:00 |
| `sync-fixtures` | ogni ora al minuto 15 |
| `sync-standings` | ogni 30 minuti |
| `sync-live` | ogni minuto |

I cron girano **solo sul deploy di produzione** (branch `master`), non sulle
preview. Il job live ogni minuto usa 1-3 richieste: ben dentro i limiti del
piano (3000 richieste per entita' all'ora).

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
| Job risponde `502` con messaggio Sportmonks | token errato, lega non inclusa nel piano, limite richieste | leggi il messaggio: contiene il codice HTTP e l'endpoint |
| Classifica tutta a zero | nomi dei dettagli di classifica diversi da quelli attesi | l'avviso compare in `sync_runs`; passami il payload di `pnpm probe:sportmonks standings/seasons/<id> "participant;details.type"` |
| Partita live senza statistiche | il piano non include quell'include, o la lega non ha statistiche live | controlla `warnings` in `sync_runs` |
