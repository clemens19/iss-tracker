/**
 * Prüfungen für das umschaltbare Erscheinungsbild (Spec §8).
 *
 * Aufruf:
 *   node .claude/skills/iss-feature-gate/scripts/check.mjs \
 *        --extra checks/farbschema.mjs
 *
 * H5 und H6 messen Kontrastverhältnisse. Die Vorgabe lautet 4,5:1 für Text –
 * der Wert aus den WCAG-Richtlinien, unter dem Text für viele Menschen kaum
 * noch lesbar ist. Gemessen wird, nicht geschätzt: Eine Farbe, die in der
 * Spec gut aussah, kann auf dem tatsächlichen Untergrund durchfallen.
 *
 * Hinweis zur Reihenfolge: H2 installiert ein Skript, das bei jeder weiteren
 * Navigation mitläuft. Es schreibt nur mit und stört nicht – die Wahl für
 * H3/H4 wird deshalb über den Speicher gesetzt, nicht über dieses Skript.
 */

const THEME_KEY = "iss-theme";

/** Kontrastverhältnis zweier Farben nach WCAG. */
function contrastRatio(fg, bg) {
  const channel = (value) => {
    const part = value / 255;
    return part <= 0.04045 ? part / 12.92 : ((part + 0.055) / 1.055) ** 2.4;
  };
  const luminance = ({ r, g, b }) =>
    0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);

  const first = luminance(fg);
  const second = luminance(bg);
  const [high, low] = first > second ? [first, second] : [second, first];
  return (high + 0.05) / (low + 0.05);
}

const WHITE = { r: 255, g: 255, b: 255 };

/** Farbe aus `#rrggbb` oder `rgb(…)`/`rgba(…)` als Zahlenpaar. */
function parseColor(value) {
  const hex = /^#([\da-f]{6})$/i.exec(value.trim());
  if (hex) {
    const packed = parseInt(hex[1], 16);
    return { r: (packed >> 16) & 255, g: (packed >> 8) & 255, b: packed & 255 };
  }
  const parts = value.match(/[\d.]+/g)?.map(Number) ?? [];
  return { r: parts[0] ?? 0, g: parts[1] ?? 0, b: parts[2] ?? 0 };
}

const sameColor = (a, b) => a.r === b.r && a.g === b.g && a.b === b.b;

/**
 * Farben von Vordergrund und Untergrund eines Elements.
 *
 * `over` ist die Farbe, auf der alles liegt – der Ersatz für einen Untergrund,
 * den man nicht auslesen kann. `ownOnly` betrifft Elemente, die *über* etwas
 * liegen, das keine Farbe im DOM ist: Die Attribution schwebt über den
 * Kacheln. Dort wäre es falsch, die Vorfahren heranzuziehen – die liegen
 * hinter den Kacheln, nicht darunter.
 */
async function colorsOf(page, selector, over, ownOnly = false) {
  return page.evaluate(
    ({ selector, over, ownOnly }) => {
      const element = document.querySelector(selector);
      if (!element) return null;

      const parse = (value) => {
        const parts = value.match(/[\d.]+/g)?.map(Number) ?? [];
        return { r: parts[0] ?? 0, g: parts[1] ?? 0, b: parts[2] ?? 0, a: parts[3] ?? 1 };
      };

      const foreground = parse(getComputedStyle(element).color);

      // Von unten nach oben einsammeln: das eigene Element zuletzt.
      const layers = [];
      for (let node = element; node; node = node.parentElement) {
        const candidate = parse(getComputedStyle(node).backgroundColor);
        if (candidate.a > 0) layers.push(candidate);
        if (candidate.a === 1 || ownOnly) break;
      }

      // Von hinten nach vorne übereinanderlegen.
      let background = over;
      for (let index = layers.length - 1; index >= 0; index -= 1) {
        const layer = layers[index];
        background = {
          r: layer.r * layer.a + background.r * (1 - layer.a),
          g: layer.g * layer.a + background.g * (1 - layer.a),
          b: layer.b * layer.a + background.b * (1 - layer.a),
        };
      }

      return { fg: foreground, bg: background };
    },
    { selector, over, ownOnly },
  );
}

async function measure(page, selector, { ownOnly = false } = {}) {
  const colors = await colorsOf(page, selector, WHITE, ownOnly);
  if (!colors) throw new Error(`${selector} nicht gefunden`);
  return contrastRatio(colors.fg, colors.bg);
}

/** Setzt eine Wahl über den Umschalter – so, wie ein Nutzer es täte. */
async function selectTheme(page, theme) {
  await page.waitForSelector("#theme", { timeout: 20000 });
  await page.selectOption("#theme", theme);
  await page.waitForTimeout(350);
}

async function resolvedTheme(page) {
  return page.evaluate(() => document.documentElement.dataset.theme ?? "(nicht gesetzt)");
}

async function surfaceColor(page) {
  return page.evaluate(() => getComputedStyle(document.body).backgroundColor);
}

/** Setzt die Wahl im Speicher (ohne den Umschalter) und lädt neu. */
async function seedAndReload(page, theme) {
  await page.evaluate(
    ({ key, theme }) => {
      if (theme === "system") window.localStorage.removeItem(key);
      else window.localStorage.setItem(key, theme);
    },
    { key: THEME_KEY, theme },
  );
  await page.reload({ waitUntil: "domcontentloaded" });
}

export const checks = [
  {
    name: "H1 Umschalten wirkt",
    async run(page) {
      const before = { theme: await resolvedTheme(page), bg: await surfaceColor(page) };

      await selectTheme(page, "light");
      const light = { theme: await resolvedTheme(page), bg: await surfaceColor(page) };

      await selectTheme(page, "dark");
      const dark = { theme: await resolvedTheme(page), bg: await surfaceColor(page) };

      if (light.theme !== "light" || dark.theme !== "dark") {
        throw new Error(`Attribut folgt nicht: hell → „${light.theme}“, dunkel → „${dark.theme}“`);
      }
      // Das Attribut allein genügt nicht – es könnte ins Leere zeigen, wenn
      // keine passenden Regeln dahinterstehen.
      if (light.bg === dark.bg) {
        throw new Error(`Hintergrund bleibt ${light.bg}, obwohl sich das Attribut ändert`);
      }
      return `Hintergrund ${before.bg} → ${light.bg} → ${dark.bg}`;
    },
  },
  {
    name: "H2 Kein Aufblitzen",
    async run(page) {
      // Jede Änderung von `data-theme` mitschreiben, ab dem ersten Skript der
      // Seite. Blitzt das falsche Erscheinungsbild auf, steht es am Anfang.
      await page.addInitScript(() => {
        window.__themeTrace = [];
        const record = () => {
          const element = document.documentElement;
          if (!element) return;
          const value = element.dataset.theme;
          if (value && window.__themeTrace.at(-1) !== value) window.__themeTrace.push(value);
        };
        new MutationObserver(record).observe(document, {
          attributes: true,
          subtree: true,
          attributeFilter: ["data-theme"],
        });
        record();
        document.addEventListener("DOMContentLoaded", record);
      });

      // Gegen den Willen des Systems laden: Nur so wäre ein Aufblitzen
      // überhaupt sichtbar – hell gespeichert, System dunkel.
      await page.emulateMedia({ colorScheme: "dark" });
      await seedAndReload(page, "light");
      await page.waitForTimeout(600);

      const trace = await page.evaluate(() => window.__themeTrace ?? []);
      if (!trace.length) throw new Error("data-theme wurde nie gesetzt");
      if (trace[0] !== "light") {
        throw new Error(
          `zuerst gezeichnet: „${trace[0]}“ statt „light“ – Verlauf ${trace.join(" → ")}`,
        );
      }
      return `Verlauf ${trace.join(" → ")}`;
    },
  },
  {
    name: "H3 Auswahl überlebt Neuladen",
    async run(page) {
      await seedAndReload(page, "light");
      await page.waitForTimeout(400);
      if ((await resolvedTheme(page)) !== "light") {
        throw new Error("Wahl „Hell“ ist nach dem Neuladen verloren");
      }

      await seedAndReload(page, "dark");
      await page.waitForTimeout(400);
      if ((await resolvedTheme(page)) !== "dark") {
        throw new Error("Wahl „Dunkel“ ist nach dem Neuladen verloren");
      }
      return "hell und dunkel bleiben nach dem Neuladen erhalten";
    },
  },
  {
    name: "H4 System wird befolgt",
    async run(page) {
      await page.emulateMedia({ colorScheme: "light" });
      await seedAndReload(page, "system");
      await page.waitForTimeout(400);
      const light = await resolvedTheme(page);

      await page.emulateMedia({ colorScheme: "dark" });
      await page.reload({ waitUntil: "domcontentloaded" });
      await page.waitForTimeout(400);
      const dark = await resolvedTheme(page);

      if (light !== "light" || dark !== "dark") {
        throw new Error(`ohne gespeicherte Wahl: hell → „${light}“, dunkel → „${dark}“`);
      }
      return "ohne gespeicherte Wahl folgt die App dem System";
    },
  },
  {
    name: "H5 Kontrast der Messwerte",
    async run(page) {
      const targets = [
        ".readouts .readout--lead dd",
        ".readout dt",
        ".panel__foot",
      ];
      const report = [];
      let worst = Infinity;

      // Beide Sätze messen – ein Durchgang, beide Ergebnisse.
      for (const theme of ["light", "dark"]) {
        await selectTheme(page, theme);
        for (const selector of targets) {
          const ratio = await measure(page, selector);
          worst = Math.min(worst, ratio);
          if (ratio < 4.5) {
            report.push(`${theme} · ${selector} ${ratio.toFixed(1)}:1`);
          }
        }
      }

      if (report.length) {
        throw new Error(`unter 4,5:1 – ${report.join(", ")}`);
      }
      return `beide Sätze geprüft, schlechtester Wert ${worst.toFixed(1)}:1`;
    },
  },
  {
    name: "H6 Attribution lesbar",
    async run(page) {
      // Die Attribution liegt mit durchscheinendem Grund auf den Kacheln.
      // Gemessen wird ihr eigener Grund über Weiß – die hellste Stelle, die
      // eine OSM-Kachel haben kann, und damit der ungünstigste Fall. Die
      // Vorfahren bleiben außen vor: Sie liegen hinter den Kacheln.
      const results = [];
      for (const theme of ["light", "dark"]) {
        await selectTheme(page, theme);
        const ratio = await measure(page, ".leaflet-control-attribution", { ownOnly: true });
        results.push(`${theme} ${ratio.toFixed(1)}:1`);
        if (ratio < 4.5) {
          throw new Error(`Attribution nur ${ratio.toFixed(1)}:1 über heller Kachel (${theme})`);
        }
      }
      return results.join(", ");
    },
  },
  {
    name: "H7 Keine Fehler beim Umschalten",
    async run(page, ctx) {
      const before = ctx.messages.length;

      for (const theme of ["light", "dark", "system"]) {
        await selectTheme(page, theme);
      }

      const fresh = ctx.messages.slice(before);
      const problems = fresh.filter(
        (m) => m.type === "error" || /hydrat|did not match/i.test(m.text),
      );
      if (problems.length) {
        throw new Error(problems.map((p) => p.text).join(" | "));
      }
      return "dreimal umgeschaltet, keine Meldung";
    },
  },
  {
    // Diese Prüfung hat sich selbst bezahlt: Das Skript vor dem ersten
    // Anstrich trug zunächst `id="theme"` – dieselbe wie das Auswahlfeld.
    // Zwei Elemente mit derselben ID sind ein HTML-Fehler, und `#theme`
    // traf fortan das Skript, das keine sichtbare Fläche hat.
    name: "H8 Keine doppelten IDs",
    async run(page) {
      const duplicates = await page.evaluate(() => {
        const counts = new Map();
        document.querySelectorAll("[id]").forEach((element) => {
          counts.set(element.id, (counts.get(element.id) ?? 0) + 1);
        });
        return [...counts]
          .filter(([, count]) => count > 1)
          .map(([id, count]) => `${id} (${count}×)`);
      });
      if (duplicates.length) {
        throw new Error(`mehrfach vergeben: ${duplicates.join(", ")}`);
      }
      return "alle IDs eindeutig";
    },
  },
  {
    // Anlass: Die Flugspur trug ihre Farbe als JavaScript-Konstante
    // (`#E8A33D`) und behielt sie im hellen Modus bei – gemessen 2,2:1 auf
    // einer OSM-Kachel, also unter dem Mindestwert für Flächen und Linien.
    // Seitdem kommt sie als `.iss-track` aus `--solar`. Diese Prüfung hält
    // beides fest: dass die Variable wirklich ankommt und dass der helle Wert
    // lesbar ist.
    name: "H9 Flugspur folgt dem Erscheinungsbild",
    async run(page) {
      // Die Spur entsteht erst mit dem zweiten Messwert, also nach bis zu
      // zwei Polling-Runden – der letzte Neuladen davor war H4.
      // `attached`, nicht `visible`: Eine frische Spur aus zwei dicht
      // beieinanderliegenden Punkten ist eine waagerechte Linie ohne Höhe,
      // und Playwright hält Elemente ohne Fläche für unsichtbar. Auf
      // Sichtbarkeit zu warten macht die Prüfung davon abhängig, wie weit die
      // ISS in den ersten Sekunden gezogen ist.
      await page.waitForSelector(".iss-track", { state: "attached", timeout: 30000 });

      const read = () =>
        page.evaluate(() => ({
          stroke: getComputedStyle(document.querySelector(".iss-track")).stroke,
          token: getComputedStyle(document.documentElement).getPropertyValue("--solar").trim(),
        }));

      const seen = {};
      for (const theme of ["light", "dark"]) {
        await selectTheme(page, theme);
        const { stroke, token } = await read();
        if (!sameColor(parseColor(stroke), parseColor(token))) {
          throw new Error(
            `${theme}: Spur ist ${stroke}, --solar aber ${token} – die Variable kommt nicht an`,
          );
        }
        seen[theme] = { stroke, color: parseColor(stroke) };
      }

      if (sameColor(seen.light.color, seen.dark.color)) {
        throw new Error(`Spur bleibt in beiden Sätzen ${seen.light.stroke}`);
      }

      // Die Kacheln sind in beiden Modi dieselben und nahezu weiß. Für den
      // hellen Satz ist Weiß damit der ungünstigste Fall – und genau der, an
      // dem die alte Konstante scheiterte.
      const againstTiles = contrastRatio(seen.light.color, WHITE);
      if (againstTiles < 3) {
        throw new Error(
          `helle Spur nur ${againstTiles.toFixed(1)}:1 auf heller Kachel (nötig 3:1)`,
        );
      }

      return `hell ${seen.light.stroke} (${againstTiles.toFixed(1)}:1 auf Kachel), dunkel ${seen.dark.stroke}`;
    },
  },
];
