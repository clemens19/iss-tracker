"use client";

import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

import { INITIAL_ZOOM } from "../lib/iss";

const SOLAR = "#E8A33D";

/**
 * Leaflet-Karte mit ISS-Marker und Flugspur.
 *
 * Wird ausschließlich clientseitig geladen (`ssr: false`), weil Leaflet das
 * DOM direkt anspricht. Die Karte wird einmal aufgebaut und danach über
 * Effekte aktualisiert, damit sie beim Polling nicht neu entsteht.
 */
export default function IssMap({ position, track, follow, onUserDrag }) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const markerRef = useRef(null);
  const trackLayersRef = useRef([]);
  const hasCenteredRef = useRef(false);

  // Beide Callbacks werden in Effekten gelesen, die nur einmal bzw. bei
  // Positionswechsel laufen – Refs halten sie dort aktuell.
  const followRef = useRef(follow);
  const onUserDragRef = useRef(onUserDrag);
  followRef.current = follow;
  onUserDragRef.current = onUserDrag;

  // Karte einmalig aufbauen.
  useEffect(() => {
    if (mapRef.current || !containerRef.current) return;

    // Bewusst ohne `worldCopyJump`: die Option setzt den Mittelpunkt beim
    // Ziehen stillschweigend auf eine andere Weltkopie um. Die Flugspur hält
    // ihre Längen aber in einem stetigen Bezugssystem (siehe `unwrapLongitude`),
    // und ein umgesetzter Mittelpunkt würde Marker und Spur verschieben.
    const map = L.map(containerRef.current, {
      center: [20, 0],
      zoom: 2,
      minZoom: 2,
      zoomSnap: 0.5,
    });

    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>-Mitwirkende',
    }).addTo(map);

    // Eigenes Marker-Symbol statt Leaflets PNG-Icons: die Standardpfade
    // brechen unter Bundlern, und ein DivIcon lässt sich frei gestalten.
    const icon = L.divIcon({
      className: "iss-marker",
      html: '<span class="iss-marker__halo"></span><span class="iss-marker__dot"></span>',
      iconSize: [24, 24],
      iconAnchor: [12, 12],
    });

    markerRef.current = L.marker([0, 0], {
      icon,
      interactive: false,
      keyboard: false,
    }).addTo(map);

    // Zieht jemand die Karte selbst, ist "Karte folgt" nicht mehr gewollt.
    // `panTo` löst nur `movestart` aus, nicht `dragstart` – keine Rückkopplung.
    map.on("dragstart", () => onUserDragRef.current?.());

    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
      markerRef.current = null;
      trackLayersRef.current = [];
      hasCenteredRef.current = false;
    };
  }, []);

  // Marker setzen, beim ersten Messwert einzoomen und der ISS folgen.
  useEffect(() => {
    const map = mapRef.current;
    const marker = markerRef.current;
    if (!map || !marker || !position) return;

    const latlng = [position.latitude, position.displayLng];
    marker.setLatLng(latlng);

    if (!hasCenteredRef.current) {
      map.setView(latlng, INITIAL_ZOOM);
      hasCenteredRef.current = true;
    } else if (follow) {
      map.panTo(latlng, { animate: true, duration: 0.8 });
    }
  }, [position, follow]);

  // Flugspur neu zeichnen. Die Längen liegen bereits stetig vor, deshalb
  // genügt eine einzige Linie – auch über die Datumsgrenze hinweg.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    trackLayersRef.current.forEach((layer) => map.removeLayer(layer));
    trackLayersRef.current = [];

    if (track.length > 1) {
      trackLayersRef.current = [
        L.polyline(
          track.map((point) => [point.lat, point.lng]),
          {
            color: SOLAR,
            weight: 2,
            opacity: 0.6,
            lineJoin: "round",
            lineCap: "round",
          },
        ).addTo(map),
      ];
    }
  }, [track]);

  return (
    <div className="map-frame">
      <div ref={containerRef} className="map-canvas" />
    </div>
  );
}
