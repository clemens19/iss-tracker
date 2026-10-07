import Script from "next/script";
import { IBM_Plex_Mono, Instrument_Sans } from "next/font/google";

import { THEME_COLORS, THEME_SCRIPT } from "./lib/iss";
import "./globals.css";

const uiFont = Instrument_Sans({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-ui",
});

const monoFont = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  display: "swap",
  variable: "--font-mono",
});

export const metadata = {
  title: "ISS Live-Tracker",
  description:
    "Die Internationale Raumstation live auf der Karte: Position, Höhe, Geschwindigkeit und Besatzung.",
};

export const viewport = {
  // Zwei Angaben statt einer: Die Browserleiste soll dem Betriebssystem
  // folgen. Wählt der Nutzer ausdrücklich, zieht der Umschalter nach.
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: THEME_COLORS.light },
    { media: "(prefers-color-scheme: dark)", color: THEME_COLORS.dark },
  ],
};

export default function RootLayout({ children }) {
  return (
    // `suppressHydrationWarning` ist hier kein Trick, sondern der dafür
    // vorgesehene Weg: Das Skript unten setzt `data-theme` am <html>, bevor
    // React hydratisiert. React würde die Abweichung sonst als Fehler melden.
    <html lang="de" className={`${uiFont.variable} ${monoFont.variable}`} suppressHydrationWarning>
      <body>
        {/* `beforeInteractive` landet im <head> und läuft, bevor der Browser
            das erste Bild zeichnet – nur so blitzt das falsche Erscheinungs-
            bild beim Neuladen nicht auf. */}
        {/* `id` nicht „theme“ nennen: Das trägt schon das Auswahlfeld in der
            Kopfzeile, und IDs müssen eindeutig bleiben. */}
        <Script
          id="theme-init"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }}
        />
        {children}
      </body>
    </html>
  );
}
