# Anforderungskatalog

Gilt für jede Änderung an der App. Die Kürzel dienen nur dem Verweisen
(„A2 verletzt"), nicht der Vollständigkeit.

Quelle der harten Vorgaben ist `ai_docs/PRD.md`; alles Weitere hat sich beim
Bauen als nötig erwiesen. Wo eine Anforderung aus dem PRD stammt, steht das
dabei — bei Konflikten gewinnt das PRD.

---

## A — Datenquelle und Übertragung

**A1 · Jede Datenquelle muss über HTTPS erreichbar sein.**
Eine HTTPS-Seite darf keine HTTP-Anfrage stellen; der Browser blockiert sie
(Mixed Content). Der Fehler taucht nur in der Konsole auf — die Seite wirkt
sonst in Ordnung, aber die Anzeige bleibt leer. Vor dem Einbau prüfen:
`curl -sI <url>` muss `200` liefern, wenn man `https://` voranstellt.

**A2 · HTTP-only-Quellen nur über einen Route Handler.**
Wenn es die Quelle nur über HTTP gibt, gehört sie hinter `app/api/<name>/route.js`,
der serverseitig holt und über HTTPS weiterreicht. Vorbild: `app/api/astros/route.js`.
Das ist die einzige zulässige Ausnahme vom Grundsatz „kein eigenes Backend" (PRD §5).

**A3 · Proxy-Routen brauchen einen Zwischenspeicher und eine Zeitgrenze.**
Öffentliche Gratis-APIs sind sporadisch langsam oder ganz weg (Open Notify lief
im Test mehrfach in den Timeout). Ohne `next: { revalidate }`, `Cache-Control`
und `AbortSignal.timeout(…)` schlägt jede Störung der Quelle auf die App durch.

**A4 · Keine API-Keys, keine Secrets im Code.**
PRD §5. Wenn eine Quelle einen Key verlangt: nicht einbauen, sondern
Rücksprache halten. Ein Key im Browser-Bundle ist öffentlich.

**A5 · Beide Antworten prüfen: Erreichbarkeit *und* Form.**
Eine erreichbare Quelle, die ein unerwartetes Feld liefert, ist der
häufigere Fall. Vor dem Rechnen validieren, nicht danach.

---

## B — Architektur und Ablage

**B1 · Quelldateien liegen in `app/`.**
PRD §5. Neue Seiten als `app/<pfad>/page.js`, neue Bausteine als
`app/components/`, Hilfsfunktionen als `app/lib/`.

**B2 · Interaktive Bausteine sind Client-Komponenten (`"use client"`).**
Der App Router rendert sonst auf dem Server, wo es kein DOM gibt.

**B3 · Bibliotheken mit DOM-Zugriff nur über `next/dynamic` mit `ssr: false`.**
Leaflet greift beim Import auf `window` zu und bricht beim Server-Rendern.
Das `dynamic(…)` muss in einer Client-Komponente stehen — in einer
Server-Komponente ist `ssr: false` nicht erlaubt. Vorbild: `app/page.js`.

**B4 · Nur Route Handler als Server-Code.**
Kein eigener Server, keine Datenbank, keine Hintergrundjobs (PRD §5).

---

## C — Laufzeitverhalten und Robustheit

**C1 · Polling als `setTimeout`-Kette, nicht als `setInterval`.**
`setInterval` startet die nächste Anfrage unabhängig davon, ob die vorige
zurückkam. Bei einer langsamen API überlappen sich die Anfragen und die
Anzeige springt zwischen alten und neuen Werten.

**C2 · Nach einem Fehler läuft das Polling weiter.**
PRD §5 verlangt ausdrücklich, dass sich die Anzeige von selbst erholt.
Der Fehlerzweig darf die Schleife nicht verlassen.

**C3 · Ein Fehler leert die Anzeige nicht.**
Der zuletzt bekannte Wert bleibt stehen, dazu ein verständlicher Hinweis
statt einer leeren Seite (PRD §4, F4). Neue Anzeigen müssen sich genauso
verhalten: Platzhalter „—" nur, solange noch nie ein Wert ankam.

**C4 · Beim Unmount wird aufgeräumt.**
Timer löschen, Karten mit `map.remove()` entfernen, Listener abmelden.
React ruft Effekte im Entwicklungsmodus doppelt auf — ohne Aufräumen
entstehen zwei Karten auf einem DOM-Knoten („Map container is already
initialized") und zwei Polling-Schleifen.

**C5 · Laufzeit der neuen Abfrage im Verhältnis zum Takt prüfen.**
Braucht eine neue Quelle länger als der Abfragetakt, überlappen sich die
Anfragen trotz C1. Dann den Takt anheben oder die Quelle zwischenspeichern.

**C6 · Jede Abfrage braucht eine Zeitgrenze — auch die im Browser.**
Ohne `AbortSignal.timeout(…)` gilt C1 nur halb: Eine Abfrage, die nie
zurückkommt, blockiert die Kette dauerhaft, weil der `finally`-Zweig die
nächste erst nach ihr plant. Der Status bleibt dabei auf „Live“ stehen — die
App behauptet, alles sei in Ordnung, während die Anzeige steht. Das ist
schlimmer als ein Fehler, weil es niemandem auffällt.
Gemessen: `api.wheretheiss.at` antwortet meist in unter einer Sekunde,
brauchte in einem Lauf aber **27 s** — die Anzeige stand so lange still.
Die Zeitgrenze macht aus der Blockade einen Fehler, den C2 und C3 auffangen.
A3 verlangt dasselbe für Route Handler; für die Abfrage direkt aus dem
Browser galt es bisher nicht.

**C7 · Der Takt wird ab dem Start gemessen, nicht ab dem Ende.**
C6 allein genügt nicht. Wird die nächste Abfrage im `finally` um den vollen
Takt verschoben, verlängert jede zähe Antwort die Kette um ihre eigene Dauer:
Eine Abfrage, die in die Zeitgrenze läuft, kostet 8 s Abbruch **plus** 5 s
Takt — gemessen **13 s** zwischen zwei Versuchen statt 5 s. Die Anzeige steht
dann still, obwohl die Verbindung in Ordnung ist.
Richtig ist `Math.max(0, TAKT − (jetzt − Start))`: Bei flotter Antwort bleibt
der Takt bei 5 s, nach einem Abbruch startet der nächste Versuch sofort.
Überlappen können sich die Anfragen dabei nicht — die nächste wird weiterhin
erst geplant, wenn die laufende zurück ist (C1).
Gegenprobe mit einer künstlich um 30 s verzögerten API: vorher 13 s,
nachher 8,0 s zwischen zwei Versuchen; der Status zeigt dabei durchgehend
ehrlich „Keine Verbindung“.
**Warum das auffiel:** T5 („Anzeige aktualisiert sich binnen 12 s“) wurde
rot, sobald die API ein einziges Mal hängen blieb — 13 s > 12 s. Eine Prüfung,
die bei jedem Ausrutscher der Gratis-API umfällt, verliert ihren Wert.

---

## D — Karte und Geografie

**D1 · Geografische Längen vor dem Zeichnen entfalten.**
Siehe `references/fallstricke.md`, Abschnitt 1. Betrifft alles, was
Koordinaten an Leaflet weitergibt oder in die Karte hineinrechnet.

**D2 · Die angezeigte Länge bleibt der echte Wert der API.**
Die Entfaltung gilt nur für die Karte. In der Anzeige darf nie „184,00° O"
stehen — dort gehört der Wert aus der Antwort hin.

**D3 · Marker als `L.divIcon`, nicht als Standard-Icon.**
Leaflets PNG-Icons verweisen auf relative Pfade, die unter Bundlern brechen;
das Icon fehlt dann stillschweigend.

**D4 · Eigene Leaflet-Styles brauchen höhere Spezifität als Leaflets CSS.**
`leaflet/dist/leaflet.css` wird nach `globals.css` geladen und gewinnt bei
gleicher Spezifität. Mindestens `.leaflet-container .leaflet-bar a` schreiben.

**D5 · Die OpenStreetMap-Attribution bleibt sichtbar.**
Lizenzpflicht. Umstylen ist in Ordnung, ausblenden nicht.

**D6 · Neue Ebenen werden beim Neuzeichnen entfernt.**
Werden Polylinien oder Marker bei jeder Aktualisierung neu angelegt, müssen
die alten vorher von der Karte (`map.removeLayer`), sonst wachsen sie an.

---

## E — Darstellung und Text

**E1 · Werte deutsch formatieren.**
`Intl.NumberFormat("de-DE")` — Komma als Dezimaltrennzeichen, Punkt als
Tausendertrennzeichen („27.581 km/h"). Einheiten ausgeschrieben: km, km/h.

**E2 · Live wechselnde Zahlen in einer Schrift mit fester Zeichenbreite.**
Sonst springt das Layout bei jeder Aktualisierung. Im Projekt ist das
`--font-mono` (IBM Plex Mono), Vorbild `.readout dd`.

**E3 · Oberflächentexte auf Deutsch, sachlich, ohne Füllwörter.**
Fehlermeldungen sagen, was los ist und was passiert — nicht „Ups!" und
nicht „Ein Fehler ist aufgetreten". Vorbild in `app/page.js`: „Die
Positionsdaten sind gerade nicht erreichbar. Die App fragt weiter ab — unten
stehen die zuletzt bekannten Werte."

**E4 · Kein abgeschnittener Inhalt bei fehlenden Daten.**
Jedes neue Feld braucht einen definierten Zustand für „noch kein Wert".

---

## F — Zugänglichkeit

**F1 · Sichtbarer Tastaturfokus.** Die Regel in `globals.css` deckt `a`,
`button`, `input`, `summary` und `[tabindex]` ab — neue bedienbare Elemente
ergänzen.

**F2 · `prefers-reduced-motion` beachten.** Bewegung nur, wenn sie etwas
zeigt (Live-Puls, ISS-Marker), und abschaltbar.

**F3 · Statusänderungen für Screenreader ankündigen.** `role="status"` für
Meldungen, die ohne Nutzeraktion erscheinen — etwa den Verbindungshinweis.

**F4 · Farbe nie als einziges Unterscheidungsmerkmal.** Sonnenlicht und
Erdschatten unterscheiden sich derzeit nur in der Farbe des Punktes; kommt
ein dritter Zustand dazu, braucht es Text oder Form.

---

## G — Was ausgeschlossen ist

- API-Keys oder Secrets im Code (PRD §5)
- Server-seitiges Rendern der Karte (PRD §5)
- Ressourcen über HTTP (PRD §5)
- Ein eigenes Backend außer Route Handlers (PRD §5)
- Zusätzliche Laufzeit-Abhängigkeiten ohne klaren Nutzen — jede neue
  Bibliothek muss durch die HTTPS-Regel, die Bundle-Größe und die
  Wartbarkeit gerechtfertigt sein

---

## H — Erscheinungsbild, Einstellungen, erster Anstrich

Die N-Nummern entsprechen der Spec unter `ai_docs/SPEC-farbschema.md`. Sie
gelten für alles, was eine Nutzereinstellung einführt oder den ersten Anstrich
berührt.

**N1 · Der erste Anstrich steht vor dem ersten Bild.**
Ein `useEffect` ist zu spät: React führt Effekte nach dem ersten Rendern aus.
Wer „hell" gewählt hat, sieht bei jedem Neuladen kurz die dunkle Oberfläche.
Eine Einstellung, die das Aussehen bestimmt, muss aus einem Skript kommen, das
vor dem Zeichnen läuft — hier `beforeInteractive` in `app/layout.js`, mit
`suppressHydrationWarning` am `<html>`.

**N2 · Drei Zustände statt zwei.**
Eine Einstellung, die dem System folgen kann, braucht einen Weg dorthin
zurück. Ein Zwei-Zustands-Schalter kennt „noch nichts gewählt" nicht und
schneidet diesen Weg ab. Auswahlfeld statt Schalter.

**N3 · Der Speicherzugriff kann werfen.**
`localStorage` wirft im privaten Fenster und bei blockierten Website-Daten.
Jeder Zugriff gehört in ein `try`/`catch`; die App läuft ohne Einstellung
weiter, statt anzuhalten.

**N4 · `color-scheme` muss mitwandern.**
Ohne diese Angabe bleiben native Bedienelemente — Kontrollkästchen,
Bildlaufleisten, die Auswahlliste selbst — im hellen Modus hell auf hellem
Grund.

**N5 · IDs bleiben eindeutig.**
Klingt selbstverständlich, ist es nicht: Ein Skript mit `id="theme"` und ein
Auswahlfeld mit `id="theme"` sind schnell geschrieben. Ein Selektor trifft
dann das erste Element der Dokumentreihenfolge — bei einem `<script>` also
etwas ohne sichtbare Fläche, und der Fehler zeigt sich als Timeout an einer
ganz anderen Stelle.
