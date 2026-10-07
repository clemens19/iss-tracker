# Bekannte Fallstricke dieser App

Diese Liste ist keine Sammlung hypothetischer Risiken. Jeder Eintrag hat beim
Bauen der ersten Version tatsächlich Zeit gekostet oder wäre erst spät
aufgefallen. Vor dem Einbau eines Features kurz durchgehen, ob einer davon
berührt wird.

---

## 1 · Die Datumsgrenze — der teuerste Fehler bisher

**Was passiert:** Die API liefert die geografische Länge in `[-180, 180)`.
Überquert die ISS die 180°-Linie, springt der Wert von 179,9 auf −179,9 —
ein Sprung um die halbe Welt, obwohl die Station sich kaum bewegt hat.

**Warum es schwer zu finden ist:** Der Fehler tritt alle ~92 Minuten einmal
auf. Im kurzen Test sieht alles korrekt aus. Fällt er auf, ist er längst
ausgeliefert.

**Was schiefgeht:** Die Karte wandert eine ganze Welt weiter und zeigt eine
beliebige andere Region; die ISS verschwindet vom Bild.

**Lösung:** `unwrapLongitude(longitude, reference)` in `app/lib/iss.js`
rechnet den Wert über den kürzesten Weg in die Nähe des Bezugswerts um. Das
Bezugssystem hält `frameLngRef` in `app/page.js`; der entfaltete Wert geht als
`displayLng` an die Karte, während `longitude` der echte Wert bleibt.

**Wichtig zur Reihenfolge:** Leaflets Option `worldCopyJump` hilft hier
**nicht**. Sie greift ausschließlich beim Ziehen und beim Panning per
Tastatur (nachzulesen in `node_modules/leaflet/dist/leaflet-src.js` bei
`_onPreDragWrap` und `_onKeyPan`). `map.panTo(…)` ist davon unberührt und
mittelt den Sprung nicht aus. Deshalb ist die Option in
`app/components/IssMap.js` bewusst ausgeschaltet — sie würde nur den
Mittelpunkt stillschweigend versetzen und Marker und Spur auseinanderziehen.

**Prüfen:** `scripts/check-datumsgrenze.mjs` speist eine synthetische Bahn
über die 180°-Linie und prüft Marker-Mitte, Anzeigewert und Spurverlauf.

---

## 2 · Leaflets CSS gewinnt gegen eigene Styles

**Was passiert:** Eigene Regeln für `.leaflet-bar a` bleiben wirkungslos, die
Zoom-Schaltflächen bleiben weiß.

**Warum:** `leaflet/dist/leaflet.css` wird nach `globals.css` geladen. Bei
gleicher Spezifität entscheidet die Reihenfolge im Stylesheet — Leaflet liegt
hinten.

**Lösung:** Spezifität erhöhen statt `!important` streuen:
`.leaflet-container .leaflet-bar a`. Siehe `app/globals.css`, Abschnitt
„Leaflet an die dunkle Oberfläche anpassen".

---

## 3 · Marker-Icons brechen unter Bundlern

**Was passiert:** Der ISS-Marker fehlt, ohne Fehlermeldung.

**Warum:** Leaflets Standard-Icon verweist auf `marker-icon.png` über einen
zur Laufzeit berechneten Pfad. Nach dem Bündeln zeigt er ins Leere.

**Lösung:** `L.divIcon` mit eigenem HTML (`app/components/IssMap.js`). Umgeht
das Problem und lässt sich frei gestalten — hier ein goldener Punkt mit Halo.

---

## 4 · Der doppelte Aufbau im Entwicklungsmodus

**Was passiert:** „Map container is already initialized", oder zwei Polling-
Schleifen mit doppelter Anfragerate.

**Warum:** React ruft Effekte im Entwicklungsmodus absichtlich zweimal auf,
um fehlendes Aufräumen sichtbar zu machen.

**Lösung:** Die Karte im Cleanup mit `map.remove()` entfernen und die Ref
zurücksetzen. Alle Polling-Effekte setzen ein `cancelled`-Flag und löschen
ihren Timer. Vorbild: beide Effekte in `app/page.js`.

---

## 5 · `setInterval` für Polling

**Was passiert:** Bei langsamer API überlappen sich die Anfragen, die Anzeige
springt zwischen Werten hin und her, und die Rate steigt unbemerkt.

**Lösung:** `setTimeout` am Ende jedes Durchlaufs neu setzen — so beginnt die
nächste Abfrage erst, wenn die vorige abgeschlossen ist. Siehe die
`poll`-Funktion in `app/page.js`.

---

## 6 · `smoothFactor` verfälscht Messungen an der Flugspur

**Was passiert:** Eine Polylinie mit neun Stützpunkten erscheint im DOM mit
zwei. Wer die Punktzahl als Prüfkriterium nimmt, misst etwas anderes als
gedacht.

**Warum:** Leaflet vereinfacht Polylinien (`smoothFactor`, Standard 1,0) und
entfernt Stützpunkte, die unter einem Pixel Abstand liegen. Bei geraden oder
dicht beieinanderliegenden Punkten bleibt nur der Anfang und das Ende übrig.

**Konsequenz:** Nicht die Zahl der Stützpunkte prüfen, sondern die
*Eigenschaft*, die zählt — die größte Lücke zwischen zwei Stützpunkten
(`scripts/check-datumsgrenze.mjs`). Und für Prüfungen eine Bahn verwenden,
die tatsächlich gekrümmt ist: eine geradlinige synthetische Bahn fällt der
Vereinfachung sofort zum Opfer.

---

## 7 · Einzelne Punkte zeichnen keine Linie

**Was passiert:** Nach der Datumsgrenze entsteht kurzzeitig ein Abschnitt mit
genau einem Punkt. Leaflet legt dafür ein Pfadelement an, das nie sichtbar
wird.

**Konsequenz:** Beim Aufteilen von Spuren Abschnitte mit weniger als zwei
Punkten überspringen. (Seit der Entfaltung aus Punkt 1 gibt es nur noch eine
einzige, durchgehende Spur — die Regel bleibt aber für jede neue Linie
gültig.)

---

## 8 · Öffentliche Gratis-APIs sind unzuverlässig

**Was passiert:** `api.open-notify.org` lief während der Tests mehrfach in
den Timeout (HTTP 503 nach 8 s) — teils mehrmals hintereinander.

**Lösung:** Zeitgrenze (`AbortSignal.timeout`), Zwischenspeicher
(`next: { revalidate }` plus `Cache-Control` mit `stale-while-revalidate`)
und ein Fehlerzweig, der die betroffene Anzeige leer lässt, ohne den Rest der
App zu stören. Vorbild: `app/api/astros/route.js`.

**Nebenbei:** Open Notify liefert zusätzlich Besatzungen der chinesischen
Station Tiangong. Für eine ISS-Liste muss auf `craft === "ISS"` gefiltert
werden — die mitgelieferte Zahl `number` ist sonst zu hoch.

---

## 9 · Kartenkacheln brauchen HTTPS

OpenStreetMap wird über `https://tile.openstreetmap.org/{z}/{x}/{y}.png`
geladen. Die früher übliche Variante mit `{s}.tile.openstreetmap.org` funktioniert
zwar noch, ist aber nicht mehr empfohlen. Ein Wechsel auf einen anderen
Anbieter muss HTTPS liefern und die Attribution mitbringen.
