# Spec: Hell- und Dunkelmodus

Status: eingebaut und geprüft (17/17). Erstellt nach dem Raster aus
`.claude/skills/iss-feature-gate` (Phase 1). Maßstab bleibt `ai_docs/PRD.md`.
Die Abweichungen beim Einbau stehen in §10.

## 1. Ziel

Die Oberfläche soll zwischen hellem und dunklem Erscheinungsbild umschaltbar
sein. Die Wahl soll ein Neuladen überleben. Ohne getroffene Wahl folgt die App
der Systemeinstellung.

## 2. Umfang

**Enthalten**
- Umschalter in der Kopfzeile mit drei Zuständen: System, Hell, Dunkel
- Zwei vollständige Gestaltungssätze, umschaltbar über ein Attribut an `<html>`
- Die Wahl liegt im Browser (`localStorage`) und überlebt das Neuladen
- Die App startet im richtigen Erscheinungsbild, ohne aufzublitzen

**Nicht enthalten**
- Kartenkacheln. Die OSM-Kacheln bleiben in beiden Modi dieselben (siehe §4)
- Ein eigener Modus je Seite — die App hat nur eine
- Weiche Übergänge beim Umschalten (siehe §7, F2)
- Speicherung auf einem Server. Die Wahl ist nichts, was übertragen werden muss

## 3. Anforderungsbezug

Aus `references/anforderungen.md`:

| Kürzel | Warum berührt |
|---|---|
| B2 | Der Umschalter ist Bedienoberfläche und lebt in einer Client-Komponente |
| E1–E4 | Beide Gestaltungssätze müssen dieselben Regeln erfüllen: deutsche Formatierung, feste Zeichenbreite, definierter Leerzustand |
| F1 | Der Fokusring ist heute `--solar`. Auf hellem Grund reicht der Kontrast nicht |
| F2 | Das Umschalten darf keine Bewegung erzeugen |
| F3 | Der Umschalter braucht einen Namen, der seinen Zustand benennt |
| F4 | Die Zustände „Sonnenlicht" / „Erdschatten" unterscheiden sich nur in der Farbe — in beiden Modi muss zusätzlich der Text tragen |
| D4 | Die Leaflet-Regeln nutzen teils `!important` und feste Farbwerte; sie müssen auf Variablen umgestellt werden |
| D5 | Die OSM-Attribution liegt auf den Kacheln und muss in beiden Modi lesbar bleiben |

**Nicht berührt:** A1–A5 (keine neue Quelle), D1/D2 (keine Koordinaten), C1–C3
(kein neues Polling), D6.

### Neu, im Katalog noch nicht erfasst

**N1 · Das Thema steht vor dem ersten Anstrich.**
Setzt man das Attribut erst in einem `useEffect`, sieht man bei jedem Neuladen
kurz die dunkle Oberfläche — bei heller Wahl ein sichtbares Aufblitzen. Das
Attribut muss aus einem Skript kommen, das vor dem Rendern läuft.

**N2 · Drei Zustände, nicht zwei.**
Ein reiner Zwei-Zustands-Schalter kennt kein „folgt dem System" und kann die
Entscheidung „noch nichts gewählt" nicht ausdrücken. Wer den Systemwechsel
später mitbekommen will, kommt nicht zurück.

**N3 · `localStorage` kann werfen.**
Im privaten Fenster oder bei blockierten Website-Daten wirft der Zugriff. Das
darf die App nicht anhalten — sie zeichnet dann eben im Systemmodus.

**N4 · `color-scheme` muss mitwandern.**
Ohne `color-scheme` bleiben die nativen Bedienelemente (Kontrollkästchen,
Bildlaufleisten, Auswahlliste) im hellen Modus hell auf hellem Grund.

## 4. Entscheidung zu den Kartenkacheln

Die dunkle Fassung lebt von einem Kontrast: nahezu schwarze Fläche, darin die
hellen OSM-Kacheln als Fenster zur Erde. Im hellen Modus fällt dieser Kontrast
weg — die Karte wird zu einer Fläche unter anderen.

**Entscheidung: Die Kacheln bleiben in beiden Modi dieselben.**

Begründung: Ein dunkler Kachelanbieter wäre eine neue externe Quelle und damit
A1 (HTTPS-Nachweis), A3 (Zwischenspeicher, Zeitgrenze) und D5 (zusätzliche
Attribution) unterworfen. Er bringt eine neue Ausfallmöglichkeit in eine App,
die bisher genau eine hatte. Der Gewinn wäre Gestaltung, nicht Funktion.

**Folge, die bewusst hingenommen wird:** Im hellen Modus verliert die Karte
ihre Rolle als Blickfang. Das ist in Ordnung, solange die Zahlen weiterhin
lesbar führen. Ein dunkler Kachelsatz bleibt als spätere Option notiert (§9).

## 5. Verhalten

| Ausgangslage | Ergebnis |
|---|---|
| Nichts gespeichert, System dunkel | dunkel |
| Nichts gespeichert, System hell | hell |
| „Dunkel" gespeichert, System hell | dunkel |
| „Hell" gespeichert, System dunkel | hell |
| Nutzer wählt „System" | gespeicherter Wert wird gelöscht, es gilt wieder das System |

Der gespeicherte Wert ist `"light"` oder `"dark"`. Ein fehlender Eintrag
bedeutet System — „System" wird nicht eigens gespeichert, damit es nur eine
Darstellung für denselben Zustand gibt.

Schlüssel: `iss-theme`.

## 6. Umsetzung

### Betroffene Dateien

| Datei | Änderung |
|---|---|
| `app/layout.js` | Skript vor dem Rendern, `suppressHydrationWarning` an `<html>`, `themeColor` als Paar |
| `app/globals.css` | Feste Farbwerte zu Variablen, zweiter Satz unter `[data-theme="light"]` |
| `app/components/ColorScheme.js` | neu: der Umschalter |
| `app/lib/iss.js` | `THEME_KEY`, `readTheme`, `applyTheme` |

Kein Route Handler, keine neue Abhängigkeit.

### Das Skript vor dem Rendern

Klein und ohne Importe, als `beforeInteractive`-Skript in `app/layout.js`
(vgl. `node_modules/next/dist/docs/01-app/03-api-reference/02-components/script.md`):
gespeicherten Wert lesen, sonst `matchMedia("(prefers-color-scheme: dark)")`
fragen, Ergebnis als `data-theme` an `document.documentElement` setzen. Ein
`try`/`catch` um den Speicherzugriff (N3).

`<html>` braucht `suppressHydrationWarning`: Das Skript verändert das Element
vor der Hydration, React würde sonst über die Abweichung klagen. Das ist der
dafür vorgesehene Weg, kein Trick.

### Die Gestaltungssätze

`globals.css` behält `:root` als dunklen Satz — der bisherige Stand bleibt
unverändert gültig. Der helle Satz kommt als einzelner Block:

```css
[data-theme="light"] { … }
```

Keine `@media (prefers-color-scheme: …)`-Verzweigung im Stylesheet: Das Skript
setzt das Attribut immer, es gibt also nur zwei Fälle statt drei. Ohne
JavaScript bliebe es beim dunklen Satz — vertretbar, weil die App ohnehin ohne
JavaScript nichts anzeigt.

Zusätzlich `color-scheme: dark` bzw. `light` im jeweiligen Satz (N4).

### Feste Farbwerte auflösen

Diese Stellen tragen Farben hart im Code und müssen zu Variablen werden, sonst
bleiben sie im hellen Modus dunkel:

- `.map-frame`, `.leaflet-container` — `#0a101b`
- `.leaflet-control-attribution` — `rgba(14, 20, 32, 0.78)`, zweimal `!important`
- `.iss-marker__dot` — `rgba(14, 20, 32, 0.9)`
- `.status--offline` — `rgba(228, 103, 79, 0.4)`
- `.notice` — `rgba(228, 103, 79, 0.35)` und `0.1`
- `.condition--sunlit` / `--eclipsed` — `rgba(232, 163, 61, 0.16)`, `rgba(110, 147, 214, 0.16)`
- `app/page.js:142` — `fill="#e8a33d"` im Logo

Für die durchscheinenden Werte eigene Variablen einführen (etwa `--solar-soft`,
`--alert-ring`, `--map-void`, `--marker-ring`), statt Alpha-Werte zu streuen.

### Der Umschalter

Ein `<select>` mit sichtbarer Beschriftung „Darstellung" und drei Optionen.
Ein Auswahlfeld statt eines Schalters, weil alle drei Zustände erreichbar
bleiben müssen (N2) und es Tastatur- und Screenreader-Verhalten mitbringt,
statt es nachzubauen. Ein durchklickender Knopf wäre kleiner, aber „zurück zum
System" wäre darin nicht mehr auffindbar.

Platz: Kopfzeile rechts, neben der Statusanzeige, im Stil der Statuspille.
Die Kopfzeile ist bei 390 px bereits knapp besetzt — **wenn T9 dort scheitert,
wandert der Umschalter in den ersten Block des Panels**, über „Karte folgt der
ISS". Das ist der Rückfallweg, nicht die erste Wahl.

### `themeColor`

Heute ein fester Wert (`app/layout.js:24`). Künftig das Paar aus der
Dokumentation:

```js
export const viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "<hell>" },
    { media: "(prefers-color-scheme: dark)", color: "<dunkel>" },
  ],
};
```

Das deckt den Systemfall ab. Bei ausdrücklicher Wahl weicht die Farbe der
Browserleiste ab — hinnehmbar, und mit wenigen Zeilen im Umschalter
nachziehbar. Kein Kriterium, an dem der Einbau scheitert.

## 7. Farben

Anforderungen, nicht Wunschwerte: Text mindestens **4,5:1**, Flächen und
Ränder mindestens **3:1** gegen ihren Untergrund — in beiden Sätzen.

Zwei Werte des dunklen Satzes erfüllen das auf hellem Grund **nicht** und
brauchen im hellen Satz einen Ersatz:

| Variable | dunkel | auf Weiß | hell (Vorschlag) |
|---|---|---|---|
| `--solar` | `#e8a33d` | ~2,2:1 | `#9a6410` (~5,0:1) |
| `--eclipsed` | `#6e93d6` | ~3,1:1 | `#35589e` |

Die Zahlen sind überschlägig gerechnet. **Maßgeblich ist die Messung** in H5/H6,
nicht diese Tabelle.

Der helle Grund sollte nicht reinweiß sein: Die OSM-Kacheln sind ein warmes
Weiß, die Oberfläche würde darin verschwimmen. Ein leicht abgesetzter Ton plus
eine feine Linie um den Kartenrahmen hält die Karte als eigene Fläche erkennbar.

## 8. Prüfungen vor dem Einbau

Neu als `checks/farbschema.mjs` im Projektstamm, aufgerufen mit `--extra`:

| Nr. | Prüft | Wie |
|---|---|---|
| H1 | Umschalten wirkt | Auswahl ändern, `data-theme` **und** die berechnete Hintergrundfarbe von `body` müssen sich ändern — nicht nur das Attribut |
| H2 | Kein Aufblitzen | `addInitScript` legt einen `MutationObserver` auf `<html>` und schreibt jede Änderung von `data-theme` mit. Der **erste** beobachtete Wert muss bereits der richtige sein (N1) |
| H3 | Auswahl überlebt | hell wählen, neu laden, immer noch hell |
| H4 | System wird befolgt | ohne gespeicherte Wahl `emulateMedia({ colorScheme: "light" })` → hell |
| H5 | Kontrast der Messwerte | Rechenwert für `.readouts dd`, `dt` und `.panel__foot` gegen ihren Untergrund, ≥ 4,5:1 in beiden Modi |
| H6 | Attribution lesbar | dito für `.leaflet-control-attribution` (D5) |
| H7 | Keine Fehler beim Umschalten | Konsole und `pageerror` leer, keine Hydration-Warnung |

Dazu: **T1–T9 müssen in beiden Modi grün sein.** Dafür `check.mjs` um eine
Möglichkeit erweitern, das Thema vor dem Laden zu setzen (etwa `--theme light`,
das über `addInitScript` den Speicherwert vorbelegt). Ohne das prüft der
Standardlauf weiterhin nur den dunklen Satz.

Von Hand (Phase 3, Punkt 5):
- Kopfzeile bei 390 px in beiden Modi — passt der Umschalter noch?
- Bleibt die Oberfläche beim Umschalten ruhig, ohne Umspringen des Layouts?
- Karte und Panel im hellen Modus: Wirkt die Karte noch als eigener Bereich?
- Sind Sonnenlicht und Erdschatten weiterhin am Text unterscheidbar, nicht nur
  an der Punktfarbe (F4)?

## 9. Offen

- **Dunkle Kacheln.** Verworfen (§4), aber notiert: `dark_matter`-Kacheln
  wären über HTTPS verfügbar. Wiedervorlage nur, wenn der helle Modus steht und
  die Karte darin tatsächlich zu schwach wirkt.
- **`themeColor` bei ausdrücklicher Wahl.** Nachziehen im Umschalter, geringe
  Priorität.
- **Platz des Umschalters.** Entscheidet sich an T9 bei 390 px, nicht am
  Schreibtisch.
- Der helle Satz ist hier als Anforderung beschrieben, nicht als Palette
  ausformuliert. Die konkreten Werte entstehen beim Bauen und werden von H5/H6
  gemessen.

## 10. Nachtrag nach dem Einbau

Sechs Stellen wichen von dieser Spec ab oder kamen hinzu. Alle sechs kamen aus
dem Prüflauf, nicht aus dem Nachdenken. Die sechste gehört nicht zum Thema,
sondern fiel beim Prüfen hindurch auf.

**1 · `:root[data-theme="light"]` statt `[data-theme="light"]`.**
Beide Selektoren haben dieselbe Spezifität wie `:root`. Es entschiede die
Reihenfolge im Stylesheet — zu fragil für eine Regel, die das halbe
Erscheinungsbild trägt.

**2 · `.leaflet-container` brauchte Spezifität (D4).**
§6 nannte den festen Wert `#0a101b`, aber nicht den Grund, warum er nicht
greift: Leaflets eigenes Stylesheet setzt `.leaflet-container` auf `#ddd` und
wird nach `globals.css` geladen. Die Variable war richtig, die Regel wirkungslos
— die Kartenfläche blieb in beiden Sätzen hellgrau. Erst
`.map-frame .leaflet-container` gewinnt. Der Fallstrick stand die ganze Zeit in
`references/fallstricke.md`, Abschnitt 2.

**3 · `--ink-faint` im dunklen Satz war zu dunkel.**
`#5c6a81` erreichte auf dem Panel nur **3,1:1**. Betroffen waren die Fußzeile,
`Wird geladen …` und der Hinweis zur Besatzung — seit der ersten Version, ohne
aufzufallen. Jetzt `#7c8aa3` (4,8:1). Das ist ein Fund außerhalb des
Feature-Umfangs, aber derselbe Satz Farben, also hier mitbehoben.

**4 · Das Skript hieß `id="theme"` — wie das Auswahlfeld.**
Zwei Elemente mit derselben ID sind ein HTML-Fehler, und `#theme` traf fortan
das `<script>` im `<head>`, das keine sichtbare Fläche hat. Das Skript heißt
jetzt `theme-init`; H8 prüft das dauerhaft.

**5 · React meldet das Inline-Skript.**
`next/script` mit `beforeInteractive` und Inline-Inhalt erzeugt in der Konsole
eine Warnung: *„Encountered a script tag while rendering React component."*
Das Skript **läuft** trotzdem — H2 weist nach, dass das Erscheinungsbild als
erstes und einziges gesetzt wird. Die Warnung betrifft nur das erneute Rendern
auf der Client-Seite. Bleibt vorerst stehen; wer sie loswerden will, müsste das
Skript in ein `next.config`-Header oder eine eigene Route verschieben — beides
teurer als der Gewinn.

**6 · Der Prüflauf deckte eine hängende Abfrage auf (außerhalb des Umfangs).**
Beim abschließenden Durchlauf fielen T5 und T7 durch, beim nächsten T5 und
T8 — jedes Mal ein anderes Paar, was zunächst nach Flakiness der Gratis-API
aussah. War es nicht: `api.wheretheiss.at` antwortete in einem gemessenen
Lauf erst nach **27 s**. Da die nächste Abfrage erst im `finally` der
laufenden geplant wird und das `fetch` keine Zeitgrenze hatte, stand die
Anzeige 27 s still — und der Status zeigte weiter „Live“. Erst der
Netzwerk-Mitschnitt (`page.on("request")`) zeigte, dass in dieser Zeit gar
keine Anfrage lief; vorher war ununterscheidbar, ob die API alte Werte
liefert oder die Kette steht.
Behoben mit `AbortSignal.timeout(8000)` an beiden Abfragen (`app/page.js`,
`REQUEST_TIMEOUT_MS` in `app/lib/iss.js`). Gegenprobe: mit einer künstlich
um 30 s verzögerten API schickt die App jetzt alle ~13 s eine neue Abfrage
und zeigt dabei ehrlich „Keine Verbindung“ statt „Live“. Neuer Katalogpunkt
**C6**. Mit dem Thema hat das nichts zu tun — es lag seit der ersten Version
drin; H1–H8 waren in jedem Lauf grün.
