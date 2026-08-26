/**
 * Datenschicht des Contentplaners.
 *
 * Alles liegt lokal im Browser. Kein Server, kein Konto. Auf dem iPhone heisst
 * das: die Daten haengen an dieser einen Installation. Deshalb gibt es Export
 * und Import als JSON, das ist das Backup.
 *
 * Wiederholungen werden NICHT als viele Einzeltermine gespeichert, sondern als
 * Regel am Eintrag. Beim Anzeigen eines Zeitraums werden daraus die einzelnen
 * Vorkommen berechnet. Sonst muellt eine taegliche Serie die Datei zu und laesst
 * sich nachtraeglich nicht mehr sauber aendern.
 */

const KEY = "contentplaner.v1";

export const STATUS = [
  { id: "idee", name: "Idee", farbe: "#6B7C93" },
  { id: "skript", name: "Skript", farbe: "#8E6FD8" },
  { id: "gedreht", name: "Gedreht", farbe: "#0B76D1" },
  { id: "schnitt", name: "Im Schnitt", farbe: "#D8922F" },
  { id: "fertig", name: "Fertig", farbe: "#18C7D8" },
  { id: "online", name: "Veroeffentlicht", farbe: "#2E9E62" },
];

export const KANAL_FARBEN = [
  "#0B76D1", "#18C7D8", "#C79A4E", "#2E9E62",
  "#8E6FD8", "#D8922F", "#D2544F", "#5A8BB0",
];

function startzustand() {
  return {
    kanaele: [
      { id: k(), name: "HausRund", farbe: "#C79A4E", sichtbar: true },
      { id: k(), name: "Syncrate", farbe: "#0B76D1", sichtbar: true },
    ],
    formate: [],
    eintraege: [],
  };
}

export function k() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

let daten = laden();

function laden() {
  try {
    const roh = localStorage.getItem(KEY);
    if (!roh) return startzustand();
    const d = JSON.parse(roh);
    // Fehlende Felder auffuellen, damit aeltere Staende nicht crashen
    d.kanaele ||= [];
    d.formate ||= [];
    d.eintraege ||= [];
    return d;
  } catch (e) {
    console.warn("Daten unlesbar, starte neu", e);
    return startzustand();
  }
}

function sichern() {
  localStorage.setItem(KEY, JSON.stringify(daten));
  abonnenten.forEach((f) => f());
}

const abonnenten = new Set();
export function beiAenderung(f) {
  abonnenten.add(f);
  return () => abonnenten.delete(f);
}

/* ------------------------------------------------------------------ Kanaele */

export const kanaele = () => daten.kanaele;
export const kanal = (id) => daten.kanaele.find((x) => x.id === id);

export function kanalSpeichern(entwurf) {
  if (entwurf.id) {
    Object.assign(kanal(entwurf.id), entwurf);
  } else {
    daten.kanaele.push({
      id: k(),
      sichtbar: true,
      farbe: KANAL_FARBEN[daten.kanaele.length % KANAL_FARBEN.length],
      ...entwurf,
    });
  }
  sichern();
}

export function kanalLoeschen(id) {
  daten.kanaele = daten.kanaele.filter((x) => x.id !== id);
  daten.formate = daten.formate.filter((x) => x.kanalId !== id);
  daten.eintraege = daten.eintraege.filter((x) => x.kanalId !== id);
  sichern();
}

export function sichtbarkeitUmschalten(id) {
  const kn = kanal(id);
  kn.sichtbar = !kn.sichtbar;
  sichern();
}

/* ------------------------------------------------------------------ Formate */

export const formate = (kanalId) =>
  daten.formate.filter((f) => !kanalId || f.kanalId === kanalId);
export const format = (id) => daten.formate.find((x) => x.id === id);

export function formatSpeichern(entwurf) {
  if (entwurf.id) {
    Object.assign(format(entwurf.id), entwurf);
  } else {
    daten.formate.push({ id: k(), ...entwurf });
  }
  sichern();
}

export function formatLoeschen(id) {
  daten.formate = daten.formate.filter((x) => x.id !== id);
  daten.eintraege.forEach((e) => {
    if (e.formatId === id) e.formatId = null;
  });
  sichern();
}

/* ---------------------------------------------------------------- Eintraege */

export const eintraege = () => daten.eintraege;
export const eintrag = (id) => daten.eintraege.find((x) => x.id === id);

export function eintragSpeichern(entwurf) {
  if (entwurf.id) {
    Object.assign(eintrag(entwurf.id), entwurf);
  } else {
    daten.eintraege.push({ id: k(), status: "idee", ...entwurf });
  }
  sichern();
}

export function eintragLoeschen(id) {
  daten.eintraege = daten.eintraege.filter((x) => x.id !== id);
  sichern();
}

/**
 * Einzelnes Vorkommen einer Serie absagen. Das Datum landet in einer
 * Ausnahmeliste am Eintrag, die Serie selbst bleibt unveraendert.
 */
export function vorkommenAbsagen(id, datumISO) {
  const e = eintrag(id);
  e.ausnahmen ||= [];
  if (!e.ausnahmen.includes(datumISO)) e.ausnahmen.push(datumISO);
  sichern();
}

/* --------------------------------------------------------- Export und Import */

export function exportieren() {
  return JSON.stringify(daten, null, 2);
}

export function importieren(text) {
  const neu = JSON.parse(text);
  if (!neu.kanaele || !neu.eintraege) throw new Error("Kein Contentplaner-Backup");
  daten = neu;
  sichern();
}

export function allesLoeschen() {
  daten = startzustand();
  sichern();
}
