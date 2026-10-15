/**
 * Gemeinsamer Zustand der Oberflaeche: welcher Bereich, welches Projekt,
 * welche Plattform. Wird pro Geraet gemerkt, damit die App dort weitermacht,
 * wo man aufgehoert hat.
 */

import * as S from "./store.js";
import * as D from "./datum.js";

const KEY = "contentplaner.ansicht";

function gemerkt() {
  try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; }
}

export const Z = {
  bereich: "kalender",    // kalender | formate | analytics | mehr
  projektId: null,        // null = alle Projekte
  plattformId: null,      // null = alle Plattformen des Projekts
  ansicht: "monat",       // Kalender: monat | woche | agenda
  zeitraum: 28,           // Analytics: Tage, oder "eigen"
  eigenVon: "", eigenBis: "",
  ...gemerkt(),
  anker: D.heute(),
  gewaehlt: D.heute(),
};

// Gemerkte Auswahl kann auf etwas zeigen, das es nicht mehr gibt
if (Z.projektId && !S.projekt(Z.projektId)) { Z.projektId = null; Z.plattformId = null; }
if (Z.plattformId && !S.plattformVon(Z.plattformId)) Z.plattformId = null;

let zeichner = () => {};
export const beimZeichnen = (f) => (zeichner = f);

export function neu(aenderung = {}) {
  Object.assign(Z, aenderung);
  try {
    const { bereich, projektId, plattformId, ansicht, zeitraum, eigenVon, eigenBis } = Z;
    localStorage.setItem(KEY, JSON.stringify({ bereich, projektId, plattformId, ansicht, zeitraum, eigenVon, eigenBis }));
  } catch { /* privates Fenster */ }
  zeichner();
}

/** Plattform-IDs, die der Filter gerade zeigt. */
export function aktivePlattformIds() {
  if (Z.plattformId) return [Z.plattformId];
  return S.plattformen(Z.projektId).map((p) => p.id);
}

/** Projekte, die der Filter gerade zeigt (nur sichtbare, wenn "alle"). */
export function aktiveProjekte() {
  if (Z.projektId) return [S.projekt(Z.projektId)].filter(Boolean);
  return S.projekte().filter((p) => p.sichtbar);
}

/** Passt ein Kalendereintrag zum Filter? */
export function eintragPasst(e) {
  const projekte = new Set(aktiveProjekte().map((p) => p.id));
  if (!projekte.has(e.projektId)) return false;
  if (!Z.plattformId) return true;
  // Eintraege ohne Plattformwahl gelten fuer alle Plattformen des Projekts
  return !e.plattformIds?.length || e.plattformIds.includes(Z.plattformId);
}
