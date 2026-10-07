#!/usr/bin/env node
/**
 * Browser-Prüflauf für die ISS-App.
 *
 * Fährt die laufende App wie ein Nutzer: Karte, Messwerte, Polling,
 * Fehlerfall und Erholung. Nutzt das bereits installierte Microsoft Edge,
 * lädt also keinen Browser herunter.
 *
 *   node .claude/skills/iss-feature-gate/scripts/check.mjs
 *   node .claude/skills/iss-feature-gate/scripts/check.mjs --url https://…
 *   node .claude/skills/iss-feature-gate/scripts/check.mjs --headed
 *   node .claude/skills/iss-feature-gate/scripts/check.mjs --extra ./checks/datumsgrenze.mjs
 *   node .claude/skills/iss-feature-gate/scripts/check.mjs --only T6,T7
 *   node .claude/skills/iss-feature-gate/scripts/check.mjs --theme light
 *
 * Eine Zusatzdatei exportiert:
 *   export const checks = [{ name: "…", run: async (page, ctx) => "Details" }];
 * `run` gibt eine Detailzeile zurück oder wirft einen Fehler.
 */

import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const EXIT_OK = 0;
const EXIT_FAILED = 1;
const EXIT_SETUP = 2;

let chromium;
try {
  ({ chromium } = await import("playwright-core"));
} catch {
  console.error(
    "playwright-core fehlt. Einmalig installieren:\n\n" +
      "  npm install -D playwright-core\n\n" +
      "Das Paket nutzt das vorhandene Microsoft Edge und lädt keinen Browser herunter.",
  );
  process.exit(EXIT_SETUP);
}

// ── Prüfungen, die für jedes Feature gelten ────────────────────────────────
//
// Die Reihenfolge ist nicht beliebig: die letzten drei verändern den Zustand
// der Seite (Netzwerk blockieren, Fenstergröße ändern), deshalb stehen sie
// hinten.

const BASE_CHECKS = [
  {
    name: "T1 Konsolenfehler",
    async run(page, ctx) {
      const errors = ctx.messages.filter((m) => m.type === "error");
      if (errors.length) {
        throw new Error(errors.map((e) => e.text).join(" | "));
      }
      return `${ctx.messages.length} Meldungen, keine davon ein Fehler`;
    },
  },
  {
    name: "T2 Mixed Content",
    async run(page, ctx) {
      const mixed = ctx.messages.filter((m) => /mixed content/i.test(m.text));
      if (mixed.length) throw new Error(mixed[0].text);
      return "keine HTTP-Anfrage von der HTTPS-Seite";
    },
  },
  {
    name: "T3 Karte und Marker",
    async run(page) {
      await page.waitForSelector(".iss-marker", { timeout: 20000 });
      const tiles = await page.$$eval("img.leaflet-tile", (imgs) => imgs.length);
      if (!tiles) throw new Error("keine Kartenkacheln im DOM");

      const broken = await page.$$eval(
        "img.leaflet-tile",
        (imgs) => imgs.filter((i) => i.complete && i.naturalWidth === 0).length,
      );
      if (broken) throw new Error(`${broken} Kacheln ließen sich nicht laden`);

      return `Marker vorhanden, ${tiles} Kacheln geladen`;
    },
  },
  {
    name: "T4 Messwerte gefüllt",
    async run(page) {
      await page.waitForFunction(
        () => {
          const first = document.querySelector(".readouts dd");
          return first && !first.textContent.includes("—");
        },
        { timeout: 20000 },
      );
      return await page.$$eval(".readouts dd", (els) =>
        els.map((e) => e.textContent).join(" | "),
      );
    },
  },
  {
    name: "T5 Anzeige aktualisiert sich",
    async run(page) {
      const read = () =>
        page.$$eval(".readouts dd", (els) => els.map((e) => e.textContent).join("|"));

      const before = await read();
      await page.waitForTimeout(12000);
      const after = await read();

      if (before === after) {
        throw new Error(`Werte nach 12 s unverändert: ${before}`);
      }
      return "Messwerte ändern sich innerhalb von 12 s";
    },
  },
  {
    name: "T6 Karte folgt der ISS",
    async run(page) {
      const toggle = page.locator(".toggle input");
      if (!(await toggle.isChecked())) await toggle.check();
      await page.waitForTimeout(6500);

      const dx = await page.evaluate(() => {
        const canvas = document.querySelector(".map-canvas").getBoundingClientRect();
        const marker = document.querySelector(".leaflet-marker-icon").getBoundingClientRect();
        return Math.hypot(
          marker.x + marker.width / 2 - (canvas.x + canvas.width / 2),
          marker.y + marker.height / 2 - (canvas.y + canvas.height / 2),
        );
      });

      if (dx > 40) {
        throw new Error(`Marker ${Math.round(dx)} px neben der Kartenmitte`);
      }
      return `Abstand zur Kartenmitte: ${Math.round(dx)} px`;
    },
  },
  {
    name: "T7 Fehlerfall zeigt Hinweis",
    async run(page) {
      await page.route("**://api.wheretheiss.at/**", (route) => route.abort("failed"));
      await page.waitForSelector(".notice", { timeout: 20000 });

      const values = await page.$$eval(".readouts dd", (els) =>
        els.map((e) => e.textContent).join(" | "),
      );
      if (values.includes("—")) {
        throw new Error("Anzeige ist im Fehlerfall leer statt weiter gefüllt");
      }
      return "Hinweis erscheint, letzte Werte bleiben stehen";
    },
  },
  {
    name: "T8 Erholung nach Fehler",
    async run(page) {
      await page.unroute("**://api.wheretheiss.at/**");
      await page.waitForFunction(
        () => document.querySelector(".status")?.textContent.includes("Live"),
        { timeout: 25000 },
      );
      return "Status wechselt zurück auf Live";
    },
  },
  {
    name: "T9 Schmale Ansicht",
    async run(page) {
      await page.setViewportSize({ width: 390, height: 844 });
      await page.waitForTimeout(1500);

      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      if (overflow > 1) {
        throw new Error(`waagerechtes Scrollen um ${overflow} px bei 390 px Breite`);
      }
      return "kein waagerechtes Scrollen bei 390 px";
    },
  },
];

// ── Ablauf ─────────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const args = {
    url: "http://localhost:3000",
    headed: false,
    extra: null,
    only: null,
    theme: null,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const next = argv[i + 1];
    if (argv[i] === "--url") args.url = next;
    else if (argv[i] === "--extra") args.extra = next;
    else if (argv[i] === "--only") args.only = next.split(",").map((s) => s.trim());
    else if (argv[i] === "--theme") args.theme = next;
    else if (argv[i] === "--headed") args.headed = true;
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  let checks = BASE_CHECKS;
  if (args.extra) {
    const module = await import(pathToFileURL(resolve(args.extra)).href);
    checks = [...BASE_CHECKS, ...(module.checks ?? [])];
  }
  if (args.only) {
    checks = checks.filter((c) => args.only.some((key) => c.name.startsWith(key)));
  }

  const browser = await chromium.launch({ channel: "msedge", headless: !args.headed });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

  const messages = [];
  page.on("console", (m) => messages.push({ type: m.type(), text: m.text() }));
  page.on("pageerror", (e) => messages.push({ type: "error", text: `pageerror: ${e.message}` }));

  // Vorbelegte Darstellungswahl. Ohne das prüft der Lauf nur das dunkle
  // Erscheinungsbild – jeder Gestaltungssatz braucht seinen eigenen Durchgang.
  if (args.theme) {
    await page.addInitScript((theme) => {
      try {
        window.localStorage.setItem("iss-theme", theme);
      } catch {
        // Blockierter Speicher: dann greift eben die Systemeinstellung.
      }
    }, args.theme);
  }

  const ctx = { messages, url: args.url, theme: args.theme };

  console.log(`\nPrüflauf gegen ${args.url}${args.theme ? ` (${args.theme})` : ""}\n`);

  try {
    await page.goto(args.url, { waitUntil: "domcontentloaded" });
  } catch (error) {
    console.error(`Seite nicht erreichbar: ${error.message}`);
    console.error("Läuft der Dev-Server? -> npm run dev");
    await browser.close();
    process.exit(EXIT_SETUP);
  }

  const results = [];
  for (const check of checks) {
    try {
      const detail = await check.run(page, ctx);
      results.push({ name: check.name, ok: true, detail: detail ?? "" });
      console.log(`  OK   ${check.name}  —  ${detail}`);
    } catch (error) {
      const detail = error.message.split("\n")[0];
      results.push({ name: check.name, ok: false, detail });

      // Ein Screenshot im Fehlerfall spart oft die halbe Fehlersuche.
      const shot = `check-fehler-${results.length}.png`;
      await page.screenshot({ path: shot }).catch(() => {});
      console.log(`  FEHL ${check.name}  —  ${detail}`);
      console.log(`       Screenshot: ${shot}`);
    }
  }

  await browser.close();

  const failed = results.filter((r) => !r.ok);
  console.log(
    `\n${results.length - failed.length}/${results.length} Prüfungen bestanden` +
      (failed.length ? ` — offen: ${failed.map((f) => f.name).join(", ")}\n` : "\n"),
  );

  process.exit(failed.length ? EXIT_FAILED : EXIT_OK);
}

await main();
