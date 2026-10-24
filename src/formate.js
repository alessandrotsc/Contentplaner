/**
 * Formate und Reihenfolge je Projekt.
 *
 * Formate koennen von Hand angelegt oder aus einem Projekt-Import kommen
 * (Astromaster: 01_Contentplan/app_export.py). Mit Import gibt es zusaetzlich
 * Saeulen und die feste Reihenfolge, aus der man die naechsten Videos direkt
 * in den Kalender legt.
 */

import * as S from "./store.js";
import * as D from "./datum.js";
import { Z, neu } from "./zustand.js";
import { el, ikon, dialog, feld, pillen } from "./ui.js";

let zeigeBis = 15;
const abgeglichen = new Set();

/** Beim Start: für jedes Projekt mit Liste im Repo (daten/) Formate und Sendeplan still übernehmen. */
export async function listenAbgleichen() {
  // Neue Projekte aus daten/projekte.json einmalig anlegen (z.B. Astromaster YouTube)
  try {
    const r = await fetch("daten/projekte.json", { cache: "no-store" });
    if (r.ok) {
      const bekannt = new Set(S.projekte().map((p) => p.name.toLowerCase()));
      for (const name of await r.json()) {
        if (bekannt.has(name.toLowerCase())) continue;
        const a = await fetch(`daten/${name.toLowerCase()}-app.json`, { cache: "no-store" });
        if (a.ok) { S.importieren(await a.text()); neu(); }
      }
    }
  } catch { /* offline: beim nächsten Start */ }
  for (const p of S.projekte()) if (!abgeglichen.has(p.id)) { abgeglichen.add(p.id); listeLaden(p, true); }
}

export function formateBereich() {
  if (!Z.projektId) return uebersicht();
  const p = S.projekt(Z.projektId);
  if (!abgeglichen.has(p.id)) { abgeglichen.add(p.id); listeLaden(p, true); }
  const r = S.reihe(p.id);
  return el("div", { class: "seite" },
    r && fortschritt(p, r),
    saeulen(p, r),
    r && reihenfolge(p, r),
    r && regeln(r),
  );
}

/* --------------------------------------------------------- Alle Projekte */

function uebersicht() {
  return el("div", { class: "seite" },
    el("div", { class: "abschnitt-titel", text: "Projekte" }),
    el("div", { class: "kachel-raster" },
      S.projekte().map((p) => {
        const r = S.reihe(p.id);
        const fertig = r ? r.videos.filter((v) => v.status === "fertig" || v.status === "online").length : 0;
        return el("button", { class: "kachel", onclick: () => neu({ projektId: p.id, plattformId: null }) },
          el("span", { class: "kachel-band", style: { background: p.farbe } }),
          el("b", { text: p.name }),
          el("small", { text: `${S.formate(p.id).length} Formate` + (r ? ` · ${fertig}/${r.videos.length} Videos` : "") }),
          el("span", { class: "pl-icons" }, p.plattformen.map((pl) => ikon(pl.typ, 15))));
      })),
    el("p", { class: "hinweis", text: "Wähl oben ein Projekt, um seine Formate, Säulen und die Reihenfolge zu sehen." }),
  );
}

/* -------------------------------------------------------- Fortschritt */

function fortschritt(p, r) {
  // Mit Formatkatalog zählen dessen Videos, sonst die Reihenfolge
  const katalog = S.formate(p.id).filter((f) => f.unterformate);
  const gesamt = katalog.length ? katalog.reduce((s, f) => s + f.anzahl, 0) : r.videos.length;
  const fertig = katalog.length ? katalog.reduce((s, f) => s + (f.fertig || 0), 0)
    : r.videos.filter((v) => v.status === "fertig" || v.status === "online").length;
  const geplant = r.videos.filter((v) => v.eintragId && S.eintrag(v.eintragId)).length;
  const anteil = fertig / gesamt;
  return el("div", { class: "karte-gross" },
    el("div", { class: "kennzahl-reihe" },
      zahl(gesamt, "Videos"), zahl(katalog.length || r.saeulen.length, katalog.length ? "Formate" : "Säulen"),
      zahl(geplant, "eingeplant"), zahl(fertig, "fertig")),
    el("div", { class: "balken" }, el("span", { style: { width: Math.max(1, anteil * 100) + "%" } })),
    el("div", { class: "hinweis", text: `Stand der Liste: ${r.stand ? D.kurzesDatum(r.stand) : "unbekannt"}` }),
    el("button", { class: "zufuegen", text: "Neueste Liste laden", onclick: () => listeLaden(p) }),
    r.stufen.length ? el("ul", { class: "stufen" }, r.stufen.map((s) => el("li", { text: s }))) : null,
  );
}

// Die Liste liegt im Repo unter daten/<projekt>-app.json (am Mac von app_export.py geschrieben)
async function listeLaden(p, still = false) {
  try {
    const antwort = await fetch(`daten/${p.name.toLowerCase()}-app.json`, { cache: "no-store" });
    if (!antwort.ok) throw new Error("Für dieses Projekt liegt keine Liste bereit.");
    const text = S.importieren(await antwort.text());
    neu();
    if (!still) alert(text);
  } catch (err) { if (!still) alert("Laden ging nicht: " + err.message); }
}

const zahl = (n, t) => el("div", { class: "kennzahl" }, el("b", { text: n.toLocaleString("de-DE") }), el("small", { text: t }));

/* ------------------------------------------------------------ Saeulen */

function saeulen(p, r) {
  const formate = S.formate(p.id);
  const box = el("div");
  const namen = r?.saeulen.map((s) => s.name) || [...new Set(formate.map((f) => f.saeule).filter(Boolean))];

  namen.forEach((name, i) => {
    const liste = formate.filter((f) => f.saeule === name);
    const muster = r?.saeulen.find((s) => s.name === name)?.muster;
    box.append(el("div", { class: "saeule" },
      el("div", { class: "saeule-kopf" },
        el("span", { class: "saeule-nr", text: String(i + 1).padStart(2, "0") }),
        el("div", {},
          el("b", { text: name }),
          muster && el("small", { text: "Wechsel: " + muster.join(" → ") }))),
      liste.map((f) => formatZeile(f, r))));
  });

  const ohne = formate.filter((f) => !f.saeule || !namen.includes(f.saeule));
  box.append(el("div", { class: "saeule" },
    el("div", { class: "saeule-kopf" }, el("span", { class: "saeule-nr", text: "+" }),
      el("div", {}, el("b", { text: namen.length ? "Weitere Formate" : "Formate" }))),
    ohne.map((f) => formatZeile(f, r)),
    el("button", { class: "zufuegen", text: "Format hinzufügen", onclick: () => formatDialog({ projektId: p.id }) })));
  return box;
}

function formatZeile(f, r) {
  const videos = r ? r.videos.filter((v) => v.format === f.name) : [];
  const fertig = videos.filter((v) => v.status === "fertig" || v.status === "online").length;
  const info = (f.unterformate
    ? [`${f.unterformate.length} ${f.unterformate.length === 1 ? "Unterformat" : "Unterformate"}`, `${f.fertig || 0}/${f.anzahl} fertig`, f.laenge]
    : [f.laenge, videos.length ? `${fertig}/${videos.length} fertig` : f.themen?.length ? `${f.themen.length} Themen` : null])
    .filter(Boolean).join(" · ");
  return el("button", { class: "format-zeile", onclick: () => formatDetail(f, r) },
    el("div", {}, el("b", { text: f.name }), info && el("small", { text: info })),
    ikon("vor", 18));
}

/* ------------------------------------------------------- Format-Detail */

function formatDetail(f, r) {
  const d = dialog(f.name, null);
  if (f.laenge) d.inhalt.append(el("div", { class: "detail-zeile" }, el("small", { text: "Länge" }), el("b", { text: f.laenge })));
  if (f.saeule) d.inhalt.append(el("div", { class: "detail-zeile" }, el("small", { text: "Säule" }), el("b", { text: f.saeule })));
  if (f.beschreibung) d.inhalt.append(el("p", { class: "detail-text", text: f.beschreibung }));

  d.inhalt.append(el("button", { class: "zufuegen", text: "Bearbeiten / Caption-Vorlage",
    onclick: () => { d.zu(); formatDialog(f); } }));

  // Formatkatalog: Unterformate aufklappbar, darin die einzelnen Videos
  if (f.unterformate) {
    d.inhalt.append(el("div", { class: "menue-titel", text: `Unterformate (${f.unterformate.length}) · ${f.fertig || 0}/${f.anzahl} Videos fertig` }));
    d.inhalt.append(el("div", { class: "unterformate" }, f.unterformate.map((u) => {
      const box = el("details", { class: "unterformat" },
        el("summary", {},
          el("div", {}, el("b", { text: u.name }), u.beschreibung && el("small", { text: u.beschreibung })),
          el("span", { class: "status-pille klein", text: `${u.fertig || 0}/${u.anzahl}` })),
        el("div", { class: "themen" }, u.videos.map((v) => el("div", { class: "thema" + (v.status === "fertig" ? " fertig" : "") },
          el("span", { text: v.titel }),
          v.status === "fertig" && ikon("haken", 15)))));
      return box;
    })));
    return;
  }

  const videos = r ? r.videos.filter((v) => v.format === f.name) : [];
  const themen = videos.length ? videos : (f.themen || []).map((t) => ({ thema: t }));
  if (themen.length) {
    d.inhalt.append(el("div", { class: "menue-titel", text: `Themen (${themen.length})` }));
    d.inhalt.append(el("div", { class: "themen" }, themen.map((v) => el("div", { class: "thema" + (v.status === "fertig" ? " fertig" : "") },
      v.nr && el("span", { class: "nr", text: "#" + v.nr }),
      el("span", { text: v.thema }),
      v.status === "fertig" && ikon("haken", 15),
      v.eintragId && S.eintrag(v.eintragId) && el("small", { text: D.kurzesDatum(S.eintrag(v.eintragId).datum) })))));
  }
}

function formatDialog(vorgabe) {
  const f = { name: "", beschreibung: "", caption: "", saeule: "", laenge: "", ...vorgabe };
  const d = dialog(f.id ? "Format" : "Neues Format", () => {
    if (!f.name.trim()) { alert("Das Format braucht einen Namen."); return false; }
    S.formatSpeichern(f);
    neu();
  });
  const eingabe = (label, key, ph) => feld(label, el("input", { class: "eingabe", value: f[key] || "", placeholder: ph,
    oninput: (ev) => (f[key] = ev.target.value) }));
  const text = (label, key, ph) => {
    const t = el("textarea", { class: "eingabe", placeholder: ph, oninput: (ev) => (f[key] = ev.target.value) });
    t.value = f[key] || "";
    return feld(label, t);
  };
  d.inhalt.append(eingabe("Name", "name", "z.B. Top 3"));
  d.inhalt.append(el("div", { class: "zeile-2" }, eingabe("Säule", "saeule", "optional"), eingabe("Länge", "laenge", "z.B. 30 bis 45 s")));
  d.inhalt.append(text("Aufbau", "beschreibung", "Wie ist das Format aufgebaut"));
  d.inhalt.append(text("Caption-Vorlage", "caption", "Wird beim Eintrag vorgeschlagen"));
  if (f.id) {
    d.inhalt.append(el("button", { class: "gefahr", text: "Format löschen",
      onclick: () => { if (confirm("Format löschen?")) { S.formatLoeschen(f.id); d.zu(); neu(); } } }));
  }
}

/* -------------------------------------------------------- Reihenfolge */

function reihenfolge(p, r) {
  const offen = r.videos.filter((v) => v.status !== "fertig" && v.status !== "online");
  const box = el("div", { class: "saeule" },
    el("div", { class: "saeule-kopf" },
      el("span", { class: "saeule-nr", text: "→" }),
      el("div", {}, el("b", { text: "Als Nächstes" }),
        el("small", { text: `${offen.length} offen, der Reihe nach posten` }))),
    el("button", { class: "knopf-primaer", onclick: () => einplanenDialog(p, r) }, ikon("kalender", 18), "In den Kalender einplanen"));

  offen.slice(0, zeigeBis).forEach((v) => {
    const e = v.eintragId && S.eintrag(v.eintragId);
    box.append(el("div", { class: "reihe-zeile" },
      el("span", { class: "nr", text: v.nr }),
      el("div", {}, el("b", { text: v.thema }), el("small", { text: `${v.format} · ${v.saeule} · Runde ${v.runde}` })),
      e ? el("span", { class: "status-pille klein", text: D.kurzesDatum(e.datum) }) : null));
  });
  if (offen.length > zeigeBis) {
    box.append(el("button", { class: "zufuegen", text: `Weitere ${Math.min(30, offen.length - zeigeBis)} zeigen`,
      onclick: () => { zeigeBis += 30; neu(); } }));
  }
  return box;
}

function einplanenDialog(p, r) {
  const w = { n: 5, proTag: 5, ab: D.plusTage(D.heute(), 1) };
  // Ab dem Tag nach dem letzten schon eingeplanten Video weitermachen
  const geplant = r.videos.map((v) => v.eintragId && S.eintrag(v.eintragId)).filter(Boolean).map((e) => e.datum).sort();
  if (geplant.length && geplant.at(-1) >= w.ab) w.ab = D.plusTage(geplant.at(-1), 1);

  const d = dialog("Einplanen", () => {
    const n = S.einplanen(p.id, w.n, w.proTag, w.ab, D.plusTage);
    neu({ bereich: "kalender", ansicht: "agenda", anker: w.ab });
    setTimeout(() => alert(`${n} Videos eingeplant.`), 50);
  });
  d.inhalt.append(el("p", { class: "detail-text",
    text: "Legt die nächsten offenen Videos der Reihenfolge als Einträge in den Kalender, auf allen Plattformen des Projekts." }));
  d.inhalt.append(feld("Wie viele", pillen([5, 10, 15, 25, 35].map((n) => ({ id: n, name: String(n) })), w.n, (id) => (w.n = id))));
  d.inhalt.append(feld("Pro Tag", pillen([5, 3, 2, 1].map((n) => ({ id: n, name: `${n} am Tag` })), w.proTag, (id) => (w.proTag = id))));
  d.inhalt.append(feld("Ab", el("input", { class: "eingabe", type: "date", value: w.ab, onchange: (ev) => (w.ab = ev.target.value) })));
}

function regeln(r) {
  if (!r.regeln.length) return null;
  return el("div", { class: "saeule" },
    el("div", { class: "saeule-kopf" }, el("span", { class: "saeule-nr", text: "!" }), el("div", {}, el("b", { text: "Regeln" }))),
    el("ul", { class: "stufen" }, r.regeln.map((t) => el("li", { text: t }))));
}
