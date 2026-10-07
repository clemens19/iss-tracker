/**
 * Konstanten und Formatierung für die ISS-Live-Anzeige.
 *
 * Datenquelle: wheretheiss.at liefert Position, Höhe, Geschwindigkeit und
 * `visibility` über HTTPS und ohne API-Key. Die HTTP-only-Angebote von
 * Open Notify sind hier bewusst nicht im Einsatz (Mixed Content).
 */

export const ISS_API = "https://api.wheretheiss.at/v1/satellites/25544";
export const CREW_API = "/api/astros";

/** Abstand zwischen zwei Abfragen der Live-Position. */
export const POLL_MS = 5000;

/* So lange darf eine einzelne Abfrage dauern, bevor sie abgebrochen wird.
   wheretheiss.at antwortet meist in unter einer Sekunde, braucht sporadisch
   aber deutlich länger (gemessen: 27 s). Die nächste Abfrage wird erst im
   `finally` der laufenden geplant – ohne Zeitgrenze blockiert eine zähe
   Antwort also die ganze Kette, und die Anzeige steht still, obwohl die
   Verbindung in Ordnung ist. */
export const REQUEST_TIMEOUT_MS = 8000;

/** So viele Positionen zeichnet die Flugspur (bei 5 s Takt ca. 10 Minuten). */
export const MAX_TRACK_POINTS = 120;

/** Besatzungsliste ändert sich selten – seltener nachladen genügt. */
export const CREW_POLL_MS = 10 * 60 * 1000;

export const INITIAL_ZOOM = 3;

/** Ablage der Darstellungswahl im Browser. */
export const THEME_KEY = "iss-theme";

/**
 * Farbe der Browserleiste je Erscheinungsbild. Dieselben Werte wie `--space`
 * in `globals.css` – die Leiste soll denselben Ton haben wie der Seitenrand.
 */
export const THEME_COLORS = { light: "#E6E9EE", dark: "#0E1420" };

const latLngFormat = new Intl.NumberFormat("de-DE", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const wholeFormat = new Intl.NumberFormat("de-DE", {
  maximumFractionDigits: 0,
});

const timeFormat = new Intl.DateTimeFormat("de-DE", {
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

export function formatLatitude(value) {
  const hemisphere = value >= 0 ? "N" : "S";
  return `${latLngFormat.format(Math.abs(value))}° ${hemisphere}`;
}

export function formatLongitude(value) {
  const hemisphere = value >= 0 ? "O" : "W";
  return `${latLngFormat.format(Math.abs(value))}° ${hemisphere}`;
}

export function formatAltitude(value) {
  return `${wholeFormat.format(Math.round(value))} km`;
}

export function formatVelocity(value) {
  return `${wholeFormat.format(Math.round(value))} km/h`;
}

export function formatClock(date) {
  return timeFormat.format(date);
}

export function describeVisibility(visibility) {
  if (visibility === "daylight") {
    return { label: "Im Sonnenlicht", tone: "sunlit" };
  }
  if (visibility === "eclipsed") {
    return { label: "Im Erdschatten", tone: "eclipsed" };
  }
  return { label: "Nicht gemeldet", tone: "unknown" };
}

/**
 * Übernimmt die Rohantwort der API in die Form, die die Oberfläche erwartet.
 * Gibt `null` zurück, wenn die Antwort keine brauchbare Position enthält.
 */
export function normalizeReading(payload) {
  const latitude = Number(payload?.latitude);
  const longitude = Number(payload?.longitude);

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return null;
  }

  return {
    latitude,
    longitude,
    altitude: Number(payload.altitude),
    velocity: Number(payload.velocity),
    visibility: payload.visibility,
    timestamp: Number(payload.timestamp) * 1000,
  };
}

/**
 * Bringt eine geografische Länge in die Nähe eines Referenzwerts (± 360°).
 *
 * Die API liefert Längen immer in [-180, 180). Beim Überqueren der
 * Datumsgrenze springt der Wert daher von 179,9 auf -179,9 – für die Karte
 * ein Sprung um die halbe Welt. `panTo` mittelt diesen Sprung nicht aus
 * (`worldCopyJump` wirkt nur beim Ziehen), die Karte würde also eine ganze
 * Welt weiterwandern und die ISS verlieren. Über den kürzesten Weg zum
 * Referenzwert bleibt die Bewegung stetig.
 */
export function unwrapLongitude(longitude, reference) {
  if (!Number.isFinite(reference)) return longitude;
  return longitude + 360 * Math.round((reference - longitude) / 360);
}

/** Hängt eine Position an die Flugspur an und behält nur die letzten Punkte. */
export function appendToTrack(points, point) {
  const next = points.concat(point);
  return next.length > MAX_TRACK_POINTS ? next.slice(-MAX_TRACK_POINTS) : next;
}

/* ── Darstellung ───────────────────────────────────────────────────────── */

/**
 * Die Wahl des Nutzers: "light", "dark" oder "system".
 *
 * „System" wird nicht eigens gespeichert – ein fehlender Eintrag bedeutet es.
 * So gibt es für denselben Zustand nur eine Darstellung, und ein späterer
 * Wechsel der Systemeinstellung wirkt sich wieder aus.
 *
 * Der Speicherzugriff kann werfen (privates Fenster, blockierte
 * Website-Daten). Das darf die App nicht anhalten: dann gilt eben „system".
 */
export function readThemeChoice() {
  try {
    const stored = window.localStorage.getItem(THEME_KEY);
    return stored === "light" || stored === "dark" ? stored : "system";
  } catch {
    return "system";
  }
}

/** Welches Erscheinungsbild das Betriebssystem vorgibt. */
export function systemTheme() {
  return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
}

/**
 * Setzt die Wahl: Attribut am `<html>`, Speicher und Farbe der Browserleiste.
 * Gibt das aufgelöste Erscheinungsbild zurück ("light" oder "dark").
 */
export function applyThemeChoice(choice) {
  const resolved = choice === "system" ? systemTheme() : choice;

  document.documentElement.dataset.theme = resolved;

  try {
    if (choice === "system") {
      window.localStorage.removeItem(THEME_KEY);
    } else {
      window.localStorage.setItem(THEME_KEY, choice);
    }
  } catch {
    // Wie oben: Die Wahl gilt dann für diese Sitzung, überlebt aber kein
    // Neuladen. Kein Grund, hier abzubrechen.
  }

  // Die `theme-color`-Angaben aus dem Layout folgen dem Betriebssystem. Bei
  // ausdrücklicher Wahl ziehen wir sie nach, sonst bliebe die Browserleiste
  // im falschen Ton stehen.
  document.querySelectorAll('meta[name="theme-color"]').forEach((meta) => {
    const media = meta.getAttribute("media") ?? "";
    const color =
      choice === "system"
        ? media.includes("light")
          ? THEME_COLORS.light
          : THEME_COLORS.dark
        : THEME_COLORS[resolved];
    meta.setAttribute("content", color);
  });

  return resolved;
}

/**
 * Dasselbe wie `applyThemeChoice`, aber als Text für ein Skript, das vor dem
 * ersten Anstrich läuft – ohne Importe, ohne Module.
 *
 * Ein `useEffect` wäre hier zu spät: React führt Effekte erst nach dem ersten
 * Rendern aus. Wer „hell" gewählt hat, sähe bei jedem Neuladen kurz die dunkle
 * Oberfläche. Das Skript setzt das Attribut deshalb, bevor der Browser
 * überhaupt zeichnet.
 */
export const THEME_SCRIPT =
  `(function(){try{var s=localStorage.getItem(${JSON.stringify(THEME_KEY)});` +
  `if(s==="light"||s==="dark"){document.documentElement.dataset.theme=s;return}}catch(e){}` +
  `document.documentElement.dataset.theme=` +
  `window.matchMedia("(prefers-color-scheme: light)").matches?"light":"dark";})()`;
