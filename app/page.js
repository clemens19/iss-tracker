"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState } from "react";

import ColorScheme from "./components/ColorScheme";

import {
  CREW_API,
  CREW_POLL_MS,
  ISS_API,
  POLL_MS,
  REQUEST_TIMEOUT_MS,
  appendToTrack,
  describeVisibility,
  formatAltitude,
  formatClock,
  formatLatitude,
  formatLongitude,
  formatVelocity,
  normalizeReading,
  unwrapLongitude,
} from "./lib/iss";

// Die Karte darf nur im Browser entstehen – Leaflet spricht das DOM direkt an.
const IssMap = dynamic(() => import("./components/IssMap"), {
  ssr: false,
  loading: () => (
    <div className="map-frame">
      <p className="map-loading">Karte wird geladen …</p>
    </div>
  ),
});

const STATUS = {
  connecting: { label: "Verbinde …", tone: "pending" },
  live: { label: "Live", tone: "live" },
  offline: { label: "Keine Verbindung", tone: "offline" },
};

export default function Page() {
  const [reading, setReading] = useState(null);
  const [connection, setConnection] = useState("connecting");
  const [track, setTrack] = useState([]);
  const [follow, setFollow] = useState(true);
  const [crew, setCrew] = useState(null);
  const [updatedAt, setUpdatedAt] = useState(null);

  // Bezugssystem der Karte für die geografische Länge. Wird einmal aus dem
  // ersten Messwert gesetzt und danach stetig fortgeschrieben, damit der
  // Sprung an der Datumsgrenze nicht auf die Karte durchschlägt.
  const frameLngRef = useRef(null);

  // Live-Position im festen Takt abfragen.
  useEffect(() => {
    let cancelled = false;
    let timer;

    async function poll() {
      try {
        // Die Zeitgrenze macht aus einer zähen Antwort einen Fehler statt
        // einer Blockade: Der `finally`-Zweig plant sonst erst dann die
        // nächste Abfrage, wenn diese hier zurückkommt.
        const response = await fetch(ISS_API, {
          cache: "no-store",
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        const next = normalizeReading(await response.json());
        if (!next) throw new Error("Antwort ohne verwertbare Position");

        if (cancelled) return;

        // `displayLng` ist die Länge im Bezugssystem der Karte; `longitude`
        // bleibt der unveränderte Wert der API für die Anzeige.
        const displayLng = unwrapLongitude(next.longitude, frameLngRef.current);
        frameLngRef.current = displayLng;

        setReading({ ...next, displayLng });
        setTrack((points) => appendToTrack(points, { lat: next.latitude, lng: displayLng }));
        setUpdatedAt(new Date());
        setConnection("live");
      } catch {
        // Bewusst kein Abbruch: das Polling läuft weiter und die Anzeige
        // erholt sich von selbst, sobald die API wieder antwortet.
        if (!cancelled) setConnection("offline");
      } finally {
        if (!cancelled) timer = setTimeout(poll, POLL_MS);
      }
    }

    poll();

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, []);

  // Besatzungsliste über den eigenen Proxy laden (Bonus B4).
  useEffect(() => {
    let cancelled = false;
    let timer;

    async function loadCrew() {
      try {
        // Dieselbe Zeitgrenze: Auch diese Schleife plant erst im `finally`
        // die nächste Abfrage.
        const response = await fetch(CREW_API, {
          cache: "no-store",
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        const data = await response.json();
        if (!cancelled) setCrew({ number: data.number, people: data.people });
      } catch {
        if (!cancelled) setCrew("error");
      } finally {
        if (!cancelled) timer = setTimeout(loadCrew, CREW_POLL_MS);
      }
    }

    loadCrew();

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, []);

  // Wer die Karte selbst verschiebt, will nicht mehr, dass sie nachführt.
  const handleUserDrag = useCallback(() => setFollow(false), []);

  const status = STATUS[connection];
  const condition = describeVisibility(reading?.visibility);

  return (
    <div className="app">
      <header className="masthead">
        <div className="brand">
          <svg className="brand__mark" viewBox="0 0 32 32" aria-hidden="true">
            <ellipse
              cx="16"
              cy="16"
              rx="13"
              ry="5.4"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.7"
              opacity="0.45"
              transform="rotate(-28 16 16)"
            />
            <circle cx="16" cy="16" r="6.6" fill="none" stroke="currentColor" strokeWidth="1.9" />
            <circle className="brand__accent" cx="27" cy="8.6" r="2.7" />
          </svg>
          <h1>ISS Live-Tracker</h1>
        </div>

        <div className="masthead__tools">
          <p className={`status status--${status.tone}`}>
            <span className="status__dot" aria-hidden="true" />
            {status.label}
          </p>
          <ColorScheme />
        </div>
      </header>

      <main className="main">
        <IssMap position={reading} track={track} follow={follow} onUserDrag={handleUserDrag} />

        <aside className="panel">
          {connection === "offline" && (
            <p className="notice" role="status">
              Die Positionsdaten sind gerade nicht erreichbar. Die App fragt weiter ab – unten
              stehen die zuletzt bekannten Werte.
            </p>
          )}

          <dl className="readouts">
            <div className="readout readout--lead">
              <dt>Breite</dt>
              <dd>{reading ? formatLatitude(reading.latitude) : "—"}</dd>
            </div>
            <div className="readout readout--lead">
              <dt>Länge</dt>
              <dd>{reading ? formatLongitude(reading.longitude) : "—"}</dd>
            </div>
            <div className="readout">
              <dt>Höhe</dt>
              <dd>{reading ? formatAltitude(reading.altitude) : "—"}</dd>
            </div>
            <div className="readout">
              <dt>Geschwindigkeit</dt>
              <dd>{reading ? formatVelocity(reading.velocity) : "—"}</dd>
            </div>
          </dl>

          <p className={`condition condition--${condition.tone}`}>
            <span className="condition__dot" aria-hidden="true" />
            {condition.label}
          </p>

          <section className="block">
            <label className="toggle">
              <input
                type="checkbox"
                checked={follow}
                onChange={(event) => setFollow(event.target.checked)}
              />
              Karte folgt der ISS
            </label>
          </section>

          <section className="block">
            <h2 className="block__title">
              Besatzung
              {crew && crew !== "error" && (
                <span className="block__meta">{crew.number} Personen</span>
              )}
            </h2>

            {crew === null && <p className="muted">Wird geladen …</p>}

            {crew === "error" && (
              <p className="muted">Die Besatzungsliste ist derzeit nicht abrufbar.</p>
            )}

            {crew && crew !== "error" && crew.number === 0 && (
              <p className="muted">Zurzeit ist niemand auf der ISS gemeldet.</p>
            )}

            {crew && crew !== "error" && crew.number > 0 && (
              <ul className="crew">
                {crew.people.map((person) => (
                  <li key={person.name}>{person.name}</li>
                ))}
              </ul>
            )}
          </section>

          <footer className="panel__foot">
            {updatedAt
              ? `Letzte Aktualisierung ${formatClock(updatedAt)} Uhr`
              : "Noch keine Daten empfangen"}
          </footer>
        </aside>
      </main>
    </div>
  );
}
