/**
 * Datenschicht. Alles liegt lokal im Browser (bzw. spaeter in der App).
 *
 * Aufbau:
 *   projekte     Marke oder Kanal, z.B. Astromaster. Hat Plattformen
 *                (Instagram, TikTok, YouTube ...), jede mit eigenem Handle.
 *   formate      wiederkehrende Videoarten je Projekt, optional mit Saeule.
 *   eintraege    Kalendereintraege. Gehoeren zu einem Projekt und zu einer
 *                oder mehreren Plattformen.
 *   reihen       importierte Content-Reihenfolgen (z.B. Astromaster 520 Videos).
 *   messungen    Analytics-Werte je Plattform fuer einen Tag oder Zeitraum.
 *   einnahmen    Geldeingaenge je Projekt/Plattform.
 *   verbindungen Zugangsdaten der Schnittstellen je Plattform.
 *
 * Speicher ist austauschbar (SPEICHER unten). Wird die Seite spaeter mit
 * Capacitor zur App verpackt, kommt hier Capacitor Preferences rein, sonst
 * aendert sich nichts.
 *
 * Wiederholungen bleiben eine Regel am Eintrag, keine Einzeltermine.
 * Datumsangaben laufen als Text "JJJJ-MM-TT" durch, nie als Date-Objekt.
 */

const KEY = "contentplaner.v2";
const ALT_KEY = "contentplaner.v1";

const SPEICHER = {
  lesen: (k) => localStorage.getItem(k),
  schreiben: (k, w) => localStorage.setItem(k, w),
};

export const STATUS = [
  { id: "idee", name: "Idee", farbe: "#6B7C93" },
  { id: "skript", name: "Skript", farbe: "#8E6FD8" },
  { id: "gedreht", name: "Produziert", farbe: "#0B76D1" },
  { id: "schnitt", name: "Im Schnitt", farbe: "#D8922F" },
  { id: "fertig", name: "Fertig", farbe: "#18A7B8" },
  { id: "online", name: "Veröffentlicht", farbe: "#2E9E62" },
];

export const PLATTFORM_TYPEN = [
  { id: "instagram", name: "Instagram", farbe: "#D6249F" },
  { id: "tiktok", name: "TikTok", farbe: "#101828" },
  { id: "youtube", name: "YouTube", farbe: "#E62117" },
  { id: "facebook", name: "Facebook", farbe: "#1877F2" },
  { id: "pinterest", name: "Pinterest", farbe: "#BD081C" },
  { id: "linkedin", name: "LinkedIn", farbe: "#0A66C2" },
];
export const plattformTyp = (id) => PLATTFORM_TYPEN.find((t) => t.id === id) || { id, name: id, farbe: "#6B7C93" };

export const PROJEKT_FARBEN = [
  "#0B76D1", "#18C7D8", "#C79A4E", "#2E9E62",
  "#8E6FD8", "#D8922F", "#D2544F", "#5A8BB0",
];

/**
 * Kennzahlen. art "stand" = Zustand an einem Tag (Follower), Vergleich ist
 * Ende minus Anfang. art "summe" = Bewegung pro Tag, wird aufaddiert.
 */
export const METRIKEN = [
  { id: "follower", name: "Follower", art: "stand" },
  { id: "neu", name: "Neue Follower", art: "summe" },
  { id: "verloren", name: "Entfolgt", art: "summe" },
  { id: "aufrufe", name: "Aufrufe", art: "summe" },
  { id: "reichweite", name: "Reichweite", art: "summe" },
  { id: "interagierende", name: "Interagierende Konten", art: "summe" },
  { id: "profilaufrufe", name: "Profilaufrufe", art: "summe" },
  { id: "interaktionen", name: "Interaktionen", art: "summe" },
  { id: "likes", name: "Likes", art: "summe" },
  { id: "kommentare", name: "Kommentare", art: "summe" },
  { id: "geteilt", name: "Geteilt", art: "summe" },
  { id: "gespeichert", name: "Gespeichert", art: "summe" },
  { id: "reposts", name: "Reposts", art: "summe" },
  { id: "antworten", name: "Antworten", art: "summe" },
  { id: "linkklicks", name: "Link-Klicks", art: "summe" },
  { id: "webklicks", name: "Website-Klicks", art: "summe" },
  { id: "beitraege", name: "Beiträge", art: "stand" },
  { id: "folgt", name: "Gefolgt", art: "stand" },
  { id: "likes_gesamt", name: "Likes gesamt", art: "stand" },
];

export function k() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

const plattform = (typ, handle = "") => ({ id: k(), typ, handle, sichtbar: true });

function startzustand() {
  return {
    version: 2,
    projekte: [astromaster(),
      { id: k(), name: "HausRund", farbe: "#C79A4E", sichtbar: true,
        plattformen: [plattform("instagram"), plattform("tiktok")] },
      { id: k(), name: "SynCrate", farbe: "#0B76D1", sichtbar: true,
        plattformen: [plattform("instagram")] },
    ],
    formate: [], eintraege: [], reihen: [], messungen: [], einnahmen: [], verbindungen: {},
  };
}

function astromaster() {
  const ig = plattform("instagram", "@astromaster.de");
  return {
    id: k(), name: "Astromaster", farbe: "#8E6FD8", sichtbar: true,
    plattformen: [ig, plattform("tiktok", "@astromaster.de")],
    _start: { plattformId: ig.id },
  };
}

let daten = laden();

function laden() {
  try {
    const roh = SPEICHER.lesen(KEY);
    if (roh) return auffuellen(JSON.parse(roh));
    const alt = SPEICHER.lesen(ALT_KEY);
    if (alt) {
      const d = ausV1(JSON.parse(alt));
      SPEICHER.schreiben(KEY, JSON.stringify(d));
      return d;
    }
    const d = startzustand();
    startwerte(d);
    return d;
  } catch (e) {
    console.warn("Daten unlesbar, starte neu", e);
    return startzustand();
  }
}

/** Stand der ersten Version (Kanaele ohne Plattformen) uebernehmen. */
function ausV1(v1) {
  const d = {
    version: 2,
    projekte: (v1.kanaele || []).map((kn) => ({
      ...kn, name: kn.name === "Syncrate" ? "SynCrate" : kn.name,
      plattformen: [plattform("instagram")],
    })),
    formate: (v1.formate || []).map(({ kanalId, ...f }) => ({ ...f, projektId: kanalId })),
    eintraege: (v1.eintraege || []).map(({ kanalId, ...e }) => ({ ...e, projektId: kanalId, plattformIds: [] })),
    reihen: [], messungen: [], einnahmen: [], verbindungen: {},
  };
  if (!d.projekte.some((p) => p.name === "Astromaster")) d.projekte.unshift(astromaster());
  startwerte(d);
  return d;
}

/** Bekannter Stand vom 15.10.2026, damit die Kurve einen Startpunkt hat. */
function startwerte(d) {
  const am = d.projekte.find((p) => p._start);
  if (!am) return;
  d.messungen.push({ id: k(), plattformId: am._start.plattformId, von: "2026-10-15", bis: "2026-10-15",
                     quelle: "manuell", werte: { follower: 3013 } });
  delete am._start;
}

function auffuellen(d) {
  for (const f of ["projekte", "formate", "eintraege", "reihen", "messungen", "einnahmen"]) d[f] ||= [];
  d.verbindungen ||= {};
  d.projekte.forEach((p) => (p.plattformen ||= []));
  return d;
}

function sichern() {
  SPEICHER.schreiben(KEY, JSON.stringify(daten));
  abonnenten.forEach((f) => f());
}

const abonnenten = new Set();
export function beiAenderung(f) {
  abonnenten.add(f);
  return () => abonnenten.delete(f);
}

/* ----------------------------------------------------------------- Projekte */

export const projekte = () => daten.projekte;
export const projekt = (id) => daten.projekte.find((x) => x.id === id);

/** Alle Plattformen, optional nur eines Projekts. Mit Verweis aufs Projekt. */
export function plattformen(projektId) {
  return daten.projekte
    .filter((p) => !projektId || p.id === projektId)
    .flatMap((p) => p.plattformen.map((pl) => ({ ...pl, projekt: p })));
}
export const plattformVon = (id) => plattformen().find((p) => p.id === id);

export function projektSpeichern(entwurf) {
  if (entwurf.id && projekt(entwurf.id)) {
    Object.assign(projekt(entwurf.id), entwurf);
  } else {
    daten.projekte.push({
      id: k(), sichtbar: true, plattformen: [],
      farbe: PROJEKT_FARBEN[daten.projekte.length % PROJEKT_FARBEN.length],
      ...entwurf,
    });
  }
  sichern();
}

export function projektLoeschen(id) {
  const p = projekt(id);
  const plIds = new Set(p.plattformen.map((x) => x.id));
  daten.projekte = daten.projekte.filter((x) => x.id !== id);
  daten.formate = daten.formate.filter((x) => x.projektId !== id);
  daten.eintraege = daten.eintraege.filter((x) => x.projektId !== id);
  daten.reihen = daten.reihen.filter((x) => x.projektId !== id);
  daten.einnahmen = daten.einnahmen.filter((x) => x.projektId !== id);
  daten.messungen = daten.messungen.filter((x) => !plIds.has(x.plattformId));
  plIds.forEach((x) => delete daten.verbindungen[x]);
  sichern();
}

export const neuePlattform = plattform;

/* ------------------------------------------------------------------ Formate */

export const formate = (projektId) =>
  daten.formate.filter((f) => !projektId || f.projektId === projektId);
export const format = (id) => daten.formate.find((x) => x.id === id);

export function formatSpeichern(entwurf) {
  if (entwurf.id && format(entwurf.id)) Object.assign(format(entwurf.id), entwurf);
  else daten.formate.push({ id: k(), ...entwurf });
  sichern();
}

export function formatLoeschen(id) {
  daten.formate = daten.formate.filter((x) => x.id !== id);
  daten.eintraege.forEach((e) => { if (e.formatId === id) e.formatId = null; });
  sichern();
}

/* ---------------------------------------------------------------- Eintraege */

export const eintraege = () => daten.eintraege;
export const eintrag = (id) => daten.eintraege.find((x) => x.id === id);

export function eintragSpeichern(entwurf) {
  if (entwurf.id && eintrag(entwurf.id)) Object.assign(eintrag(entwurf.id), entwurf);
  else daten.eintraege.push({ id: k(), status: "idee", plattformIds: [], ...entwurf });
  sichern();
}

export function eintragLoeschen(id) {
  daten.eintraege = daten.eintraege.filter((x) => x.id !== id);
  // Ein geloeschter Termin gibt sein Video in der Reihenfolge wieder frei
  daten.reihen.forEach((r) => r.videos.forEach((v) => { if (v.eintragId === id) delete v.eintragId; }));
  sichern();
}

export function vorkommenAbsagen(id, datumISO) {
  const e = eintrag(id);
  e.ausnahmen ||= [];
  if (!e.ausnahmen.includes(datumISO)) e.ausnahmen.push(datumISO);
  sichern();
}

/* ------------------------------------------------------------------- Reihen */

export const reihe = (projektId) => daten.reihen.find((r) => r.projektId === projektId);

/**
 * Die naechsten n offenen Videos der Reihenfolge ab startTag in den Kalender
 * legen, proTag Stueck pro Tag. Gibt die Anzahl zurueck.
 */
export function einplanen(projektId, n, proTag, startTag, plusTage) {
  const r = reihe(projektId);
  if (!r) return 0;
  const p = projekt(projektId);
  const offen = r.videos.filter((v) => v.status !== "fertig" && v.status !== "online" && !v.eintragId);
  let tag = startTag;
  offen.slice(0, n).forEach((v, i) => {
    if (i && i % proTag === 0) tag = plusTage(tag, 1);
    const fm = daten.formate.find((f) => f.projektId === projektId && f.name === v.format);
    const e = { id: k(), titel: `${v.format}: ${v.thema}`, projektId, formatId: fm?.id || null,
                plattformIds: p.plattformen.map((x) => x.id), datum: tag, zeit: "",
                status: "idee", notiz: `Reihenfolge Nr. ${v.nr} · Säule ${v.saeule}`, reiheNr: v.nr };
    daten.eintraege.push(e);
    v.eintragId = e.id;
  });
  sichern();
  return Math.min(n, offen.length);
}

/* ---------------------------------------------------------------- Analytics */

export const messungen = (plattformIds) =>
  daten.messungen.filter((m) => !plattformIds || plattformIds.includes(m.plattformId));

/** Messung speichern. Gleiche Plattform + Zeitraum + Quelle wird ersetzt. */
export function messungSpeichern(m, still = false) {
  const alt = daten.messungen.find((x) => x.plattformId === m.plattformId && x.von === m.von
    && x.bis === m.bis && x.quelle === m.quelle);
  if (alt) alt.werte = { ...alt.werte, ...m.werte };
  else daten.messungen.push({ id: k(), ...m });
  if (!still) sichern();
}

export function messungLoeschen(id) {
  daten.messungen = daten.messungen.filter((x) => x.id !== id);
  sichern();
}

export const einnahmen = (projektIds) =>
  daten.einnahmen.filter((x) => !projektIds || projektIds.includes(x.projektId));

export function einnahmeSpeichern(e) {
  const alt = daten.einnahmen.find((x) => x.id === e.id);
  if (alt) Object.assign(alt, e);
  else daten.einnahmen.push({ id: k(), ...e });
  sichern();
}

export function einnahmeLoeschen(id) {
  daten.einnahmen = daten.einnahmen.filter((x) => x.id !== id);
  sichern();
}

export const verbindung = (plattformId) => daten.verbindungen[plattformId];
export function verbindungSetzen(plattformId, v) {
  if (v) daten.verbindungen[plattformId] = v;
  else delete daten.verbindungen[plattformId];
  sichern();
}
export const speichernAnstossen = sichern;

/* --------------------------------------------------------- Export und Import */

export function exportieren() {
  return JSON.stringify(daten, null, 2);
}

/**
 * Zwei Arten von Dateien:
 *  - komplettes Backup (hat "projekte"): ersetzt alles
 *  - Projekt-Import (typ "projekt-import"): fuehrt zusammen, ersetzt nur die
 *    importierten Formate und die Reihenfolge dieses Projekts, Kalender und
 *    Analytics bleiben unberuehrt
 */
export function importieren(text) {
  const neu = JSON.parse(text);
  if (neu.typ === "projekt-import") return projektImport(neu);
  if (neu.kanaele && !neu.projekte) { daten = ausV1(neu); sichern(); return "Altes Backup übernommen."; }
  if (!neu.projekte || !neu.eintraege) throw new Error("Keine Contentplaner-Datei");
  daten = auffuellen(neu);
  sichern();
  return "Backup eingelesen.";
}

function projektImport(imp) {
  let p = daten.projekte.find((x) => x.name.toLowerCase() === imp.projekt.toLowerCase());
  if (!p) {
    p = { id: k(), name: imp.projekt, farbe: imp.farbe || PROJEKT_FARBEN[0], sichtbar: true,
          plattformen: (imp.plattformen || []).map((x) => plattform(x.typ, x.handle)) };
    daten.projekte.push(p);
  }

  // Formate: importierte (quelle "import") ersetzen, eigene behalten, IDs stabil halten
  const vorher = new Map(daten.formate.filter((f) => f.projektId === p.id).map((f) => [f.name, f]));
  for (const f of imp.formate || []) {
    const alt = vorher.get(f.name);
    if (alt) Object.assign(alt, { ...f, projektId: p.id, quelle: "import" });
    else daten.formate.push({ id: k(), caption: "", ...f, projektId: p.id, quelle: "import" });
  }
  // Importierte Formate, die es in der neuen Liste nicht mehr gibt, entfernen, solange kein Eintrag daran haengt
  if (imp.formate) {
    const namen = new Set(imp.formate.map((f) => f.name));
    const benutzt = new Set(daten.eintraege.map((e) => e.formatId).filter(Boolean));
    daten.formate = daten.formate.filter((f) => f.projektId !== p.id || f.quelle !== "import" || namen.has(f.name) || benutzt.has(f.id));
  }

  // Reihenfolge: Verknuepfungen zu Kalendereintraegen ueber die Nr. erhalten
  if (imp.reihenfolge) {
    const alt = reihe(p.id);
    const links = new Map((alt?.videos || []).filter((v) => v.eintragId).map((v) => [v.nr, v.eintragId]));
    const r = { projektId: p.id, saeulen: imp.saeulen || [], regeln: imp.regeln || [],
                stufen: imp.stufen || [], stand: imp.stand || "",
                videos: imp.reihenfolge.map((v) => (links.has(v.nr) ? { ...v, eintragId: links.get(v.nr) } : v)) };
    daten.reihen = daten.reihen.filter((x) => x.projektId !== p.id).concat(r);
    sendeplanEintragen(p, r);
  }
  sichern();
  const n = imp.reihenfolge?.length || 0;
  return `${imp.projekt}: ${imp.formate?.length || 0} Formate${n ? `, ${n} Videos in der Reihenfolge` : ""} übernommen.`;
}

/** Videos mit Tag (Sendeplan vom Mac) als Kalendereinträge anlegen bzw. auf den neuesten Tag schieben.
 *  Verknüpft über planKey; Status und Notizen aus der App bleiben, der Tag kommt immer aus dem Plan. */
function sendeplanEintragen(p, r) {
  const geplant = r.videos.filter((v) => v.datum && v.key);
  if (!geplant.length) return;
  const vorhanden = new Map(daten.eintraege.filter((e) => e.projektId === p.id && e.planKey).map((e) => [e.planKey, e]));
  const keys = new Set(geplant.map((v) => v.key));
  for (const v of geplant) {
    const fm = daten.formate.find((f) => f.projektId === p.id && f.name === v.format);
    // Bei Beziehungen sagt das Unterformat mehr ("Passt nicht zusammen"), sonst das Format ("Top 3")
    const titel = `${v.format === "Beziehungen" ? v.unterformat : v.format}: ${v.thema}`;
    let e = vorhanden.get(v.key);
    if (!e) {
      e = { id: k(), projektId: p.id, plattformIds: p.plattformen.map((x) => x.id), zeit: "", status: "idee", notiz: "", planKey: v.key };
      daten.eintraege.push(e);
    }
    Object.assign(e, { titel, datum: v.datum, formatId: fm?.id || null, reiheNr: v.nr });
    if (v.status === "fertig" && ["idee", "skript", "gedreht", "schnitt"].includes(e.status)) e.status = "fertig";
    if (!e.notiz || e.notiz.startsWith("Nr. ")) e.notiz = `Nr. ${v.nr} · ${v.saeule} · ${v.unterformat}${v.id ? ` · ${v.id}` : ""}`;
    v.eintragId = e.id;
  }
  // Gepostete Videos mit Postdatum bleiben im Kalender, als veröffentlicht am echten Tag
  for (const v of r.videos.filter((v) => v.status === "online" && v.gepostet_am && v.key)) {
    const e = vorhanden.get(v.key);
    if (!e) continue;
    Object.assign(e, { datum: v.gepostet_am, status: "online" });
    keys.add(v.key);
  }
  // Aus dem Plan gefallene oder schon gepostete Videos (ohne Tag) entfernen, solange sie nur automatisch angelegt sind
  daten.eintraege = daten.eintraege.filter((e) => e.projektId !== p.id || !e.planKey || keys.has(e.planKey) || !["idee", "fertig"].includes(e.status));
}

export function allesLoeschen() {
  daten = startzustand();
  startwerte(daten);
  sichern();
}
