/**
 * Posten vom Handy: fertige Videos liegen auf dem Content-Hub-Server (Mac lädt sie per
 * tools/ablage.py hoch). Am Kalendereintrag (verknüpft über planKey) erscheinen Video,
 * Cover, Caption und YouTube-Texte. „Teilen“ öffnet das Teilen-Menü des iPhones:
 * direkt an TikTok, Instagram oder YouTube, oder „Video sichern“ in Fotos.
 *
 * TikTok und Instagram bekommen video.mp4 (Musik kommt dort aus der App),
 * YouTube die Shorts-Fassung mit Musik.
 */

import * as Server from "./server.js";
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
  d.inhalt.append(
    f.video && el("video", { class: "posten-video", src: f.video, poster: f.cover || null,
      controls: true, playsinline: true, preload: "none" }),

    el("div", { class: "posten-kanal" },
      el("div", { class: "posten-kopf" }, ikon("tiktok", 16), ikon("instagram", 16), el("b", { text: "TikTok & Instagram" })),
      el("div", { class: "hinweis", text: "Video ohne Musik. Den Sound wählst du in der App." }),
      f.video && teilenKnopf("Video", f.video),
      el("div", { class: "posten-reihe" },
        f.cover && teilenKnopf("Cover 9:16", f.cover, "raster"),
        f.cover34 && teilenKnopf("Cover 3:4", f.cover34, "raster")),
      textBlock("Caption", v.caption, "Caption kopieren")),

    el("div", { class: "posten-kanal" },
      el("div", { class: "posten-kopf" }, ikon("youtube", 16), el("b", { text: "YouTube Shorts" })),
      el("div", { class: "hinweis", text: "Fassung mit Musik, direkt so hochladen." }),
      f.youtube && teilenKnopf("Video mit Musik", f.youtube),
      textBlock("Titel", v.youtubeTitel, "Titel kopieren"),
      textBlock("Beschreibung", v.youtubeText, "Beschreibung kopieren")),

    el("button", { class: "zufuegen", text: "Eintrag bearbeiten", onclick: () => { d.zu(); beiBearbeiten(); } }),
  );
}
