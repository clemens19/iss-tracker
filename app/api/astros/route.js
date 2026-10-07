import { NextResponse } from "next/server";

/**
 * Proxy für die Besatzungsliste (Bonus B4).
 *
 * Open Notify stellt `astros.json` nur über HTTP bereit. Eine HTTPS-Seite darf
 * das nicht direkt aufrufen (Mixed Content), deshalb holt dieser Route Handler
 * die Daten serverseitig und reicht sie über HTTPS weiter. Das ist die einzige
 * Server-Route der App – die Live-Position kommt direkt aus dem Browser.
 */

const SOURCE = "http://api.open-notify.org/astros.json";

export const revalidate = 300;

export async function GET() {
  try {
    const response = await fetch(SOURCE, {
      headers: { accept: "application/json" },
      next: { revalidate: 300 },
      signal: AbortSignal.timeout(8000),
    });

    if (!response.ok) {
      throw new Error(`Quelle antwortete mit HTTP ${response.status}`);
    }

    const payload = await response.json();
    const people = Array.isArray(payload?.people) ? payload.people : [];

    // Die Quelle listet auch Besatzungen anderer Stationen mit auf.
    const issCrew = people.filter((person) => person?.craft === "ISS");

    return NextResponse.json(
      {
        number: issCrew.length,
        people: issCrew.map((person) => ({ name: person.name })),
        fetchedAt: new Date().toISOString(),
      },
      {
        // Die Quelle ist zeitweise langsam oder nicht erreichbar. Ein
        // Zwischenspeicher an der Kante hält die Liste verfügbar und
        // entlastet Open Notify.
        headers: {
          "Cache-Control": "public, s-maxage=300, stale-while-revalidate=3600",
        },
      },
    );
  } catch {
    return NextResponse.json(
      { error: "Die Besatzungsliste ist derzeit nicht abrufbar." },
      { status: 503 },
    );
  }
}
