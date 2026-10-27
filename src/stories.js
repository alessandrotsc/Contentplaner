/**
 * Stories (User 27.10.2026): je Tag und Kanal drei Stories, getrennt von den Videos.
 * Morgen 9 Uhr, Mittag 13 Uhr, Abend 19 Uhr. Bild herunterladen/teilen wie bei den Covern, Haken = gepostet.
 *
 * Kultas: liegt in der Ablage (Ordner stories-kultas, erzeugt am Mac mit tools/stories.py, 14 Tage im Voraus).
 * Astromaster: der Server rendert jeden Morgen um 8:50 die drei Stories des Tages (Mondkalender, Wissen,
 * Planeten und Häuser) nach /medien/stories/<datum>-<quelle>.jpg; die App holt sie direkt von dort (nur heute).
 */

import * as S from "./store.js";
import * as D from "./datum.js";
import * as Server from "./server.js";
import { Z, neu } from "./zustand.js";
import { el, ikon, dialog } from "./ui.js";
import { ablageStories, laden } from "./posten.js";

const SLOTS = [
  { id: "morgen", name: "Morgen", zeit: "09:00" },
  { id: "mittag", name: "Mittag", zeit: "13:00" },
  { id: "abend", name: "Abend", zeit: "19:00" },
];
const ASTRO = { morgen: ["tagesenergie", "Mondkalender"], mittag: ["wissen", "Wissen"], abend: ["abend", "Planeten und Häuser"] };
const HINWEIS = { "Kultas|mittag": "Umfrage-Sticker Ja/Nein drauf setzen." };

let tag = null;
const ERLEDIGT = "contentplaner.stories.erledigt";
const erledigt = (() => { try { return JSON.parse(localStorage.getItem(ERLEDIGT)) || {}; } catch { return {}; } })();
function merken() { try { localStorage.setItem(ERLEDIGT, JSON.stringify(erledigt)); } catch { /* egal */ } }

function medienBasis() {
  const u = Server.einstellung()?.url;
  try { return u ? new URL(u).origin + "/medien/stories/" : null; } catch { return null; }
}

/** Alle Stories eines Tages für ein Projekt: [{slot, url, titel, format, key}] */
function storiesFuer(p, datum) {
  if (p.name === "Astromaster") {
    const basis = medienBasis();
    if (!basis || datum !== D.heute()) return [];
    return SLOTS.map((s) => ({ slot: s.id, url: `${basis}${datum}-${ASTRO[s.id][0]}.jpg`, titel: ASTRO[s.id][1],
      format: ASTRO[s.id][1], key: `STORY|Astromaster|${datum}|${s.id}`, extern: true }));
  }
  return ablageStories().filter((v) => (v.projekt || "").toLowerCase() === p.name.toLowerCase() && v.datum === datum)
    .map((v) => ({ slot: v.slot, url: v.dateien?.bild, titel: v.titel, format: v.format, key: v.key }));
}

/** Herunterladen/Teilen; klappt der Abruf nicht (fremder Server ohne Freigabe), Bild in neuem Tab öffnen. */
function speichernKnopf(st) {
  const text = el("span", { text: "Bild speichern" });
  let datei = null;
  const b = el("button", { class: "teilen", onclick: async (ev) => {
    ev.preventDefault(); ev.stopPropagation();
    try {
      if (!datei) { text.textContent = "Lädt …"; datei = await laden(st.url, () => {}); text.textContent = "Jetzt teilen"; b.classList.add("bereit"); return; }
      if (navigator.canShare?.({ files: [datei] })) await navigator.share({ files: [datei] });
      else { const a = el("a", { href: URL.createObjectURL(datei), download: `${st.key.replaceAll("|", "-")}.jpg` }); document.body.append(a); a.click(); a.remove(); }
    } catch (e) {
      if (e.name === "AbortError") return;
      window.open(st.url, "_blank"); text.textContent = "Bild speichern";
    }
  } }, ikon("pfeil_hoch"), text);
  return b;
}

function slotKarte(p, s, st) {
  const fertig = st && erledigt[st.key];
  const haken = st && el("button", { class: "fertig-haken" + (fertig ? " an" : ""), title: "Gepostet",
    onclick: (ev) => { ev.stopPropagation(); erledigt[st.key] = !fertig; if (!erledigt[st.key]) delete erledigt[st.key]; merken(); neu(); } }, ikon("haken", 20));
  const bild = st && el("img", { class: "story-bild", src: st.url, loading: "lazy", alt: st.titel,
    onerror: (ev) => { ev.target.replaceWith(el("div", { class: "story-leer", text: "Noch nicht da" })); },
    onclick: () => gross(st) });
  return el("div", { class: "story-slot" + (fertig ? " erledigt" : "") },
    el("div", { class: "story-kopf" }, el("b", { text: s.name }), el("small", { text: s.zeit })),
    st && el("div", { class: "story-rahmen" }, bild, haken),
    !st && el("div", { class: "story-leer", text: p.name === "Astromaster" && tag !== D.heute() ? "Kommt am Tag um 8:50" : "Noch keine Story" }),
    st && el("div", { class: "story-titel", text: st.format || "" }),
    st && HINWEIS[`${p.name}|${s.id}`] && el("div", { class: "hinweis", text: HINWEIS[`${p.name}|${s.id}`] }),
    st && speichernKnopf(st));
}

function gross(st) {
  const d = dialog(st.format || "Story");
  d.inhalt.append(el("img", { class: "story-gross", src: st.url, alt: st.titel }), speichernKnopf(st),
    el("button", { class: "posten-zu", text: "Schließen", onclick: () => d.zu() }));
}

export function storiesBereich() {
  tag ||= D.heute();
  const tage = Array.from({ length: 7 }, (_, i) => D.plusTage(D.heute(), i));
  const wahl = el("div", { class: "chips" }, tage.map((t) => {
    const dd = D.ausIso(t);
    const name = t === D.heute() ? "Heute" : t === D.plusTage(D.heute(), 1) ? "Morgen" : `${D.WOCHENTAGE[D.wochentag(t)]} ${dd.getDate()}.`;
    return el("button", { class: "chip-knopf" + (t === tag ? " an" : ""), text: name, onclick: () => { tag = t; neu(); } });
  }));
  const projekte = (Z.projektId ? [S.projekt(Z.projektId)] : S.projekte()).filter((p) => p && ["astromaster", "kultas"].includes(p.name.toLowerCase()));
  return el("div", { class: "seite" }, wahl,
    projekte.map((p) => {
      const liste = storiesFuer(p, tag);
      return el("div", { class: "saeule" },
        el("div", { class: "saeule-kopf" }, el("span", { class: "fpunkt", style: { background: p.farbe } }), el("div", {}, el("b", { text: p.name }))),
        el("div", { class: "story-reihe" }, SLOTS.map((s) => slotKarte(p, s, liste.find((x) => x.slot === s.id)))));
    }),
    !Server.aktiv() && el("p", { class: "hinweis", text: "Für Stories muss unter Mehr der Content-Hub-Server verbunden sein." }));
}
