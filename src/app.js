/**
 * Content-Hub. Ein Ort fuer alle Kanaele: Kalender, Formate, Analytics.
 *
 * Oben waehlt man das Projekt (Alle, Astromaster, HausRund ...) und darunter
 * die Plattform (Alle, Instagram, TikTok ...). Diese Auswahl gilt fuer alle
 * Bereiche. Unten die Tab-Leiste wie in einer App.
 *
 * Design nach syncrate.de: Navy-Kopf mit gesperrtem Kicker und Cyan-Akzent,
 * darunter cremefarbene Flaeche mit weissen Karten und blauer Kante.
 */

import * as S from "./store.js";
import { Z, neu, beimZeichnen } from "./zustand.js";
import { el, ikon } from "./ui.js";
import { kalender, kalenderKopf, eintragDialog } from "./kalender.js";
import { formateBereich, listenAbgleichen } from "./formate.js";
import { analyticsBereich } from "./analytics.js";
import { mehrBereich } from "./mehr.js";
import { allesAbgleichen } from "./quellen.js";
import * as Server from "./server.js";

const app = document.getElementById("app");

const BEREICHE = [
  { id: "kalender", name: "Kalender", ikon: "kalender", kicker: "Contentplan" },
  { id: "formate", name: "Formate", ikon: "stapel", kicker: "Bibliothek" },
  { id: "analytics", name: "Analytics", ikon: "chart", kicker: "Zahlen" },
  { id: "mehr", name: "Mehr", ikon: "mehr", kicker: "Einstellungen" },
];

/* ----------------------------------------------------------------- Kopf */

function kopf() {
  const b = BEREICHE.find((x) => x.id === Z.bereich);
  const p = Z.projektId ? S.projekt(Z.projektId) : null;
  const pl = Z.plattformId ? S.plattformVon(Z.plattformId) : null;

  const titel = Z.bereich === "mehr" ? el("h1", { class: "kopf-titel" }, "Verwaltung") : el("h1", { class: "kopf-titel" },
    p ? p.name : "Alle Kanäle",
    pl && el("em", { text: " " + S.plattformTyp(pl.typ).name }));

  return el("header", { class: "kopf" },
    el("div", { class: "kopf-oben" },
      el("div", { class: "kicker" }, el("span", { class: "kicker-linie" }), b.kicker, el("span", { class: "kicker-linie" })),
      titel,
    ),
    Z.bereich !== "mehr" && filterLeiste(),
    Z.bereich === "kalender" && kalenderKopf(),
  );
}

function filterLeiste() {
  const projekte = el("div", { class: "filter-reihe" },
    pille("Alle", !Z.projektId, () => neu({ projektId: null, plattformId: null })),
    S.projekte().map((p) => pille(p.name, Z.projektId === p.id,
      () => neu({ projektId: p.id, plattformId: null }), p.farbe)));

  if (!Z.projektId) return el("div", { class: "filter" }, projekte);

  const p = S.projekt(Z.projektId);
  const plattformen = el("div", { class: "filter-reihe klein" },
    pille("Alle Plattformen", !Z.plattformId, () => neu({ plattformId: null })),
    p.plattformen.map((pl) => {
      const t = S.plattformTyp(pl.typ);
      return pille(t.name, Z.plattformId === pl.id, () => neu({ plattformId: pl.id }), null, t.id);
    }));
  return el("div", { class: "filter" }, projekte, plattformen);
}

function pille(text, an, klick, punkt, ik) {
  const b = el("button", { class: "fpille" + (an ? " an" : ""), onclick: klick },
    punkt && el("span", { class: "fpunkt", style: { background: punkt } }),
    ik && ikon(ik, 15),
    text);
  if (an) requestAnimationFrame(() => b.scrollIntoView({ inline: "nearest", block: "nearest" }));
  return b;
}

/* ------------------------------------------------------------ Tab-Leiste */

function tabs() {
  return el("nav", { class: "tabs" },
    BEREICHE.map((b) => el("button", {
      class: "tab" + (Z.bereich === b.id ? " an" : ""),
      onclick: () => neu({ bereich: b.id }),
    }, ikon(b.ikon, 22), el("span", { text: b.name }))));
}

/* ------------------------------------------------------------------ Start */

function zeichnen() {
  const scroll = document.querySelector(".inhalt")?.scrollTop || 0;
  const gleicherBereich = app.dataset.bereich === Z.bereich;
  app.innerHTML = "";
  app.dataset.bereich = Z.bereich;

  const inhalt = el("main", { class: "inhalt bereich-" + Z.bereich });
  const ansicht = Z.bereich === "kalender" ? kalender()
                : Z.bereich === "formate" ? formateBereich()
                : Z.bereich === "analytics" ? analyticsBereich()
                : mehrBereich();
  inhalt.append(ansicht);
  app.append(kopf(), inhalt, tabs());
  if (gleicherBereich && Z.bereich !== "kalender") inhalt.scrollTop = scroll;

  document.querySelector(".fab")?.remove();
  if (Z.bereich === "kalender") {
    document.body.append(el("button", { class: "fab", "aria-label": "Neuer Eintrag",
      onclick: () => eintragDialog({ datum: Z.gewaehlt }) }, ikon("plus")));
  }
}

beimZeichnen(zeichnen);
S.beiAenderung(() => {});
zeichnen();

// Mit Server: solange die App offen ist, alle 30 s die neuesten Zahlen holen.
// Ohne Server: verbundene Schnittstellen beim Oeffnen still abgleichen (hoechstens alle 6 h).
if (Server.aktiv()) {
  Server.dauerabgleich((n) => { if (n || Z.bereich === "analytics") zeichnen(); });
} else {
  allesAbgleichen({ nurWennAlt: true }).then((n) => { if (n) zeichnen(); }).catch(() => {});
}
listenAbgleichen();
