/**
 * Zusatzprüfung: Verhalten an der Datumsgrenze.
 *
 * Die ISS überquert alle ~92 Minuten die 180°-Linie. Dort springt die
 * geografische Länge der API von 179,9 auf −179,9. Ohne Entfaltung
 * (`unwrapLongitude` in `app/lib/iss.js`) wandert die Karte eine ganze Welt
 * weiter und verliert die ISS — ein Fehler, der im Normalbetrieb unsichtbar
 * ist und erst nach rund anderthalb Stunden auftritt.
 *
 * Aufruf:
 *   node .claude/skills/iss-feature-gate/scripts/check.mjs \
 *        --extra .claude/skills/iss-feature-gate/scripts/check-datumsgrenze.mjs
 *
 * Diese Prüfung ersetzt die Positionsdaten durch eine synthetische Bahn.
 * Sie gehört deshalb in einen eigenen Lauf, nicht in den Standardlauf.
 */

export const checks = [
  {
    name: "K1 Datumsgrenze",
    async run(page) {
      let lng = 168;
      let phase = 0;
      const served = [];

      await page.route("**://api.wheretheiss.at/**", async (route) => {
        // Ostwärts über 180° hinweg; die Breite schwingt wie bei einer echten
        // Umlaufbahn, damit die Spur nicht zu einer Geraden zusammenfällt.
        phase += 0.16;
        lng = ((((lng + 4 + 180) % 360) + 360) % 360) - 180;
        served.push(lng);

        await route.fulfill({
          contentType: "application/json",
          body: JSON.stringify({
            latitude: 51.6 * Math.sin(phase),
            longitude: lng,
            altitude: 420,
            velocity: 27580,
            visibility: "daylight",
            timestamp: Math.floor(Date.now() / 1000),
            units: "kilometers",
          }),
        });
      });

      await page.reload({ waitUntil: "domcontentloaded" });
      await page.waitForTimeout(42000);

      const ueberquerung = served.some((v, i) => i && Math.abs(v - served[i - 1]) > 180);
      if (!ueberquerung) {
        throw new Error("synthetische Bahn hat die Datumsgrenze nicht erreicht");
      }

      // 1. Bleibt die Karte auf der ISS?
      const abstand = await page.evaluate(() => {
        const canvas = document.querySelector(".map-canvas").getBoundingClientRect();
        const marker = document.querySelector(".leaflet-marker-icon").getBoundingClientRect();
        return Math.hypot(
          marker.x + marker.width / 2 - (canvas.x + canvas.width / 2),
          marker.y + marker.height / 2 - (canvas.y + canvas.height / 2),
        );
      });
      if (abstand > 40) {
        throw new Error(
          `Karte ist der ISS nicht gefolgt: Marker ${Math.round(abstand)} px neben der Mitte`,
        );
      }

      // 2. Zeigt die Anzeige weiterhin eine gültige Länge (0–180, W oder O)?
      //    Ein durchgereichter entfalteter Wert stünde hier als „184,00° O".
      const laenge = await page.$$eval(".readouts dd", (els) => els[1]?.textContent ?? "");
      const treffer = laenge.match(/^([\d.,]+)°\s*([NOSW])$/);
      if (!treffer) throw new Error(`Länge unlesbar formatiert: „${laenge}"`);
      if (Number(treffer[1].replace(",", ".")) > 180) {
        throw new Error(`Länge außerhalb von 0–180°: „${laenge}"`);
      }

      // 3. Bildet die Spur eine stetige Linie ohne Sprung quer über die Karte?
      const pfade = await page.$$eval("path.leaflet-interactive", (els) =>
        els.map((e) => e.getAttribute("d") ?? ""),
      );
      const spruenge = pfade.flatMap((d) => {
        const xs = [...d.matchAll(/[ML](-?[\d.]+) (-?[\d.]+)/g)].map((m) => Number(m[1]));
        return xs.slice(1).map((x, i) => Math.abs(x - xs[i]));
      });
      const groessterSprung = spruenge.length ? Math.max(...spruenge) : 0;
      if (groessterSprung >= 200) {
        throw new Error(`Spur springt um ${Math.round(groessterSprung)} px über die Karte`);
      }

      return (
        `Überquerung bei ${served.join(", ")} — ` +
        `Marker ${Math.round(abstand)} px von der Mitte, Länge „${laenge}", ` +
        `größter Spur-Sprung ${Math.round(groessterSprung)} px`
      );
    },
  },
];
