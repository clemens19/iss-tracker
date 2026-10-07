---
name: iss-feature-gate
description: Prüfraster für jede Änderung an der ISS-Tracker-App — welche Anforderungen ein neues Feature einhalten muss und welche Prüfungen vor dem Einbau bestanden sein müssen. Diesen Skill bei jeder Arbeit an der ISS-App verwenden: neue Anzeigen, neue Datenquellen, Änderungen an Karte, Polling, Layout oder Fehlerbehandlung, ebenso bei Fehlersuche und vor jedem Deployment. Auch dann, wenn nicht ausdrücklich nach „Anforderungen" oder „Tests" gefragt wird, und auch bei kleinen Änderungen — gerade die teuren Fehler dieser App stecken in Änderungen, die harmlos aussehen.
---

# Feature-Gate für die ISS-App

Die App hängt an einer einzigen externen Datenquelle und einer Karte. Die
Fehler, die hier wirklich Zeit kosten, sind fast nie Syntaxfehler. Es sind
Fälle, die im Normalbetrieb unsichtbar bleiben: ein Sprung an der
Datumsgrenze, der erst nach ~92 Minuten auftritt; eine HTTP-Quelle, die erst
nach dem Deployment blockiert wird; eine Zeitüberschreitung, die nur
gelegentlich zuschlägt.

Ein Feature ist deshalb nicht fertig, wenn es funktioniert — sondern wenn es
diese Fälle überstanden hat. Der Aufwand dafür ist gering: der Browserlauf
unten dauert zwei Minuten und hat schon einmal einen Fehler gefunden, der
sonst erst beim Nutzer aufgefallen wäre.

## Phase 1 — Anforderungen klären, vor der ersten Zeile Code

Lies `ai_docs/PRD.md` (die harten Vorgaben) und
`references/anforderungen.md` (der vollständige Katalog mit Begründungen).
Gehe dann die Fragen durch, die auf das Feature zutreffen:

**Kommt eine neue Datenquelle dazu?**
Dann zuerst die Erreichbarkeit prüfen, *bevor* irgendetwas entworfen wird:
`curl -sI <url-mit-https>`. Antwortet HTTPS nicht, braucht die Quelle einen
Route Handler nach dem Vorbild von `app/api/astros/route.js` (A1–A3). Das
ändert den Zuschnitt des Features — deshalb vorher, nicht hinterher.

**Werden Koordinaten angefasst, an Leaflet gegeben oder in die Karte
hineingerechnet?**
Dann ist Abschnitt 1 in `references/fallstricke.md` Pflichtlektüre. Das ist
die teuerste Fehlerquelle der App.

**Entsteht neuer Zustand, der sich regelmäßig aktualisiert?**
Dann gelten C1–C4. Siehe auch Abschnitt 5 der Fallstricke.

**Wird etwas Bedienbares hinzugefügt?**
Dann F1–F4.

Notiere die betroffenen Kürzel. Sie kommen in den Bericht am Ende und sind die
Grundlage für die Auswahl der Prüfungen — nicht jede Prüfung ist für jedes
Feature sinnvoll.

## Phase 2 — Bauen

Während des Schreibens gelten die Anforderungen aus Phase 1. Drei davon werden
besonders leicht übersehen, weil der Code trotzdem läuft:

- **C4 Aufräumen.** Jede Ressource, die ein Effekt anlegt, muss er beim
  Unmount wieder freigeben. React ruft Effekte im Entwicklungsmodus doppelt
  auf — fehlt das Aufräumen, entstehen zwei Karten oder zwei Polling-Schleifen.
- **D2 Anzeige und Karte trennen.** Die Entfaltung der Länge gilt nur für die
  Karte. In der Anzeige steht der echte Wert der API.
- **D4 Spezifität.** Eigene Styles für Leaflet-Elemente brauchen mindestens
  `.leaflet-container …`, sonst gewinnt Leaflets eigenes Stylesheet.

## Phase 3 — Testgate

**Nichts einbauen, solange hier etwas rot ist.** Die Reihenfolge:

**1. Build**
```bash
npm run build
```
Muss ohne Fehler durchlaufen. Neue Warnungen sind ein Signal, kein Rauschen.

**2. Browserlauf** — dafür muss der Dev-Server laufen (`npm run dev`):
```bash
npm install -D playwright-core          # nur beim ersten Mal
node .claude/skills/iss-feature-gate/scripts/check.mjs
```
Das Skript steuert das installierte Edge und prüft in einem Durchlauf:
Konsolenfehler, Mixed Content, Karte und Kacheln, gefüllte Messwerte,
Aktualisierung binnen 12 s, Kartenbindung, Fehlerhinweis, Erholung nach dem
Fehler und die schmale Ansicht. Jede fehlgeschlagene Prüfung legt einen
Screenshot daneben.

**3. Datumsgrenze** — Pflicht, sobald Koordinaten, die Karte oder die
Flugspur berührt werden:
```bash
node .claude/skills/iss-feature-gate/scripts/check.mjs \
     --extra .claude/skills/iss-feature-gate/scripts/check-datumsgrenze.mjs
```
Sie speist eine synthetische Bahn über die 180°-Linie und prüft Marker-Mitte,
Anzeigewert und Spurverlauf.

**4. Eigene Prüfungen für das Feature.**
Was das Feature neu verspricht, gehört als Prüfung festgehalten — sonst
bricht es beim nächsten Umbau unbemerkt. Eine Zusatzdatei exportiert
`export const checks = [{ name, run }]` und wird mit `--extra` übergeben;
`run(page, ctx)` gibt eine Detailzeile zurück oder wirft. Dauerhafte Prüfungen
gehören nach `checks/` im Projektstamm, nicht in den Skill.

Vorlagen für typische Fälle: Werte gegen die API gegenrechnen, Element auf
Vorhandensein und Inhalt prüfen, Verhalten bei fehlender Antwort.

**5. Was nur ein Mensch beurteilen kann** — kurz selbst ansehen, nicht
behaupten:
- Ist die neue Anzeige bei 390 px Breite noch lesbar?
- Bleibt die Oberfläche ruhig, wenn Werte sich alle 5 s ändern (springt das
  Layout)?
- Ist der Zustand „noch kein Wert" definiert und sieht er nicht nach Fehler aus?
- Sind neue bedienbare Elemente per Tabulator erreichbar, mit sichtbarem Fokus?

## Phase 4 — Deployment

Nach `npx vercel --prod` gegen die echte URL prüfen — die Bedingungen
unterscheiden sich von lokal (echtes HTTPS, CDN, Produktions-Bundle):

```bash
node .claude/skills/iss-feature-gate/scripts/check.mjs --url https://<live-url>
```

Zusätzlich von Hand: die URL in einem Inkognito-Fenster öffnen, 10 Sekunden
beobachten und die Konsole ansehen. Das sind die Abnahmekriterien aus PRD §8.

## Bericht

Am Ende kurz und prüfbar zusammenfassen — nicht „läuft", sondern was geprüft
wurde:

```
## Anforderungen für <Feature>
Berührt:    B2, C1, C4, D1  (references/anforderungen.md)
Geprüft:    A1 — Quelle liefert HTTPS (curl → 200)

## Testgate
Build            ✔ ohne Fehler
Browserlauf      ✔ 9/9
Datumsgrenze     ✔ Marker 0 px von der Mitte, Anzeige „176,00° W"
Eigene Prüfung   ✔ <was sie prüft>

## Offen
<was nicht geprüft werden konnte, und warum>

## Ergebnis
Eingebaut / Nicht eingebaut — <Begründung>
```

Ein Feature, das eine Prüfung nicht besteht, wird **nicht** eingebaut. Statt
die Prüfung abzuschwächen, den Code reparieren — oder offen sagen, dass es
nicht geht. Eine grüne Prüfung, die nichts mehr prüft, ist schlimmer als eine
rote.

## Nachschlagen

- `references/anforderungen.md` — der vollständige Anforderungskatalog, nach
  Bereichen geordnet, jede Anforderung mit Begründung
- `references/fallstricke.md` — die konkreten Fehler, die diese App schon
  hatte, mit Fundstellen im Code
