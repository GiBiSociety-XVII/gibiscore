IDENTITÀ GiBi — GiBiArena · GiBiScore · GiBiSociety
===================================================

IMPIANTO COMUNE (non cambia mai)
  Tile nero        #14131A, raggio d'angolo 22,7% del lato
  Monogramma       "GB" in Poppins Bold, tracciati convertiti in curve
  Glifo in apice   unico elemento di forma che varia
  Accento          unico colore che varia

COLORI
  Nero GiBi        #14131A   (tile, testo)
  GiBiArena        #B6FF3C   accento    #4E7A00  testo su fondo chiaro
  GiBiScore        #3BC9FF   accento    #0A72A8  testo su fondo chiaro
  GiBiSociety      #FF7A45   accento    #C2410C  testo su fondo chiaro

FILE — svg/
  gibi<sito>-icon.svg           icona primaria (tile nero, GB bianco, glifo accento)
  gibi<sito>-icon-accent.svg    tile pieno d'accento, GB nero — CONSIGLIATA COME FAVICON
  gibi<sito>-icon-app.svg       app icon con lastra accento sfalsata
  gibi<sito>-mark.svg           solo GB + glifo, inchiostro nero (header chiari)
  gibi<sito>-mark-white.svg     solo GB + glifo, bianco (header scuri)
  gibi<sito>-lockup.svg         icona + wordmark per fondo chiaro
  gibi<sito>-lockup-dark.svg    icona + wordmark per fondo scuro

FILE — png/  (fondo trasparente)
  gibi<sito>-icon-32/64/180/192/512.png
  gibi<sito>-favicon-accent-32/180/192/512.png
  gibi<sito>-icon-app-1024.png
  gibi<sito>-lockup.png / -lockup-dark.png   (altezza 240 px)

NELL'<head> DI OGNI SITO
  <link rel="icon" type="image/svg+xml" href="/gibiarena-icon-accent.svg">
  <link rel="icon" type="image/png" sizes="32x32" href="/gibiarena-favicon-accent-32.png">
  <link rel="apple-touch-icon" href="/gibiarena-icon-180.png">
  <meta name="theme-color" content="#14131A">

REGOLE
  Sì  — aria attorno al marchio pari almeno all'altezza della G
  Sì  — sotto i 32 px usa la variante ad accento pieno
  No  — non scambiare i glifi tra i siti
  No  — non colorare il monogramma con l'accento: GB resta bianco o nero
  No  — non ruotare, allungare o mettere ombre sul tile
