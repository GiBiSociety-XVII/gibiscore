# Voti ufficiali (Fantacalcio.it)

I voti ufficiali di ogni giornata, uno JSON per giornata per campionato
(`serie-a/4.json`), con l'indice `serie-a/index.ts` generato dallo script.
Il sito li usa nella formazione consigliata: gli ultimi voti reali del
giocatore al posto dei rating del provider, e la scala con cui i rating
del provider vengono tradotti in voti (tarata sulle coppie rating/voto
appena ci sono abbastanza giornate).

Per aggiungere una giornata:

1. Su fantacalcio.it, pagina dei voti della giornata, scarica l'Excel
   ("Voti Fantacalcio Stagione 2026-27 Giornata N").
2. `node scripts/fantacalcio-voti-to-json.mjs ~/Downloads/Voti_..._Giornata_N.xlsx N`
3. Committa `core/fantasy/voti/serie-a/N.json` e `index.ts` e deploya.

I giocatori senza voto (s.v.) hanno `null`. L'abbinamento ai giocatori del
database va per club e cognome, con l'iniziale per gli omonimi, come per il
listone: le righe non abbinate non fanno danni, semplicemente per quel
giocatore resta il rating tradotto.
