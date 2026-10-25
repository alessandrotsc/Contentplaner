/**
 * Kalender nach Google-Kalender-Vorbild: Monat, Woche, Liste.
 * Zeigt nur, was zum Projekt- und Plattformfilter passt.
 */

import * as S from "./store.js";
import * as D from "./datum.js";
import { Z, neu, eintragPasst } from "./zustand.js";
import { el, ikon, ikonKnopf, dialog, feld, pillen, inZwischenablage } from "./ui.js";
import { zuEintrag, postenDialog, istErledigt, fortschritt, alleErledigen } from "./posten.js";

function anTag(tag) {
  return S.eintraege()
    .filter((e) => eintragPasst(e) && D.faelltAuf(e, tag))
    .sort((a, b) => (a.zeit || "99").localeCompare(b.zeit || "99"));
}

const statusVon = (id) => S.STATUS.find((s) => s.id === id) || S.STATUS[0];
const farbeVon = (e) => S.projekt(e.projektId)?.farbe || "#888";

/* --------------------------------------------------------- Kopf-Leiste */

export function kalenderKopf() {
  const d = D.ausIso(Z.anker);
  let titel = `${D.MONATE[d.getMonth()]} ${d.getFullYear()}`;
  if (Z.ansicht === "woche") {
    const mo = D.montagDerWoche(Z.anker);
    titel = `${D.kurzesDatum(mo)} bis ${D.kurzesDatum(D.plusTage(mo, 6))}`;
  }

  const umschalter = el("div", { class: "segment" },
    [["monat", "Monat"], ["woche", "Woche"], ["agenda", "Liste"]].map(([id, n]) =>
      el("button", { class: Z.ansicht === id ? "an" : "", text: n, onclick: () => neu({ ansicht: id }) })));

  return el("div", { class: "kal-kopf" },
    el("div", { class: "kal-zeile" },
      el("div", { class: "kal-titel", text: titel }),
      el("button", { class: "heute-knopf", text: "Heute",
        onclick: () => neu({ anker: D.heute(), gewaehlt: D.heute() }) }),
      ikonKnopf("zurueck", () => blaettern(-1)),
      ikonKnopf("vor", () => blaettern(1)),
    ),
    umschalter,
    Z.ansicht === "monat" && el("div", { class: "wochentage" },
      D.WOCHENTAGE.map((t) => el("span", { text: t }))),
  );
}

function blaettern(r) {
  if (Z.ansicht === "monat") neu({ anker: D.plusMonate(Z.anker, r) });
  else if (Z.ansicht === "woche") neu({ anker: D.plusTage(Z.anker, 7 * r) });
  else neu({ anker: D.plusTage(Z.anker, 14 * r) });
}

export function kalender() {
  return Z.ansicht === "monat" ? monatsAnsicht()
       : Z.ansicht === "woche" ? wochenAnsicht()
       : agendaAnsicht();
}

/* ------------------------------------------------------------- Monat */

function monatsAnsicht() {
  const d = D.ausIso(Z.anker);
  const tage = D.monatsRaster(d.getFullYear(), d.getMonth());
  const heute = D.heute();
  const raster = el("div", { class: "monat" });

  tage.forEach((tag) => {
    const posten = anTag(tag);
    const klassen = ["zelle"];
    if (D.ausIso(tag).getMonth() !== d.getMonth()) klassen.push("fremd");
    if (tag === heute) klassen.push("heute");
    if (tag === Z.gewaehlt) klassen.push("gewaehlt");

    const zelle = el("div", { class: klassen.join(" "),
      onclick: () => neu({ gewaehlt: tag, anker: tag, ansicht: "agenda" }) },
      el("div", { class: "tageszahl", text: String(D.ausIso(tag).getDate()) }));

    posten.slice(0, 3).forEach((e) => zelle.append(el("div", {
      class: "chip" + (e.status === "online" ? " erledigt" : ""),
      style: { borderLeftColor: farbeVon(e) }, text: e.titel || "Ohne Titel" })));
    if (posten.length > 3) zelle.append(el("div", { class: "mehr", text: `+${posten.length - 3}` }));
    raster.append(zelle);
  });

  return el("div", { class: "blatt" }, raster);
}

/* ------------------------------------------------------------- Woche */

function wochenAnsicht() {
  const mo = D.montagDerWoche(Z.anker);
  const tage = Array.from({ length: 7 }, (_, i) => D.plusTage(mo, i));
  const heute = D.heute();

  const kopfZeile = el("div", { class: "woche-kopf" }, el("div"));
  tage.forEach((tag) => kopfZeile.append(el("div", { class: tag === heute ? "heute" : "" },
    el("div", { class: "wt", text: D.WOCHENTAGE[D.wochentag(tag)] }),
    el("div", { class: "zahl", text: String(D.ausIso(tag).getDate()) }))));

  // Eintraege ohne Uhrzeit kommen in eine Ganztags-Zeile, sonst stapeln sie sich um 9 Uhr
  const ganztag = el("div", { class: "ganztag" }, el("div", { class: "gt-label", text: "ohne Zeit" }));
  tage.forEach((tag) => {
    const sp = el("div");
    anTag(tag).filter((e) => !e.zeit).forEach((e) => sp.append(el("div", {
      class: "gt-chip" + (e.status === "online" ? " erledigt" : ""), style: { borderLeftColor: farbeVon(e) }, text: e.titel || "Ohne Titel",
      onclick: () => oeffnen(e, tag) })));
    ganztag.append(sp);
  });

  const stunden = el("div", { class: "stunde-spalte" });
  for (let h = 0; h < 24; h++) stunden.append(el("div", { text: h ? `${String(h).padStart(2, "0")}:00` : "" }));

  const raster = el("div", { class: "raster" }, stunden);
  tage.forEach((tag) => {
    const spalte = el("div", { class: "tag-spalte",
      onclick: () => { Z.gewaehlt = tag; eintragDialog({ datum: tag }); } });
    for (let h = 0; h < 24; h++) spalte.append(el("div", { class: "stunde-linie" }));
    anTag(tag).filter((e) => e.zeit).forEach((e) => {
      const [hh, mm] = e.zeit.split(":").map(Number);
      spalte.append(el("div", { class: "block" + (e.status === "online" ? " erledigt" : ""),
        style: { top: ((hh + mm / 60) * 52) + "px", height: "48px", borderLeftColor: farbeVon(e) },
        text: e.titel || "Ohne Titel",
        onclick: (ev) => { ev.stopPropagation(); oeffnen(e, tag); } }));
    });
    raster.append(spalte);
  });

  const blatt = el("div", { class: "blatt woche" }, el("div", { class: "woche-oben" }, kopfZeile, ganztag), raster);
  setTimeout(() => { blatt.closest(".inhalt").scrollTop = 7 * 52; }, 0);
  return blatt;
}

/* ------------------------------------------------------------- Liste */

function agendaAnsicht() {
  const box = el("div", { class: "agenda" });
  const heute = D.heute();
  let gefunden = 0;

  for (let i = 0; i < 45; i++) {
    const tag = D.plusTage(Z.anker, i);
    const posten = anTag(tag);
    if (!posten.length) continue;
    gefunden += posten.length;
    const dd = D.ausIso(tag);
    const gruppe = el("div", { class: "agenda-tag" },
      el("div", { class: "agenda-datum" + (tag === heute ? " ist-heute" : "") },
        el("b", { text: `${D.WOCHENTAGE[D.wochentag(tag)]}, ${dd.getDate()}. ${D.MONATE[dd.getMonth()]}` }),
        el("span", { text: tag === heute ? "heute" : `${posten.length} ${posten.length === 1 ? "Post" : "Posts"}` })));
    posten.forEach((e) => gruppe.append(karte(e, tag)));
    box.append(gruppe);
  }

  if (!gefunden) box.append(el("div", { class: "leer",
    text: "Ab hier steht nichts im Plan. Tipp unten rechts auf das Plus oder plane unter Formate die nächsten Videos ein." }));
  return el("div", { class: "blatt" }, box);
}

function plattformIcons(e) {
  const p = S.projekt(e.projektId);
  const ids = e.plattformIds?.length ? e.plattformIds : (p?.plattformen || []).map((x) => x.id);
  return el("span", { class: "pl-icons" },
    ids.map((id) => p?.plattformen.find((x) => x.id === id)).filter(Boolean)
      .map((pl) => ikon(pl.typ, 14)));
}

/** Liegt das fertige Video auf dem Server, zuerst die Posten-Ansicht, sonst gleich bearbeiten. */
function oeffnen(e, tag) {
  const v = zuEintrag(e);
  if (v) postenDialog(e, v, () => eintragDialog(e, tag));
  else eintragDialog(e, tag);
}

function karte(e, tag) {
  const p = S.projekt(e.projektId);
  const fm = e.formatId ? S.format(e.formatId) : null;
  const st = statusVon(e.status);
  const meta = el("div", { class: "karte-meta" });
  [p?.name, fm?.name, e.zeit].filter(Boolean).forEach((t, i) => {
    if (i) meta.append(el("span", { class: "punkt", text: "·" }));
    meta.append(el("span", { text: t }));
  });
  meta.append(plattformIcons(e));
  const vid = zuEintrag(e);
  const [fertigN, gesamtN] = fortschritt(e, vid);
  const erledigt = e.status === "online" || istErledigt(vid) || (gesamtN && fertigN === gesamtN);
  if (!erledigt && vid) meta.append(el("span", { class: "video-bereit", text: "▶ Video bereit" }));
  const serie = e.wiederholung && e.wiederholung.art !== "einmal"
    ? el("div", { class: "karte-meta" }, el("span", { text: D.regelText(e.wiederholung) })) : null;

  // Ein Haken rechts für alles: erledigt = auf allen Plattformen hochgeladen, ohne Rückfrage (User 25.10.2026).
  // Der Eintrag bleibt im Kalender sichtbar (ausgegraut), nur die großen Videodateien verschwinden vom Server.
  const haken = el("button", { class: "fertig-haken" + (erledigt ? " an" : ""), title: erledigt ? "Erledigt" : "Als erledigt abhaken",
    onclick: async (ev) => {
      ev.stopPropagation();
      const wert = !erledigt;
      try { await alleErledigen(e, vid, wert); neu(); }
      catch (err) { alert("Speichern ging nicht: " + err.message); }
    } }, ikon("haken", 20));

  return el("div", { class: "karte" + (erledigt ? " erledigt" : ""), onclick: () => oeffnen(e, tag) },
    el("div", { class: "karte-strich", style: { background: p?.farbe || "#888" } }),
    el("div", { class: "karte-text" },
      el("div", { class: "karte-titel", text: e.titel || "Ohne Titel" }), meta, serie),
    erledigt ? null : el("div", { class: "status-pille", style: { background: st.farbe + "1f", color: st.farbe }, text: st.name }),
    haken,
  );
}

/* ------------------------------------------------------ Eintrag-Dialog */

export function eintragDialog(vorgabe = {}, tagDerSerie = null) {
  const istNeu = !vorgabe.id;
  const startProjekt = Z.projektId || S.projekte()[0]?.id;
  const e = {
    titel: "", projektId: startProjekt, formatId: null,
    plattformIds: Z.plattformId ? [Z.plattformId] : [],
    datum: Z.gewaehlt, zeit: "", status: "idee", caption: "", notiz: "", ablage: "",
    ...structuredClone(vorgabe.id ? S.eintrag(vorgabe.id) || vorgabe : vorgabe),
  };
  e.wiederholung = { art: "einmal", intervall: 1, einheit: "woche", tage: [], bis: "", ...(e.wiederholung || {}) };
  e.plattformIds ||= [];

  const d = dialog(istNeu ? "Neuer Eintrag" : "Eintrag", () => {
    if (!e.titel.trim()) { alert("Der Eintrag braucht einen Titel."); return false; }
    if (e.id && S.eintrag(e.id)?.hochgeladen) e.hochgeladen = S.eintrag(e.id).hochgeladen;  // Häkchen nicht mit altem Stand überschreiben
    S.eintragSpeichern(e);
    neu();
  });

  // Häkchen je Plattform (eingeplant oder hochgeladen), auch ohne Video auf dem Server

  d.inhalt.append(feld("Titel", el("input", { class: "eingabe", value: e.titel,
    placeholder: "z.B. Top 3: Die loyalsten", oninput: (ev) => (e.titel = ev.target.value) })));

  // Projekt, darunter Plattformen und Formate dieses Projekts
  const projektWahl = el("select", { class: "eingabe", onchange: (ev) => {
    e.projektId = ev.target.value; e.plattformIds = []; e.formatId = null; abhaengigeZeichnen();
  }});
  S.projekte().forEach((p) => projektWahl.append(el("option", { value: p.id, selected: p.id === e.projektId }, p.name)));

  const formatWahl = el("select", { class: "eingabe", onchange: (ev) => {
    e.formatId = ev.target.value || null;
    const f = e.formatId && S.format(e.formatId);
    if (f?.caption && !capFeld.value) { capFeld.value = f.caption; e.caption = f.caption; }
  }});
  const plattformBox = el("div", { class: "wahl" });

  function abhaengigeZeichnen() {
    formatWahl.innerHTML = "";
    formatWahl.append(el("option", { value: "" }, "Kein Format"));
    S.formate(e.projektId).forEach((f) => formatWahl.append(el("option", { value: f.id, selected: f.id === e.formatId }, f.name)));

    plattformBox.innerHTML = "";
    const p = S.projekt(e.projektId);
    (p?.plattformen || []).forEach((pl) => {
      const b = el("button", { class: e.plattformIds.includes(pl.id) ? "an" : "",
        onclick: (ev) => {
          ev.preventDefault();
          e.plattformIds = e.plattformIds.includes(pl.id) ? e.plattformIds.filter((x) => x !== pl.id) : [...e.plattformIds, pl.id];
          b.classList.toggle("an");
        } }, ikon(pl.typ, 15), S.plattformTyp(pl.typ).name);
      plattformBox.append(b);
    });
  }
  abhaengigeZeichnen();

  d.inhalt.append(el("div", { class: "zeile-2" }, feld("Projekt", projektWahl), feld("Format", formatWahl)));
  d.inhalt.append(feld("Plattformen", plattformBox,
    el("div", { class: "hinweis", text: "Nichts gewählt heißt: auf allen Plattformen des Projekts." })));

  d.inhalt.append(el("div", { class: "zeile-2" },
    feld("Datum", el("input", { class: "eingabe", type: "date", value: e.datum, onchange: (ev) => (e.datum = ev.target.value) })),
    feld("Uhrzeit", el("input", { class: "eingabe", type: "time", value: e.zeit, onchange: (ev) => (e.zeit = ev.target.value) }))));

  d.inhalt.append(feld("Status", pillen(S.STATUS, e.status, (id) => (e.status = id))));

  // Wiederholung
  const extra = el("div");
  function extraZeichnen() {
    extra.innerHTML = "";
    const r = e.wiederholung;
    if (r.art === "einmal") return;
    if (r.art === "benutzerdefiniert") {
      const zahl = el("input", { class: "eingabe", type: "number", min: "1", value: r.intervall,
        oninput: (ev) => (r.intervall = Math.max(1, +ev.target.value || 1)) });
      const einheit = el("select", { class: "eingabe", onchange: (ev) => { r.einheit = ev.target.value; extraZeichnen(); } });
      [["tag", "Tage"], ["woche", "Wochen"], ["monat", "Monate"]].forEach(([id, n]) =>
        einheit.append(el("option", { value: id, selected: r.einheit === id }, n)));
      extra.append(el("div", { class: "zeile-2" }, feld("Alle", zahl), feld("Einheit", einheit)));
    }
    const brauchtTage = r.art === "woechentlich" || r.art === "zweiwoechentlich"
      || (r.art === "benutzerdefiniert" && r.einheit === "woche");
    if (brauchtTage) {
      const reihe = el("div", { class: "tage-wahl" });
      D.WOCHENTAGE.forEach((name, i) => reihe.append(el("button", {
        class: r.tage.includes(i) ? "an" : "", text: name,
        onclick: (ev) => {
          ev.preventDefault();
          r.tage = r.tage.includes(i) ? r.tage.filter((x) => x !== i) : [...r.tage, i];
          ev.target.classList.toggle("an");
        } })));
      extra.append(feld("An diesen Tagen", reihe,
        el("div", { class: "hinweis", text: "Nichts gewählt heißt: am Wochentag des Startdatums." })));
    }
    extra.append(feld("Endet am", el("input", { class: "eingabe", type: "date", value: r.bis,
      onchange: (ev) => (r.bis = ev.target.value) }), el("div", { class: "hinweis", text: "Leer lassen für unbegrenzt." })));
  }
  d.inhalt.append(feld("Wiederholung", pillen(D.WIEDERHOLUNGEN, e.wiederholung.art, (id) => {
    e.wiederholung.art = id; extraZeichnen();
  }), extra));
  extraZeichnen();

  const capFeld = el("textarea", { class: "eingabe", placeholder: "Text, der unter das Video kommt",
    oninput: (ev) => (e.caption = ev.target.value) });
  capFeld.value = e.caption;
  const kopierKnopf = el("button", { class: "kopieren", onclick: (ev) => { ev.preventDefault(); inZwischenablage(capFeld.value, kopierKnopf); } },
    ikon("kopieren"), el("span", { text: "Caption kopieren" }));
  d.inhalt.append(feld("Caption", capFeld, kopierKnopf));

  const notizFeld = el("textarea", { class: "eingabe", placeholder: "Hook, Ablauf, To-dos", oninput: (ev) => (e.notiz = ev.target.value) });
  notizFeld.value = e.notiz;
  d.inhalt.append(feld("Notiz", notizFeld));

  d.inhalt.append(feld("Ablageort", el("input", { class: "eingabe", value: e.ablage,
    placeholder: "z.B. Drive › Astromaster › Top 3 Loyal", oninput: (ev) => (e.ablage = ev.target.value) })));

  const vorschau = el("div");
  function vorschauZeichnen() {
    vorschau.innerHTML = "";
    if (!e.bild) return;
    vorschau.append(el("img", { class: "anhang-vorschau", src: e.bild }),
      el("button", { class: "zufuegen", text: "Vorschaubild entfernen",
        onclick: (ev) => { ev.preventDefault(); e.bild = null; vorschauZeichnen(); } }));
  }
  const dateiWahl = el("input", { type: "file", accept: "image/*", style: { display: "none" },
    onchange: (ev) => { const f = ev.target.files[0]; if (f) verkleinern(f, (u) => { e.bild = u; vorschauZeichnen(); }); } });
  d.inhalt.append(feld("Vorschaubild", el("button", { class: "zufuegen", text: "Bild auswählen",
    onclick: (ev) => { ev.preventDefault(); dateiWahl.click(); } }), dateiWahl, vorschau));
  vorschauZeichnen();

  if (!istNeu) {
    if (e.wiederholung.art !== "einmal" && tagDerSerie) {
      d.inhalt.append(el("button", { class: "gefahr", text: `Nur den ${D.kurzesDatum(tagDerSerie)} absagen`,
        onclick: () => { S.vorkommenAbsagen(e.id, tagDerSerie); d.zu(); neu(); } }));
    }
    d.inhalt.append(el("button", { class: "gefahr",
      text: e.wiederholung.art === "einmal" ? "Eintrag löschen" : "Ganze Serie löschen",
      onclick: () => { if (confirm("Wirklich löschen?")) { S.eintragLoeschen(e.id); d.zu(); neu(); } } }));
  }
}

function verkleinern(datei, fertig) {
  const leser = new FileReader();
  leser.onload = () => {
    const bild = new Image();
    bild.onload = () => {
      const f = Math.min(1, 900 / Math.max(bild.width, bild.height));
      const c = el("canvas");
      c.width = Math.round(bild.width * f);
      c.height = Math.round(bild.height * f);
      c.getContext("2d").drawImage(bild, 0, 0, c.width, c.height);
      fertig(c.toDataURL("image/jpeg", 0.72));
    };
    bild.src = leser.result;
  };
  leser.readAsDataURL(datei);
}
