"use client";

import { useEffect, useState } from "react";

import { applyThemeChoice, readThemeChoice } from "../lib/iss";

const OPTIONS = [
  { value: "system", label: "System" },
  { value: "light", label: "Hell" },
  { value: "dark", label: "Dunkel" },
];

/**
 * Umschalter für das Erscheinungsbild.
 *
 * Ein Auswahlfeld statt eines Schalters: „folgt dem System“ ist ein eigener
 * Zustand und muss erreichbar bleiben – ein Zwei-Zustands-Schalter kennt
 * keinen Weg dorthin zurück. Auswahlfelder bringen Tastatur- und
 * Screenreader-Verhalten außerdem mit, statt es nachzubauen.
 *
 * Das Erscheinungsbild selbst setzt bereits ein Skript im Layout, bevor der
 * Browser zeichnet. Diese Komponente liest die Wahl nur nach, damit das Feld
 * den richtigen Eintrag zeigt – deshalb der Effekt und der Startwert
 * „system“: Vor der Hydration ist der Speicher nicht lesbar.
 */
export default function ColorScheme() {
  const [choice, setChoice] = useState("system");

  useEffect(() => {
    setChoice(readThemeChoice());
  }, []);

  function handleChange(event) {
    const next = event.target.value;
    applyThemeChoice(next);
    setChoice(next);
  }

  return (
    <p className="field">
      <label className="field__label" htmlFor="theme">
        Darstellung
      </label>
      <select id="theme" className="field__select" value={choice} onChange={handleChange}>
        {OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </p>
  );
}
