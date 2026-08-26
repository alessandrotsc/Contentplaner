/**
 * Datums- und Wiederholungslogik.
 *
 * Alle Datumsangaben laufen als ISO-Tag "JJJJ-MM-TT" durch die App, nie als
 * Date-Objekt in der Datenhaltung. Grund: Date rechnet in UTC, und dann
 * verschiebt sich in der Sommerzeit ein Termin um einen Tag nach hinten.
 * Gerechnet wird immer auf lokaler Mittagszeit, da ist der Abstand zur
 * Zeitumstellung am groessten.
 */

export const WOCHENTAGE = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];
export const MONATE = [
  "Januar", "Februar", "März", "April", "Mai", "Juni",
  "Juli", "August", "September", "Oktober", "November", "Dezember",
];

export function iso(d) {
  const j = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const t = String(d.getDate()).padStart(2, "0");
  return `${j}-${m}-${t}`;
}

export function ausIso(s) {
  const [j, m, t] = s.split("-").map(Number);
  return new Date(j, m - 1, t, 12, 0, 0);
}

export const heute = () => iso(new Date());

export function plusTage(s, n) {
  const d = ausIso(s);
  d.setDate(d.getDate() + n);
  return iso(d);
}

export function plusMonate(s, n) {
  const d = ausIso(s);
  const tag = d.getDate();
  d.setDate(1);
  d.setMonth(d.getMonth() + n);
  // Auf den 31. eines kurzen Monats schieben wuerde in den Folgemonat rutschen
  const letzter = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(tag, letzter));
  return iso(d);
}

/** Montag = 0, Sonntag = 6. Die deutsche Woche beginnt am Montag. */
export function wochentag(s) {
  return (ausIso(s).getDay() + 6) % 7;
}

export function montagDerWoche(s) {
  return plusTage(s, -wochentag(s));
}

export function tageZwischen(a, b) {
  return Math.round((ausIso(b) - ausIso(a)) / 86400000);
}

export function langesDatum(s) {
  const d = ausIso(s);
  return `${WOCHENTAGE[wochentag(s)]}, ${d.getDate()}. ${MONATE[d.getMonth()]} ${d.getFullYear()}`;
}

export function kurzesDatum(s) {
  const d = ausIso(s);
  return `${d.getDate()}.${d.getMonth() + 1}.`;
}

/**
 * Das 6x7-Raster einer Monatsansicht, wie Google Kalender es zeigt:
 * immer sechs volle Wochen, angeschnittene Tage aus Vor- und Folgemonat
 * werden mitgezeichnet, damit die Hoehe nicht springt.
 */
export function monatsRaster(jahr, monat) {
  const erster = iso(new Date(jahr, monat, 1));
  const start = montagDerWoche(erster);
  return Array.from({ length: 42 }, (_, i) => plusTage(start, i));
}

/* ------------------------------------------------------------ Wiederholungen */

export const WIEDERHOLUNGEN = [
  { id: "einmal", name: "Einmalig" },
  { id: "taeglich", name: "Jeden Tag" },
  { id: "woechentlich", name: "Jede Woche" },
  { id: "zweiwoechentlich", name: "Alle zwei Wochen" },
  { id: "monatlich", name: "Jeden Monat" },
  { id: "benutzerdefiniert", name: "Benutzerdefiniert" },
];

/**
 * Faellt ein Serientermin auf diesen Tag?
 *
 * regel = {
 *   art: "einmal" | "taeglich" | "woechentlich" | "zweiwoechentlich"
 *        | "monatlich" | "benutzerdefiniert",
 *   intervall: Zahl,        nur bei benutzerdefiniert, z.B. alle 3
 *   einheit: "tag"|"woche"|"monat",   nur bei benutzerdefiniert
 *   tage: [0..6],           nur bei woechentlich und benutzerdefiniert/woche
 *   bis: ISO-Tag oder leer
 * }
 */
export function faelltAuf(eintrag, tag) {
  const start = eintrag.datum;
  if (tag < start) return false;
  if (eintrag.ausnahmen?.includes(tag)) return false;

  const r = eintrag.wiederholung;
  if (!r || r.art === "einmal") return tag === start;
  if (r.bis && tag > r.bis) return false;

  const abstand = tageZwischen(start, tag);

  switch (r.art) {
    case "taeglich":
      return true;

    case "woechentlich":
      // Ohne gewaehlte Wochentage gilt der Wochentag des Starttags
      if (r.tage?.length) return r.tage.includes(wochentag(tag));
      return abstand % 7 === 0;

    case "zweiwoechentlich":
      if (r.tage?.length) {
        const wochen = Math.floor(tageZwischen(montagDerWoche(start), tag) / 7);
        return wochen % 2 === 0 && r.tage.includes(wochentag(tag));
      }
      return abstand % 14 === 0;

    case "monatlich":
      return ausIso(tag).getDate() === ausIso(start).getDate();

    case "benutzerdefiniert": {
      const n = Math.max(1, r.intervall || 1);
      if (r.einheit === "tag") return abstand % n === 0;
      if (r.einheit === "woche") {
        const wochen = Math.floor(tageZwischen(montagDerWoche(start), tag) / 7);
        if (wochen % n !== 0) return false;
        return r.tage?.length ? r.tage.includes(wochentag(tag))
                              : wochentag(tag) === wochentag(start);
      }
      if (r.einheit === "monat") {
        const d1 = ausIso(start), d2 = ausIso(tag);
        const monate = (d2.getFullYear() - d1.getFullYear()) * 12
                     + (d2.getMonth() - d1.getMonth());
        return monate % n === 0 && d2.getDate() === d1.getDate();
      }
      return false;
    }
    default:
      return false;
  }
}

export function regelText(r) {
  if (!r || r.art === "einmal") return "Einmalig";
  const bis = r.bis ? `, bis ${kurzesDatum(r.bis)}` : "";
  const tage = r.tage?.length
    ? " " + r.tage.slice().sort().map((i) => WOCHENTAGE[i]).join(", ")
    : "";
  switch (r.art) {
    case "taeglich": return "Jeden Tag" + bis;
    case "woechentlich": return "Jede Woche" + tage + bis;
    case "zweiwoechentlich": return "Alle zwei Wochen" + tage + bis;
    case "monatlich": return "Jeden Monat" + bis;
    case "benutzerdefiniert": {
      const n = r.intervall || 1;
      const e = { tag: "Tage", woche: "Wochen", monat: "Monate" }[r.einheit] || "Tage";
      return `Alle ${n} ${e}${tage}${bis}`;
    }
    default: return "Einmalig";
  }
}
