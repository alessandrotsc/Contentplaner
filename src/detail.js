/**
 * Detailansicht einer Kennzahl (wie in einer Aktien-App): Zeitraum waehlen,
 * Kurve bzw. Tagesbalken, mit dem Finger ueber das Diagramm fahren zeigt oben
 * Tag und Wert. Darunter jeder Tag als Zeile.
 *
 * rechnen = { tab, pids, summe, stand } aus analytics.js
 */

import * as D from "./datum.js";
import { el, dialog } from "./ui.js";

export const ERKLAERUNG = {
  follower: "Wie viele Konten dir am Ende des Tages folgen. Darunter siehst du, wie viele es je Tag mehr oder weniger wurden.",
  neu: "Konten, die dir an dem Tag neu gefolgt sind (nur Instagram).",
  verloren: "Konten, die dir an dem Tag entfolgt sind (nur Instagram).",
  aufrufe: "Wie oft deine Inhalte angesehen bzw. abgespielt wurden. Schaut eine Person dreimal, zählt das dreimal.",
  reichweite: "Wie viele verschiedene Konten deine Inhalte gesehen haben, jede Person nur einmal pro Tag. Über mehrere Tage addiert kann dieselbe Person mehrfach zählen, darum liegt die Summe etwas über der Zahl in der Instagram-App.",
  interagierende: "Wie viele verschiedene Konten geliked, kommentiert, geteilt, gespeichert oder geantwortet haben.",
  profilaufrufe: "Wie oft dein Profil geöffnet wurde.",
  interaktionen: "Alle Likes, Kommentare, Geteilt, Gespeichert und Antworten zusammen.",
  likes: "Likes auf deine Beiträge an dem Tag.",
  kommentare: "Neue Kommentare an dem Tag.",
  geteilt: "Wie oft deine Beiträge an dem Tag geteilt wurden.",
  gespeichert: "Wie oft deine Beiträge an dem Tag gespeichert wurden (Entfernen wird abgezogen, nie unter 0).",
  reposts: "Wie oft deine Beiträge an dem Tag repostet wurden.",
  antworten: "Antworten auf deine Storys.",
  linkklicks: "Klicks auf Links in deinem Profil.",
  webklicks: "Klicks auf deine Website im Profil.",
  beitraege: "Anzahl deiner veröffentlichten Beiträge.",
  folgt: "Wie vielen Konten du selbst folgst.",
  likes_gesamt: "Alle Likes, die dein Konto insgesamt bekommen hat.",
};

const ZEIT = [{ id: 7, name: "7 T" }, { id: 28, name: "28 T" }, { id: 90, name: "90 T" }, { id: 365, name: "1 J" }, { id: "alles", name: "Alles" }];
const zahl = (x) => Math.round(x).toLocaleString("de-DE");
const mitZeichen = (x) => (x > 0 ? "+" : x < 0 ? "−" : "±") + zahl(Math.abs(x));
const tagText = (t) => `${D.WOCHENTAGE[D.wochentag(t)]}, ${D.ausIso(t).getDate()}. ${D.MONATE[D.ausIso(t).getMonth()]}`;

let wahl = 28;

/** m = { id, name, art: "summe" | "stand" } */
export function detailOeffnen(m, rechnen, ersterTag) {
  const { inhalt } = dialog(m.name);
  inhalt.classList.add("detail");
  const zeichnen = () => { inhalt.replaceChildren(...ansicht(m, rechnen, ersterTag, zeichnen)); };
  zeichnen();
}

function ansicht(m, r, ersterTag, zeichnen) {
  const bis = D.heute();
  const von = wahl === "alles" ? (ersterTag || D.plusTage(bis, -27)) : D.plusTage(bis, -(wahl - 1));
  const tage = [];
  for (let t = von; t <= bis; t = D.plusTage(t, 1)) tage.push(t);

  const istStand = m.art === "stand";
  // Je Tag: Wert (Summe des Tages bzw. Stand am Tagesende) und bei Staenden die Aenderung zum Vortag
  const reihe = tage.map((t) => {
    if (!istStand) return { t, w: r.summe(r.tab, r.pids, m.id, t, t) };
    const w = r.stand(r.tab, r.pids, m.id, t);
    const v = r.stand(r.tab, r.pids, m.id, D.plusTage(t, -1));
    return { t, w, d: w != null && v != null ? w - v : null };
  });
  const mitDaten = reihe.filter((x) => x.w != null);
  // Instagram reicht die letzten zwei Tage oft noch nach
  const vorlaeufig = (t) => !istStand && D.tageZwischen(t, bis) < 2;

  // Kopf: Gesamtwert, beim Wischen der Wert des Tages
  const gross = el("b");
  const unter = el("div", { class: "detail-unter" });
  const kopf = el("div", { class: "detail-kopf" }, gross, unter);
  const gesamt = () => {
    if (!mitDaten.length) { gross.textContent = "–"; unter.textContent = "Noch keine Daten in diesem Zeitraum"; return; }
    if (istStand) {
      const a = mitDaten[0].w, z = mitDaten.at(-1).w;
      gross.textContent = zahl(z);
      unter.replaceChildren(el("span", { class: z - a >= 0 ? "gut" : "schlecht", text: mitZeichen(z - a) }),
        ` seit ${tagText(mitDaten[0].t)}`);
    } else {
      const s = mitDaten.reduce((a, x) => a + x.w, 0);
      gross.textContent = zahl(s);
      unter.textContent = `${tagText(tage[0])} bis ${tagText(bis)} · Ø ${zahl(s / mitDaten.length)} pro Tag`;
    }
  };
  const zeigeTag = (x) => {
    gross.textContent = x.w == null ? "–" : zahl(x.w);
    unter.replaceChildren(tagText(x.t),
      istStand && x.d != null ? el("span", { class: x.d >= 0 ? "gut" : "schlecht", text: `  ${mitZeichen(x.d)}` }) : "",
      vorlaeufig(x.t) ? el("small", { text: "  vorläufig" }) : "");
  };
  gesamt();

  const kinder = [
    el("div", { class: "wahl detail-zeit" }, ZEIT.map((z) => el("button", {
      class: z.id === wahl ? "an" : "", text: z.name, onclick: () => { wahl = z.id; zeichnen(); } }))),
    kopf,
  ];

  if (mitDaten.length) {
    kinder.push(diagramm(reihe, istStand ? "linie" : "balken", zeigeTag, gesamt));
    // Bei Staenden zusaetzlich die Tagesbewegung als Plus/Minus-Balken
    if (istStand && reihe.some((x) => x.d)) {
      kinder.push(el("div", { class: "detail-titel", text: m.id === "follower" ? "Follower je Tag gewonnen oder verloren" : "Änderung je Tag" }),
        diagramm(reihe.map((x) => ({ ...x, w: x.d })), "plusminus", (x) => zeigeTag(reihe.find((y) => y.t === x.t)), gesamt));
    }
  }

  if (ERKLAERUNG[m.id]) kinder.push(el("div", { class: "hinweis detail-erkl", text: ERKLAERUNG[m.id] }));

  // Tabelle, neuester Tag oben
  const zeilen = reihe.slice().reverse().filter((x) => x.w != null);
  if (zeilen.length) {
    kinder.push(el("div", { class: "detail-tabelle" + (istStand ? "" : " zwei") },
      el("div", { class: "detail-zeile titel" }, el("span", { text: "Tag" }), el("span", { text: istStand ? "Stand" : m.name }),
        istStand ? el("span", { text: "Änderung" }) : null),
      zeilen.map((x) => el("div", { class: "detail-zeile" + (vorlaeufig(x.t) ? " vorl" : "") },
        el("span", { text: tagText(x.t) + (vorlaeufig(x.t) ? " ·" : "") }),
        el("b", { text: zahl(x.w) }),
        istStand ? el("span", { class: x.d > 0 ? "gut" : x.d < 0 ? "schlecht" : "", text: x.d == null ? "" : mitZeichen(x.d) }) : null))));
    if (!istStand && zeilen.some((x) => vorlaeufig(x.t))) {
      kinder.push(el("div", { class: "hinweis", text: "· vorläufig: Instagram zählt die letzten zwei Tage noch nach, die App holt sie automatisch neu." }));
    }
  }
  return kinder;
}

/* ------------------------------------------------------------ Diagramm */

const B = 340, H = 170, RAND = 22;

function diagramm(reihe, art, beimTag, beimLoslassen) {
  const n = reihe.length;
  const xVon = (i) => (n === 1 ? B / 2 : 6 + (i / (n - 1)) * (B - 12));
  const ws = reihe.map((x) => x.w).filter((w) => w != null);
  let min = Math.min(...ws), max = Math.max(...ws);
  if (art !== "linie") { min = Math.min(0, min); max = Math.max(0, max); }
  if (min === max) { min -= 1; max += 1; }
  const yVon = (w) => 10 + (1 - (w - min) / (max - min)) * (H - 20);

  let inhalt = `<line x1="0" x2="${B}" y1="${yVon(art === "linie" ? min : 0)}" y2="${yVon(art === "linie" ? min : 0)}" class="grund"/>`;
  if (art === "linie") {
    const pkt = reihe.map((x, i) => [i, x.w]).filter(([, w]) => w != null).map(([i, w]) => [xVon(i), yVon(w)]);
    const pfad = pkt.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join("");
    inhalt += `<defs><linearGradient id="dfl" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#18C7D8" stop-opacity=".35"/><stop offset="1" stop-color="#18C7D8" stop-opacity="0"/></linearGradient></defs>
      <path d="${pfad}L${pkt.at(-1)[0]},${H}L${pkt[0][0]},${H}Z" fill="url(#dfl)"/>
      <path d="${pfad}" fill="none" stroke="#0B76D1" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round"/>`;
  } else {
    const breite = (B - 12) / n;
    const null0 = yVon(0);
    inhalt += reihe.map((x, i) => {
      if (x.w == null || x.w === 0) return "";
      const y = yVon(x.w);
      const cls = art === "plusminus" ? (x.w > 0 ? "plus" : "minus") : "";
      const bx = n === 1 ? B / 2 - 10 : xVon(i) - breite * 0.35;
      return `<rect data-i="${i}" class="${cls}" x="${bx.toFixed(1)}" y="${Math.min(y, null0).toFixed(1)}" width="${Math.max(1.2, breite * 0.7).toFixed(1)}" height="${Math.max(1, Math.abs(null0 - y)).toFixed(1)}" rx="${Math.min(3, breite * 0.3).toFixed(1)}"/>`;
    }).join("");
  }
  // Achse: Anfang, Mitte, Ende
  inhalt += [...new Set([0, Math.floor((n - 1) / 2), n - 1])].map((i) => {
    const anker = i === 0 ? "start" : i === n - 1 ? "end" : "middle";
    return `<text x="${xVon(i)}" y="${H + 16}" text-anchor="${anker}">${D.kurzesDatum(reihe[i].t)}</text>`;
  }).join("");
  if (art !== "linie") inhalt += `<text x="${B}" y="10" text-anchor="end" class="wert">max ${zahl(Math.max(...ws))}</text>`;
  inhalt += `<g class="zeiger" style="display:none"><line y1="0" y2="${H}"/><circle r="4.5"/></g>`;

  const s = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  s.setAttribute("viewBox", `0 0 ${B} ${H + RAND}`);
  s.setAttribute("class", `diagramm detail-diagramm art-${art}`);
  s.innerHTML = inhalt;

  // Finger/Maus: naechsten Tag suchen, Linie + Punkt setzen, Wert oben zeigen
  const zeiger = s.querySelector(".zeiger");
  const linie = zeiger.querySelector("line"), punkt = zeiger.querySelector("circle");
  const bewegen = (e) => {
    const box = s.getBoundingClientRect();
    const x = ((e.clientX - box.left) / box.width) * B;
    const i = Math.max(0, Math.min(n - 1, n === 1 ? 0 : Math.round(((x - 6) / (B - 12)) * (n - 1))));
    const tag = reihe[i];
    const px = xVon(i);
    zeiger.style.display = "";
    linie.setAttribute("x1", px); linie.setAttribute("x2", px);
    punkt.setAttribute("cx", px); punkt.setAttribute("cy", yVon(tag.w ?? (art === "linie" ? min : 0)));
    punkt.style.display = tag.w == null ? "none" : "";
    s.querySelectorAll("rect.an").forEach((r) => r.classList.remove("an"));
    s.querySelector(`rect[data-i="${i}"]`)?.classList.add("an");
    beimTag(tag);
  };
  const los = () => {
    zeiger.style.display = "none";
    s.querySelectorAll("rect.an").forEach((r) => r.classList.remove("an"));
    beimLoslassen();
  };
  s.addEventListener("pointerdown", (e) => { s.setPointerCapture(e.pointerId); bewegen(e); });
  s.addEventListener("pointermove", (e) => { if (e.pointerType === "mouse" || s.hasPointerCapture(e.pointerId)) bewegen(e); });
  s.addEventListener("pointerup", los);
  s.addEventListener("pointercancel", los);
  s.addEventListener("pointerleave", (e) => { if (e.pointerType === "mouse") los(); });
  return s;
}
