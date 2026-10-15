/**
 * Analytics je Projekt und Plattform.
 *
 * Rechenregeln:
 *  - Summen-Kennzahlen (Aufrufe, Likes ...) werden je Tag gebildet. Tageswerte
 *    gewinnen; Zeitraum-Messungen (z.B. "letzte 7 Tage" von Hand oder die
 *    TikTok-Differenz) werden gleichmaessig auf die Tage verteilt, die noch
 *    keinen Tageswert haben.
 *  - Follower ist ein Stand: Wert am Ende minus Wert vor dem Start.
 *  - Vergleich immer mit dem gleich langen Zeitraum direkt davor.
 */

import * as S from "./store.js";
import * as D from "./datum.js";
import { Z, neu, aktivePlattformIds, aktiveProjekte } from "./zustand.js";
import { el, ikon, dialog, feld, pillen } from "./ui.js";
import { allesAbgleichen } from "./quellen.js";

const ZEITRAEUME = [
  { id: 7, name: "7 Tage" }, { id: 28, name: "28 Tage" }, { id: 90, name: "90 Tage" },
  { id: 365, name: "1 Jahr" }, { id: "eigen", name: "Eigener" },
];

let chartMetrik = "aufrufe";
let laedt = false;

/* ------------------------------------------------------------- Rechnen */

function zeitraum() {
  if (Z.zeitraum === "eigen" && Z.eigenVon && Z.eigenBis) {
    const [von, bis] = [Z.eigenVon, Z.eigenBis].sort();
    return { von, bis, tage: D.tageZwischen(von, bis) + 1 };
  }
  const n = typeof Z.zeitraum === "number" ? Z.zeitraum : 28;
  const bis = D.heute();
  return { von: D.plusTage(bis, -(n - 1)), bis, tage: n };
}

function tageVon(von, bis) {
  const t = [];
  for (let d = von; d <= bis; d = D.plusTage(d, 1)) t.push(d);
  return t;
}

/** Tageswerte je Plattform und Kennzahl: Map pid -> metrik -> Map tag -> wert */
function tagesTabelle(pids) {
  const tab = new Map();
  const ms = S.messungen(pids);
  for (const pid of pids) {
    const proMetrik = new Map();
    const eigene = ms.filter((m) => m.plattformId === pid);
    for (const m of S.METRIKEN.filter((x) => x.art === "summe")) {
      const tage = new Map();
      // erst Tageswerte, dann Zeitraeume in die Luecken
      eigene.filter((x) => x.von === x.bis && x.werte[m.id] != null)
        .forEach((x) => tage.set(x.von, (tage.get(x.von) || 0) + +x.werte[m.id]));
      const tagesfest = new Set(tage.keys());
      eigene.filter((x) => x.von !== x.bis && x.werte[m.id] != null).forEach((x) => {
        const frei = tageVon(x.von, x.bis).filter((t) => !tagesfest.has(t));
        if (!frei.length) return;
        const anteil = +x.werte[m.id] / frei.length;
        frei.forEach((t) => tage.set(t, (tage.get(t) || 0) + anteil));
      });
      proMetrik.set(m.id, tage);
    }
    // Staende: sortierte Liste [tag, wert]
    for (const m of S.METRIKEN.filter((x) => x.art === "stand")) {
      proMetrik.set(m.id, eigene.filter((x) => x.werte[m.id] != null)
        .map((x) => [x.bis, +x.werte[m.id]]).sort((a, b) => a[0].localeCompare(b[0])));
    }
    tab.set(pid, proMetrik);
  }
  return tab;
}

function summe(tab, pids, metrik, von, bis) {
  let s = 0, da = false;
  for (const pid of pids) for (const [t, w] of tab.get(pid).get(metrik)) {
    if (t >= von && t <= bis) { s += w; da = true; }
  }
  return da ? s : null;
}

/** Stand am Tag (letzter bekannter Wert bis dahin), je Plattform aufaddiert. */
function stand(tab, pids, metrik, tag, auchSpaeter = false) {
  let s = 0, da = false;
  for (const pid of pids) {
    const reihe = tab.get(pid).get(metrik);
    let w = null;
    for (const [t, x] of reihe) { if (t <= tag) w = x; else break; }
    if (w == null && auchSpaeter && reihe.length) w = reihe[0][1];
    if (w != null) { s += w; da = true; }
  }
  return da ? s : null;
}

function einnahmenSumme(von, bis) {
  const pids = new Set(aktivePlattformIds());
  return S.einnahmen(aktiveProjekte().map((p) => p.id))
    .filter((e) => e.datum >= von && e.datum <= bis && (!Z.plattformId || !e.plattformId || pids.has(e.plattformId)))
    .reduce((a, e) => a + (+e.betrag || 0), 0);
}

/* ----------------------------------------------------------- Oberflaeche */

export function analyticsBereich() {
  const pids = aktivePlattformIds();
  const z = zeitraum();
  const vor = { bis: D.plusTage(z.von, -1), von: D.plusTage(z.von, -z.tage) };
  const tab = tagesTabelle(pids);

  return el("div", { class: "seite" },
    zeitraumWahl(z),
    abrufZeile(pids),
    kennzahlen(tab, pids, z, vor),
    diagramme(tab, pids, z),
    !Z.plattformId && plattformTabelle(tab, z),
    einnahmenBlock(z),
    el("div", { class: "knopf-reihe" },
      el("button", { class: "knopf-zweit", onclick: () => messungDialog() }, ikon("plus", 18), "Werte eintragen"),
      el("button", { class: "knopf-zweit", onclick: () => einnahmeDialog() }, ikon("geld", 18), "Einnahme")),
    verlauf(pids),
  );
}

function zeitraumWahl(z) {
  const box = el("div", { class: "zeitraum" },
    el("div", { class: "segment" }, ZEITRAEUME.map((x) => el("button", {
      class: Z.zeitraum === x.id ? "an" : "", text: x.name,
      onclick: () => {
        if (x.id === "eigen" && !Z.eigenVon) neu({ zeitraum: "eigen", eigenVon: z.von, eigenBis: z.bis });
        else neu({ zeitraum: x.id });
      } }))));
  if (Z.zeitraum === "eigen") {
    box.append(el("div", { class: "zeile-2" },
      el("input", { class: "eingabe", type: "date", value: Z.eigenVon, onchange: (e) => neu({ eigenVon: e.target.value }) }),
      el("input", { class: "eingabe", type: "date", value: Z.eigenBis, onchange: (e) => neu({ eigenBis: e.target.value }) })));
  }
  box.append(el("div", { class: "zeitraum-text", text: `${D.kurzesDatum(z.von)} bis ${D.kurzesDatum(z.bis)} · Vergleich mit den ${z.tage} Tagen davor` }));
  return box;
}

function abrufZeile(pids) {
  const verbunden = pids.map((id) => [S.plattformVon(id), S.verbindung(id)]).filter(([, v]) => v);
  const fehler = verbunden.filter(([, v]) => v.fehler);
  const letzter = Math.max(0, ...verbunden.map(([, v]) => v.letzterAbruf || 0));
  const text = !verbunden.length
    ? "Keine Plattform verbunden. Werte von Hand eintragen oder unter Mehr › Verbindungen koppeln."
    : fehler.length ? `Fehler bei ${fehler.map(([p]) => S.plattformTyp(p.typ).name).join(", ")}: ${fehler[0][1].fehler}`
    : letzter ? `Zuletzt abgerufen ${new Date(letzter).toLocaleString("de-DE", { dateStyle: "short", timeStyle: "short" })}` : "Noch nicht abgerufen";

  return el("div", { class: "abruf" + (fehler.length ? " fehler" : "") },
    el("span", { text }),
    verbunden.length ? el("button", { class: "abruf-knopf" + (laedt ? " dreht" : ""), "aria-label": "Jetzt abrufen",
      onclick: async () => {
        laedt = true; neu();
        try { await allesAbgleichen(); } finally { laedt = false; neu(); }
      } }, ikon("sync", 18)) : null);
}

function kennzahlen(tab, pids, z, vor) {
  const karten = [];
  const leer = [];

  // Follower: Stand und Bewegung
  const fJetzt = stand(tab, pids, "follower", z.bis);
  const fStart = stand(tab, pids, "follower", vor.bis, true);
  if (fJetzt != null) {
    const netto = fStart != null ? fJetzt - fStart : null;
    karten.push(kachel("Follower", fJetzt, netto, "netto im Zeitraum", true));
  } else leer.push("Follower");

  for (const m of S.METRIKEN.filter((x) => x.art === "summe")) {
    const jetzt = summe(tab, pids, m.id, z.von, z.bis);
    const davor = summe(tab, pids, m.id, vor.von, vor.bis);
    if (jetzt == null && davor == null) { leer.push(m.name); continue; }
    karten.push(kachel(m.name, jetzt || 0, prozent(jetzt || 0, davor), "zum Vorzeitraum", false, m.id === "verloren"));
  }

  const ein = einnahmenSumme(z.von, z.bis);
  const einVor = einnahmenSumme(vor.von, vor.bis);
  if (ein || einVor) karten.push(kachel("Einnahmen", ein, prozent(ein, einVor), "zum Vorzeitraum", false, false, true));

  return el("div", {},
    el("div", { class: "kpi-raster" }, karten),
    leer.length ? el("div", { class: "hinweis", text: "Noch keine Daten: " + leer.join(", ") }) : null);
}

const prozent = (a, b) => (b ? Math.round(((a - b) / b) * 100) : null);

function kachel(name, wert, delta, deltaText, absolut, umgekehrt = false, geld = false) {
  const zahlText = geld ? euro(wert) : Math.round(wert).toLocaleString("de-DE");
  let d = null;
  if (delta != null) {
    const gut = umgekehrt ? delta < 0 : delta > 0;
    const schlecht = umgekehrt ? delta > 0 : delta < 0;
    const zeichen = delta > 0 ? "+" : delta < 0 ? "−" : "±";
    const betrag = Math.abs(delta).toLocaleString("de-DE") + (absolut ? "" : " %");
    d = el("div", { class: "kpi-delta" + (gut ? " gut" : schlecht ? " schlecht" : "") },
      delta !== 0 && ikon(delta > 0 ? "pfeil_hoch" : "pfeil_runter", 13), `${zeichen}${betrag}`,
      el("small", { text: " " + deltaText }));
  }
  return el("div", { class: "kpi" }, el("small", { text: name }), el("b", { text: zahlText }), d);
}

const euro = (x) => x.toLocaleString("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: x % 1 ? 2 : 0 });

/* ----------------------------------------------------------- Diagramme */

function diagramme(tab, pids, z) {
  const tage = tageVon(z.von, z.bis);
  const box = el("div");

  // Followerkurve
  const punkte = tage.map((t) => stand(tab, pids, "follower", t));
  if (punkte.some((x) => x != null)) {
    box.append(el("div", { class: "karte-gross" },
      el("div", { class: "diagramm-titel" }, "Follower",
        el("span", { text: `${(punkte.find((x) => x != null)).toLocaleString("de-DE")} → ${punkte.filter((x) => x != null).at(-1).toLocaleString("de-DE")}` })),
      linie(tage, punkte)));
  }

  // Balken fuer eine waehlbare Summen-Kennzahl
  const verfuegbar = S.METRIKEN.filter((m) => m.art === "summe" && summe(tab, pids, m.id, z.von, z.bis) != null);
  if (verfuegbar.length) {
    if (!verfuegbar.some((m) => m.id === chartMetrik)) chartMetrik = verfuegbar[0].id;
    const werte = tage.map((t) => summe(tab, pids, chartMetrik, t, t) || 0);
    box.append(el("div", { class: "karte-gross" },
      el("div", { class: "chips" }, verfuegbar.map((m) => el("button", {
        class: "chip-knopf" + (m.id === chartMetrik ? " an" : ""), text: m.name,
        onclick: () => { chartMetrik = m.id; neu(); } }))),
      balken(tage, werte)));
  }
  return box;
}

const B = 340, H = 150, RAND = 24;

function svg(kinder, hoehe = H) {
  const s = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  s.setAttribute("viewBox", `0 0 ${B} ${hoehe + RAND}`);
  s.setAttribute("class", "diagramm");
  s.innerHTML = kinder;
  return s;
}

function achse(tage) {
  const n = tage.length;
  const marken = [0, Math.floor((n - 1) / 2), n - 1].filter((v, i, a) => a.indexOf(v) === i);
  return marken.map((i) => {
    const x = n === 1 ? B / 2 : (i / (n - 1)) * (B - 8) + 4;
    const anker = i === 0 ? "start" : i === n - 1 ? "end" : "middle";
    return `<text x="${x}" y="${H + 17}" text-anchor="${anker}">${D.kurzesDatum(tage[i])}</text>`;
  }).join("");
}

function linie(tage, punkte) {
  const da = punkte.map((p, i) => [i, p]).filter(([, p]) => p != null);
  const ws = da.map(([, p]) => p);
  let min = Math.min(...ws), max = Math.max(...ws);
  if (min === max) { min -= 1; max += 1; }
  const n = tage.length;
  const xy = da.map(([i, p]) => [n === 1 ? B / 2 : (i / (n - 1)) * (B - 8) + 4, 10 + (1 - (p - min) / (max - min)) * (H - 20)]);
  const pfad = xy.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join("");
  const flaeche = `${pfad}L${xy.at(-1)[0]},${H}L${xy[0][0]},${H}Z`;
  const [lx, ly] = xy.at(-1);
  return svg(`
    <defs><linearGradient id="fl" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#18C7D8" stop-opacity=".35"/><stop offset="1" stop-color="#18C7D8" stop-opacity="0"/></linearGradient></defs>
    <line x1="0" x2="${B}" y1="${H}" y2="${H}" class="grund"/>
    <path d="${flaeche}" fill="url(#fl)"/>
    <path d="${pfad}" fill="none" stroke="#0B76D1" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round"/>
    <circle cx="${lx}" cy="${ly}" r="4" fill="#0B76D1" stroke="#fff" stroke-width="2"/>
    ${achse(tage)}`);
}

function balken(tage, werte) {
  const max = Math.max(1, ...werte);
  const n = tage.length;
  const breite = (B - 8) / n;
  const bars = werte.map((w, i) => {
    const h = (w / max) * (H - 18);
    return `<rect x="${(4 + i * breite + breite * 0.15).toFixed(1)}" y="${(H - h).toFixed(1)}" width="${Math.max(1, breite * 0.7).toFixed(1)}" height="${h.toFixed(1)}" rx="${Math.min(3, breite * 0.3).toFixed(1)}"/>`;
  }).join("");
  const summe = werte.reduce((a, b) => a + b, 0);
  return svg(`
    <line x1="0" x2="${B}" y1="${H}" y2="${H}" class="grund"/>
    <text x="2" y="12" class="wert">max ${Math.round(max).toLocaleString("de-DE")} · Summe ${Math.round(summe).toLocaleString("de-DE")}</text>
    <g class="balken-g">${bars}</g>
    ${achse(tage)}`);
}

/* ---------------------------------------------------- Je Plattform */

function plattformTabelle(tab, z) {
  const zeilen = aktivePlattformIds().map((id) => {
    const pl = S.plattformVon(id);
    const f = stand(tab, [id], "follower", z.bis);
    const f0 = stand(tab, [id], "follower", D.plusTage(z.von, -1), true);
    const auf = summe(tab, [id], "aufrufe", z.von, z.bis);
    if (f == null && auf == null) return null;
    const netto = f != null && f0 != null ? f - f0 : null;
    return el("button", { class: "pl-zeile", onclick: () => neu({ projektId: pl.projekt.id, plattformId: id }) },
      ikon(pl.typ, 18),
      el("div", {}, el("b", { text: S.plattformTyp(pl.typ).name }), el("small", { text: Z.projektId ? pl.handle || "" : pl.projekt.name })),
      el("div", { class: "pl-werte" },
        el("b", { text: f != null ? f.toLocaleString("de-DE") : "–" }),
        el("small", { class: netto > 0 ? "gut" : netto < 0 ? "schlecht" : "",
          text: netto != null ? (netto > 0 ? "+" : netto < 0 ? "−" : "±") + Math.abs(netto).toLocaleString("de-DE") : "" })),
      el("div", { class: "pl-werte" },
        el("b", { text: auf != null ? Math.round(auf).toLocaleString("de-DE") : "–" }), el("small", { text: "Aufrufe" })));
  }).filter(Boolean);
  if (!zeilen.length) return null;
  return el("div", { class: "karte-gross" }, el("div", { class: "diagramm-titel", text: "Je Plattform" }), zeilen);
}

/* -------------------------------------------------------- Einnahmen */

function einnahmenBlock(z) {
  const pids = new Set(aktivePlattformIds());
  const liste = S.einnahmen(aktiveProjekte().map((p) => p.id))
    .filter((e) => e.datum >= z.von && e.datum <= z.bis && (!Z.plattformId || !e.plattformId || pids.has(e.plattformId)))
    .sort((a, b) => b.datum.localeCompare(a.datum));
  if (!liste.length) return null;
  return el("div", { class: "karte-gross" },
    el("div", { class: "diagramm-titel", text: `Einnahmen · ${euro(liste.reduce((a, e) => a + +e.betrag, 0))}` }),
    liste.map((e) => el("button", { class: "pl-zeile", onclick: () => einnahmeDialog(e) },
      ikon("geld", 18),
      el("div", {}, el("b", { text: e.quelle || "Einnahme" }),
        el("small", { text: [D.kurzesDatum(e.datum), S.projekt(e.projektId)?.name, e.notiz].filter(Boolean).join(" · ") })),
      el("div", { class: "pl-werte" }, el("b", { text: euro(+e.betrag) })))));
}

function einnahmeDialog(vorgabe = {}) {
  const e = { datum: D.heute(), betrag: "", quelle: "", notiz: "", projektId: Z.projektId || S.projekte()[0]?.id,
              plattformId: Z.plattformId || "", ...vorgabe };
  const d = dialog(vorgabe.id ? "Einnahme" : "Neue Einnahme", () => {
    const betrag = parseFloat(String(e.betrag).replace(",", "."));
    if (!betrag) { alert("Bitte einen Betrag eintragen."); return false; }
    S.einnahmeSpeichern({ ...e, betrag });
    neu();
  });
  const projektWahl = el("select", { class: "eingabe", onchange: (ev) => { e.projektId = ev.target.value; e.plattformId = ""; plWahlFuellen(); } });
  S.projekte().forEach((p) => projektWahl.append(el("option", { value: p.id, selected: p.id === e.projektId }, p.name)));
  const plWahl = el("select", { class: "eingabe", onchange: (ev) => (e.plattformId = ev.target.value) });
  const plWahlFuellen = () => {
    plWahl.innerHTML = "";
    plWahl.append(el("option", { value: "" }, "Keine bestimmte"));
    S.projekt(e.projektId)?.plattformen.forEach((pl) => plWahl.append(el("option", { value: pl.id, selected: pl.id === e.plattformId }, S.plattformTyp(pl.typ).name)));
  };
  plWahlFuellen();

  d.inhalt.append(el("div", { class: "zeile-2" },
    feld("Betrag in €", el("input", { class: "eingabe", inputmode: "decimal", value: e.betrag, placeholder: "0,00", oninput: (ev) => (e.betrag = ev.target.value) })),
    feld("Datum", el("input", { class: "eingabe", type: "date", value: e.datum, onchange: (ev) => (e.datum = ev.target.value) }))));
  d.inhalt.append(el("div", { class: "zeile-2" }, feld("Projekt", projektWahl), feld("Plattform", plWahl)));
  d.inhalt.append(feld("Quelle", el("input", { class: "eingabe", value: e.quelle, list: "quellen-liste",
    placeholder: "z.B. Shop, Creator Rewards, Kooperation", oninput: (ev) => (e.quelle = ev.target.value) }),
    el("datalist", { id: "quellen-liste" }, ["Shop", "Creator Rewards", "Kooperation", "Affiliate", "Abo / Mitgliedschaft"].map((q) => el("option", { value: q })))));
  d.inhalt.append(feld("Notiz", el("input", { class: "eingabe", value: e.notiz, oninput: (ev) => (e.notiz = ev.target.value) })));
  if (vorgabe.id) d.inhalt.append(el("button", { class: "gefahr", text: "Einnahme löschen",
    onclick: () => { if (confirm("Löschen?")) { S.einnahmeLoeschen(e.id); d.zu(); neu(); } } }));
}

/* ---------------------------------------------------- Werte eintragen */

function messungDialog() {
  const alle = S.plattformen(Z.projektId);
  if (!alle.length) { alert("Lege zuerst unter Mehr eine Plattform an."); return; }
  const m = { plattformId: Z.plattformId || alle[0].id, von: D.heute(), bis: D.heute(), werte: {} };
  let modus = "tag";

  const d = dialog("Werte eintragen", () => {
    const werte = {};
    for (const [k, w] of Object.entries(m.werte)) {
      const n = parseFloat(String(w).replace(/\./g, "").replace(",", "."));
      if (!isNaN(n)) werte[k] = n;
    }
    if (!Object.keys(werte).length) { alert("Mindestens einen Wert eintragen."); return false; }
    if (modus === "tag") m.von = m.bis;
    if (m.von > m.bis) [m.von, m.bis] = [m.bis, m.von];
    // Follower ist ein Stand am Ende des Zeitraums, nicht Teil der Summe
    if (werte.follower != null && m.von !== m.bis) {
      S.messungSpeichern({ plattformId: m.plattformId, von: m.bis, bis: m.bis, quelle: "manuell", werte: { follower: werte.follower } }, true);
      delete werte.follower;
    }
    if (Object.keys(werte).length) S.messungSpeichern({ plattformId: m.plattformId, von: m.von, bis: m.bis, quelle: "manuell", werte });
    else S.speichernAnstossen();
    neu();
  });

  const plWahl = el("select", { class: "eingabe", onchange: (ev) => (m.plattformId = ev.target.value) });
  alle.forEach((pl) => plWahl.append(el("option", { value: pl.id, selected: pl.id === m.plattformId },
    `${pl.projekt.name} · ${S.plattformTyp(pl.typ).name}`)));
  d.inhalt.append(feld("Plattform", plWahl));

  const datum = el("div");
  const datumZeichnen = () => {
    datum.innerHTML = "";
    if (modus === "tag") datum.append(feld("Tag", el("input", { class: "eingabe", type: "date", value: m.bis, onchange: (ev) => (m.bis = ev.target.value) })));
    else datum.append(el("div", { class: "zeile-2" },
      feld("Von", el("input", { class: "eingabe", type: "date", value: m.von, onchange: (ev) => (m.von = ev.target.value) })),
      feld("Bis", el("input", { class: "eingabe", type: "date", value: m.bis, onchange: (ev) => (m.bis = ev.target.value) }))));
  };
  d.inhalt.append(feld("Gilt für", pillen([{ id: "tag", name: "Einen Tag" }, { id: "zeitraum", name: "Zeitraum" }], modus,
    (id) => { modus = id; if (id === "zeitraum") m.von = D.plusTage(m.bis, -6); datumZeichnen(); }), datum,
    el("div", { class: "hinweis", text: "Zeitraum, wenn du z.B. „letzte 7 Tage“ aus der App abliest. Follower ist immer der Stand am letzten Tag." })));
  datumZeichnen();

  const raster = el("div", { class: "werte-raster" });
  S.METRIKEN.forEach((x) => raster.append(feld(x.name, el("input", { class: "eingabe", inputmode: "numeric", placeholder: "–",
    oninput: (ev) => (m.werte[x.id] = ev.target.value) }))));
  d.inhalt.append(raster);
}

/* ------------------------------------------------------------ Verlauf */

function verlauf(pids) {
  const liste = S.messungen(pids).filter((m) => m.quelle === "manuell").sort((a, b) => b.bis.localeCompare(a.bis)).slice(0, 12);
  if (!liste.length) return null;
  return el("details", { class: "verlauf" },
    el("summary", { text: `Von Hand eingetragen (${liste.length})` }),
    liste.map((m) => {
      const pl = S.plattformVon(m.plattformId);
      const werte = Object.entries(m.werte).map(([k, w]) => `${S.METRIKEN.find((x) => x.id === k)?.name || k} ${(+w).toLocaleString("de-DE")}`).join(", ");
      return el("div", { class: "liste-zeile" },
        el("div", { style: { flex: "1", minWidth: "0" } },
          el("b", { text: `${S.plattformTyp(pl?.typ).name} · ${m.von === m.bis ? D.kurzesDatum(m.bis) : `${D.kurzesDatum(m.von)} bis ${D.kurzesDatum(m.bis)}`}` }),
          el("small", { text: werte })),
        el("button", { class: "weg", "aria-label": "Löschen", onclick: () => { if (confirm("Eintrag löschen?")) { S.messungLoeschen(m.id); neu(); } } }, ikon("muell")));
    }));
}
