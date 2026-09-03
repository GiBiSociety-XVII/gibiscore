# GiBiScore

Sito di risultati e statistiche calcio di GiBiSociety: partite live, classifiche,
xG e schede di squadre e giocatori. Progetto separato da
[GiBiArena](https://github.com/GiBiSociety-XVII/gibiarena), con cui condivide lo
stile grafico e lo stack.

- Studio e decisioni: [`docs/PLANNING.md`](docs/PLANNING.md)
- Stack: Next.js 16 (App Router) · React 19 · TypeScript · Tailwind CSS 4 ·
  next-intl · Supabase · Vercel · pnpm
- Dati: Sportmonks Football API v3, letti solo dal server e messi in cache nel
  nostro database (le pagine non chiamano mai l'API esterna)

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

## Struttura

```
app/[locale]/        route (solo `it` per ora, l'inglese si aggiunge in i18n/routing.ts)
app/api/             health check e cron (protetti da CRON_SECRET)
components/shared/   primitivi UI "Bold Blocks" (button, card, badge, input), app bar, footer
components/home/     componenti della homepage
core/<area>/i18n/    messaggi next-intl, un file per namespace
lib/db/              client Supabase (browser, server, service)
lib/sportmonks/      wrapper server-only dell'API Sportmonks
lib/football/        tipi di lettura, query per le pagine, dati di esempio
supabase/migrations/ schema `football.*`
```

## Database

Progetto Supabase dedicato "GiBiScore". Lo schema `football` va esposto nel
pannello Supabase (Project Settings → Data API → Exposed schemas) una volta sola.
Le migrazioni stanno in `supabase/migrations/` e si applicano in ordine.
