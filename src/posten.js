/**
 * Posten vom Handy: fertige Videos liegen auf dem Content-Hub-Server (Mac lädt sie per
 * tools/ablage.py hoch). Am Kalendereintrag (verknüpft über planKey) erscheinen Video,
 * Cover, Caption und YouTube-Texte. „Teilen“ öffnet das Teilen-Menü des iPhones:
 * direkt an TikTok, Instagram oder YouTube, oder „Video sichern“ in Fotos.
 *
 * TikTok und Instagram bekommen video.mp4 (Musik kommt dort aus der App),
 * YouTube Shorts die Fassung mit Musik, YouTube Video das lange 16:9-Video mit Thumbnail
 * (meta: dateien.lang, dateien.thumbnail, langTitel, langText).
 */

import * as Server from "./server.js";
import * as S from "./store.js";
import { neu } from "./zustand.js";
import { el, ikon, dialog, inZwischenablage } from "./ui.js";

const CACHE = "contentplaner.ablage";
let videos = (() => { try { return JSON.parse(localStorage.getItem(CACHE)) || []; } catch { return []; } })();

/** Holt die Liste vom Server. true, wenn sich etwas geändert hat. */
export async function ablageLaden() {
  if (!Server.aktiv()) return false;
  const r = await Server.anfrageRoh("/ablage");
  const neu = JSON.stringify(r.videos || []);
  if (neu === JSON.stringify(videos)) return false;
  videos = r.videos || [];
  try { localStorage.setItem(CACHE, neu); } catch { /* egal, beim nächsten Start neu */ }
  return true;
}

export const zuEintrag = (e) => (e?.planKey && videos.find((v) => v.key === e.planKey)) || null;
export const istErledigt = (v) => !!v?.status?.erledigt;

/* Geladene Dateien bleiben im Speicher, solange die App offen ist (ein Video ca. 110 MB). */
const geladen = new Map();

async function laden(url, beiFortschritt) {
  if (geladen.has(url)) return geladen.get(url);
  const r = await fetch(url);
  if (!r.ok) throw new Error(`Datei nicht gefunden (${r.status})`);
  const gesamt = Number(r.headers.get("content-length")) || 0;
  const leser = r.body.getReader();
  const teile = [];
  let n = 0;
  for (;;) {
    const { done, value } = await leser.read();
    if (done) break;
    teile.push(value); n += value.length;
    if (gesamt) beiFortschritt(Math.round((n / gesamt) * 100));
  }
  const name = decodeURIComponent(url.split("/").slice(-2).join("-"));
  const datei = new File(teile, name, { type: r.headers.get("content-type") || "application/octet-stream" });
  geladen.set(url, datei);
  return datei;
}

/** Zweistufig: iOS erlaubt das Teilen nur direkt nach einem Tipp, das Laden dauert aber.
 *  Erster Tipp lädt, zweiter Tipp teilt. */
function teilenKnopf(beschriftung, url, ikonName) {
  const text = el("span", { text: beschriftung });
  const b = el("button", { class: "teilen", onclick: los }, ikon(ikonName || "pfeil_hoch"), text);
  if (geladen.has(url)) bereit();

  function bereit() { b.classList.add("bereit"); text.textContent = beschriftung + ": jetzt teilen"; }

  async function los(ev) {
    ev.preventDefault();
    if (b.disabled) return;
    if (!geladen.has(url)) {
      b.disabled = true;
      text.textContent = "Lädt …";
      try {
        await laden(url, (p) => (text.textContent = `Lädt … ${p} %`));
        bereit();
      } catch (e) {
        text.textContent = beschriftung;
        alert(e.message);
      }
      b.disabled = false;
      return;
    }
    const datei = geladen.get(url);
    if (navigator.canShare?.({ files: [datei] })) {
      try { await navigator.share({ files: [datei] }); }
      catch (e) { if (e.name !== "AbortError") alert("Teilen ging nicht: " + e.message); }
    } else {
      // Mac/Browser ohne Teilen-Menü: einfach herunterladen
      const a = el("a", { href: URL.createObjectURL(datei), download: datei.name });
      document.body.append(a); a.click(); a.remove();
    }
  }
  return b;
}

function textBlock(titel, text, knopfText) {
  if (!text) return null;
  const knopf = el("button", { class: "kopieren", onclick: (ev) => { ev.preventDefault(); inZwischenablage(text, knopf); } },
    ikon("kopieren"), el("span", { text: knopfText }));
  return el("div", { class: "feld" }, el("label", { text: titel }), el("div", { class: "posten-text", text }), knopf);
}

const NAMEN = { tiktok: "TikTok", instagram: "Instagram", facebook: "Facebook", shorts: "YT Shorts", youtube: "YouTube",
  pinterest: "Pinterest", linkedin: "LinkedIn" };
const IKON = { shorts: "youtube" };
const ziel = (id, name) => ({ id, name: name || NAMEN[id] || id, ikon: IKON[id] || id });

/** Plattformen zum Abhaken. Mit Video: aus den vorhandenen Dateien, sonst aus den Plattformen des Eintrags. */
export function zielPlattformen(e, v) {
  if (v) {
    const f = v.dateien || {};
    const kurz = f.video || f.youtube || v.youtubeTitel || v.caption;
    const astro = (v.projekt || "").toLowerCase() === "astromaster";
    return [kurz && ziel("tiktok"), kurz && ziel("instagram"), kurz && ziel("facebook"), kurz && astro && ziel("pinterest"),
      kurz && ziel("shorts"), (f.lang || v.langTitel) && ziel("youtube", "YouTube lang")].filter(Boolean);
  }
  const p = S.projekt(e?.projektId);
  const alle = p?.plattformen || [];
  const ids = e?.plattformIds?.length ? e.plattformIds : alle.map((x) => x.id);
  return [...new Set(ids.map((id) => alle.find((x) => x.id === id)?.typ).filter(Boolean))].map((t) => ziel(t));
}

/** Abgehakte Plattformen: im Eintrag gespeichert, beim Video zusätzlich auf dem Server. */
export function abgehakt(e, v) {
  return { ...(e?.hochgeladen || {}), ...(v?.status?.plattformen || {}) };
}

/** Für die Kalenderkarte: [erledigt, gesamt] */
export function fortschritt(e, v) {
  const z = zielPlattformen(e, v), an = abgehakt(e, v);
  return [z.filter((x) => an[x.id]).length, z.length];
}

async function statusSenden(v, plattformen, erledigt) {
  const r = await Server.anfrageRoh("/ablage/status", { method: "PUT",
    body: JSON.stringify({ projekt: v.projekt, ordner: v.ordner || v.id, plattformen, erledigt }) });
  v.status = r.status;
  if (erledigt) {
    for (const k of ["video", "youtube", "lang"]) { if (v.dateien?.[k]) { geladen.delete(v.dateien[k]); delete v.dateien[k]; } }
  }
  try { localStorage.setItem(CACHE, JSON.stringify(videos)); } catch { /* egal */ }
}

/** Zeile mit einem Knopf je Plattform zum Abhaken (Posten-Ansicht und Eintrag-Dialog). */
export function haekchen(e, v, d) {
  const ziele = zielPlattformen(e, v);
  if (!ziele.length) return null;
  const an = abgehakt(e, v);
  if (istErledigt(v)) {
    return el("div", { class: "posten-kanal erledigt-box" },
      el("div", { class: "posten-kopf" }, ikon("haken", 16), el("b", { text: "Erledigt" })),
      el("div", { class: "hinweis", text: "Auf allen Plattformen eingeplant oder hochgeladen. Das Video ist vom Server gelöscht, Cover und Texte bleiben." }));
  }
  const gespeichert = e?.id && S.eintrag(e.id);
  const knoepfe = ziele.map((p) => {
    const b = el("button", { class: "abhaken" + (an[p.id] ? " an" : ""), onclick: klick }, ikon(p.ikon, 15), el("span", { text: p.name }));
    async function klick(ev) {
      ev.preventDefault();
      an[p.id] = !an[p.id];
      b.classList.toggle("an", an[p.id]);
      const alle = ziele.every((x) => an[x.id]);
      if (alle && v && !confirm("Alles abgehakt. Video als erledigt markieren und vom Server löschen?")) {
        an[p.id] = false; b.classList.remove("an"); return;
      }
      try {
        if (v) await statusSenden(v, an, alle);
        if (gespeichert) {
          const x = S.eintrag(e.id);
          x.hochgeladen = { ...an };
          S.eintragSpeichern({ id: e.id, hochgeladen: { ...an }, ...(alle ? { status: "online" } : {}) });
        }
        if (alle) { d?.zu(); neu(); }
      } catch (err) {
        an[p.id] = !an[p.id]; b.classList.toggle("an", an[p.id]);
        alert("Speichern ging nicht: " + err.message);
      }
    }
    return b;
  });
  return el("div", { class: "posten-kanal" },
    el("div", { class: "posten-kopf" }, ikon("haken", 16), el("b", { text: "Eingeplant oder hochgeladen" })),
    el("div", { class: "hinweis", text: v
      ? "Abhaken, sobald es auf der Plattform geplant oder online ist. Sind alle abgehakt, wird das Video vom Server gelöscht."
      : "Abhaken, sobald es auf der Plattform geplant oder online ist. Sind alle abgehakt, gilt der Eintrag als veröffentlicht." }),
    el("div", { class: "abhaken-reihe" }, knoepfe));
}

/** Pinterest (nur Astromaster): Pinnwand nach Format, Titel, Beschreibung und Link zum Kopieren. */
const PINNWAND = [
  [/beziehung|paar|liebe|passt/i, "Sternzeichen Liebe und Partnerschaft"],
  [/top 3|ranking/i, "Top 3 Sternzeichen"],
  [/myster|theorie|rätsel/i, "Mysterien und Rätsel der Geschichte"],
  [/numerolog|zahl|engel/i, "Numerologie und Engelszahlen"],
];
function pinterestBlock(v, f) {
  if ((v.projekt || "").toLowerCase() !== "astromaster" || !(f.video || v.caption)) return null;
  const quelle = `${v.format || ""} ${v.titel || ""}`;
  const pinnwand = (PINNWAND.find(([re]) => re.test(quelle)) || [, "Sternzeichen Eigenschaften"])[1];
  const ohneDeko = (t) => (t || "").replace(/#\S+/g, "").replace(/[\u{1F000}-\u{1FFFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\uFE0F]/gu, "").replace(/\s+/g, " ").trim();
  const titel = ohneDeko(v.youtubeTitel || v.titel).slice(0, 100);
  const link = "https://astro-masters.com";
  let text = ohneDeko((v.caption || "").split("\n\n").slice(0, 2).join(" "));
  const zusatz = " Deinen Aszendenten berechnest du kostenlos auf astro-masters.com";
  text = (text.slice(0, 500 - zusatz.length) + zusatz).trim();
  return el("div", { class: "posten-kanal" },
    el("div", { class: "posten-kopf" }, ikon("pinterest", 16), el("b", { text: "Pinterest" })),
    el("div", { class: "hinweis", text: "Als Video-Pin hochladen (Video ohne Musik), Pinnwand wählen, Link immer setzen." }),
    f.video && teilenKnopf("Video", f.video),
    textBlock("Pinnwand", pinnwand, "Pinnwand kopieren"),
    textBlock("Titel", titel, "Titel kopieren"),
    textBlock("Beschreibung", text, "Beschreibung kopieren"),
    textBlock("Link", link, "Link kopieren"));
}

export function postenDialog(e, v, beiBearbeiten) {
  const d = dialog(e.titel || v.titel);
  const f = v.dateien || {};
  const kurz = f.video || f.youtube;
  d.inhalt.append(
    haekchen(e, v, d),

    (f.video || f.lang) && el("video", { class: "posten-video", src: f.video || f.lang, poster: f.cover || f.thumbnail || null,
      controls: true, playsinline: true, preload: "none" }),

    kurz && el("div", { class: "posten-kanal" },
      el("div", { class: "posten-kopf" }, ikon("tiktok", 16), ikon("instagram", 16), ikon("facebook", 16), el("b", { text: "TikTok, Instagram & Facebook" })),
      el("div", { class: "hinweis", text: "Video ohne Musik. Den Sound wählst du in der App." }),
      f.video && teilenKnopf("Video", f.video),
      el("div", { class: "posten-reihe" },
        f.cover && teilenKnopf("Cover 9:16", f.cover, "raster"),
        f.cover34 && teilenKnopf("Cover 3:4", f.cover34, "raster")),
      textBlock("Caption", v.caption, "Caption kopieren")),

    kurz && el("div", { class: "posten-kanal" },
      el("div", { class: "posten-kopf" }, ikon("youtube", 16), el("b", { text: "YouTube Shorts" })),
      el("div", { class: "hinweis", text: "Fassung mit Musik, direkt so hochladen." }),
      f.youtube && teilenKnopf("Video mit Musik", f.youtube),
      textBlock("Titel", v.youtubeTitel, "Titel kopieren"),
      textBlock("Beschreibung", v.youtubeText, "Beschreibung kopieren")),

    pinterestBlock(v, f),

    el("div", { class: "posten-kanal" },
      el("div", { class: "posten-kopf" }, ikon("youtube", 16), el("b", { text: "YouTube Video" })),
      f.lang && !istErledigt(v)
        ? [el("div", { class: "hinweis", text: "Langes Video im Querformat, mit Thumbnail." }),
           teilenKnopf("Video", f.lang),
           f.thumbnail && teilenKnopf("Thumbnail", f.thumbnail, "raster"),
           textBlock("Titel", v.langTitel, "Titel kopieren"),
           textBlock("Beschreibung", v.langText, "Beschreibung kopieren")]
        : el("div", { class: "hinweis", text: istErledigt(v) ? "Erledigt." : "Das lange Video zu diesem Thema ist noch nicht fertig." })),

    el("button", { class: "zufuegen", text: "Eintrag bearbeiten", onclick: () => { d.zu(); beiBearbeiten(); } }),
    el("button", { class: "posten-zu", text: "Schließen", onclick: () => d.zu() }),
  );
}
