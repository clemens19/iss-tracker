# ISS-Tracker

Zeigt die Internationale Raumstation live auf einer Karte: Position, Höhe,
Geschwindigkeit, Sonnenlicht oder Erdschatten sowie die aktuelle Besatzung.

Umsetzung nach [`ai_docs/PRD.md`](ai_docs/PRD.md) – Next.js App Router,
Leaflet, kein eigenes Backend.

## Lokal starten

```bash
npm install
npm run dev
```

Danach <http://localhost:3000> öffnen.

## Deployment

```bash
npx vercel --prod
```

Vercel liefert HTTPS automatisch – nötig, weil die App die ISS-Position direkt
im Browser abfragt und eine HTTPS-Seite keine HTTP-Anfragen stellen darf.

## Aufbau

```
app/
  page.js                 Client-Komponente: Polling, Zustand, Oberfläche
  layout.js               Grundgerüst, Schriften, Metadaten
  globals.css             Gestaltung
  components/IssMap.js    Leaflet-Karte, Marker, Flugspur (nur im Browser)
  lib/iss.js              Konstanten, Formatierung, Flugspur-Logik
  api/astros/route.js     Proxy für die Besatzungsliste
```

## Datenquellen

| Quelle | Verwendung |
|---|---|
| `api.wheretheiss.at/v1/satellites/25544` | Position, Höhe, Geschwindigkeit, Sichtbarkeit – direkt aus dem Browser |
| `api.open-notify.org/astros.json` | Besatzungsliste, **nur über HTTP** – deshalb über `app/api/astros/route.js` weitergereicht |

Beide sind kostenlos und brauchen keinen API-Key.

## Hinweise

- Die Position wird alle 5 Sekunden neu abgefragt. Ist die API nicht
  erreichbar, bleibt die Anzeige stehen, weist darauf hin und erholt sich von
  selbst, sobald wieder geantwortet wird.
- Beim Überqueren der Datumsgrenze springt die geografische Länge der API von
  179,9 auf −179,9. `unwrapLongitude` rechnet den Wert in ein stetiges
  Bezugssystem um, sonst würde die Karte eine ganze Welt weiterwandern.
- Open Notify liefert zeitweise veraltete oder gar keine Daten; die Antwort
  wird deshalb fünf Minuten zwischengespeichert.
