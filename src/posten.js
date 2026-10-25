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

/** Plattformen, die für dieses Video abgehakt werden müssen. */
function zielPlattformen(v) {
  const f = v.dateien || {};
  const kurz = f.video || f.youtube || v.youtubeTitel || v.caption;
  return [
    kurz && { id: "tiktok", name: "TikTok", ikon: "tiktok" },
    kurz && { id: "instagram", name: "Instagram", ikon: "instagram" },
    kurz && { id: "facebook", name: "Facebook", ikon: "facebook" },
    kurz && { id: "shorts", name: "YT Shorts", ikon: "youtube" },
    (f.lang || v.langTitel) && { id: "youtube", name: "YouTube lang", ikon: "youtube" },
  ].filter(Boolean);
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

/** Zeile mit einem Knopf je Plattform zum Abhaken. */
function haekchen(e, v, d) {
  const ziel = zielPlattformen(v);
  const an = { ...(v.status?.plattformen || {}) };
  if (istErledigt(v)) {
    return el("div", { class: "posten-kanal erledigt-box" },
      el("div", { class: "posten-kopf" }, ikon("haken", 16), el("b", { text: "Erledigt" })),
      el("div", { class: "hinweis", text: "Auf allen Plattformen eingeplant oder hochgeladen. Das Video ist vom Server gelöscht, Cover und Texte bleiben." }));
  }
  const knoepfe = ziel.map((p) => {
    const b = el("button", { class: "abhaken" + (an[p.id] ? " an" : ""), onclick: klick }, ikon(p.ikon, 15), el("span", { text: p.name }));
    async function klick(ev) {
      ev.preventDefault();
      an[p.id] = !an[p.id];
      b.classList.toggle("an", an[p.id]);
      const alle = ziel.every((x) => an[x.id]);
      if (alle && !confirm("Alles abgehakt. Video als erledigt markieren und vom Server löschen?")) {
        an[p.id] = false; b.classList.remove("an"); return;
      }
      try {
        await statusSenden(v, an, alle);
        if (alle) {
          if (e?.id && S.eintrag(e.id)) S.eintragSpeichern({ id: e.id, status: "online" });
          d.zu(); neu();
        }
      } catch (err) {
        an[p.id] = !an[p.id]; b.classList.toggle("an", an[p.id]);
        alert("Speichern ging nicht: " + err.message);
      }
    }
    return b;
  });
  return el("div", { class: "posten-kanal" },
    el("div", { class: "posten-kopf" }, ikon("haken", 16), el("b", { text: "Eingeplant oder hochgeladen" })),
    el("div", { class: "hinweis", text: "Abhaken, sobald es auf der Plattform geplant oder online ist. Sind alle abgehakt, wird das Video vom Server gelöscht." }),
    el("div", { class: "abhaken-reihe" }, knoepfe));
}

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
