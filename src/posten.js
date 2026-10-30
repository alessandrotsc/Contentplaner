/**
 * Videoablage: fertige Videos liegen auf dem Content-Hub-Server (Mac lädt sie per
 * tools/ablage.py hoch) und werden über Metricool automatisch gepostet (User 29.10.2026).
 * Der Server hakt sie nach der Sendezeit selbst ab und löscht die Videodatei.
 * Am Kalendereintrag (verknüpft über planKey) zeigt die App nur noch zum Ansehen:
 * Vorschau, Titel, Caption und den Stand (eingeplant bzw. veröffentlicht).
 *
 * meta: dateien.video/youtube/lang/cover/thumbnail, caption, youtubeTitel, youtubeText, langTitel, langText,
 * dazu zum Prüfen (30.10.2026): hooks, skript, hashtags, langSkript, langTitelPlan. Ohne Dateien = nur Skript.
 * geplant: { posts: [{ plattformen: ["tiktok", ...], zeit: ISO }] } (vom Server, sonst null).
 */

import * as Server from "./server.js";
import { el, ikon, dialog } from "./ui.js";

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

/** Stories aus der Ablage (Ordner stories-<kanal>, meta.typ "story"), getrennt von den Videos. */
export const ablageStories = () => videos.filter((v) => v.typ === "story");

export const zuEintrag = (e) => (e?.planKey && videos.find((v) => v.key === e.planKey)) || null;
export const istErledigt = (v) => !!v?.status?.erledigt;

/** Eingeplante Sendezeiten (über Metricool), früheste zuerst. */
export function geplanteZeiten(v) {
  const posts = (v?.geplant || v?.status?.geplant)?.posts || [];
  return posts.filter((p) => p?.zeit && !isNaN(new Date(p.zeit))).sort((a, b) => new Date(a.zeit) - new Date(b.zeit));
}

const TAGE = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];
const MON = ["Jan", "Feb", "Mär", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dez"];
/** Nur zur Anzeige (Sendezeit in lokaler Zeit), nie zum Speichern. */
export function zeitText(iso, mitTag = true) {
  const d = new Date(iso);
  const uhr = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  return mitTag ? `${TAGE[d.getDay()]}, ${d.getDate()}. ${MON[d.getMonth()]}, ${uhr}` : uhr;
}

/* Geladene Dateien bleiben im Speicher, solange die App offen ist (für die Stories). */
const geladen = new Map();

export async function laden(url, beiFortschritt) {
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

/** Text nur zum Lesen. */
function textBlock(titel, text) {
  if (!text) return null;
  return el("div", { class: "feld" }, el("label", { text: titel }), el("div", { class: "posten-text", text }));
}

/** Stand oben im Dialog: veröffentlicht oder eingeplant. */
function standBlock(v) {
  if (istErledigt(v)) {
    return el("div", { class: "posten-kanal erledigt-box" },
      el("div", { class: "posten-kopf" }, el("b", { text: "✓ Veröffentlicht" })));
  }
  const zeiten = geplanteZeiten(v);
  if (!zeiten.length) return null;
  return el("div", { class: "posten-kanal" },
    zeiten.map((p) => el("div", { class: "posten-kopf" }, ikon("kalender", 16),
      el("b", { text: `Eingeplant für ${zeitText(p.zeit)}` }),
      p.plattformen?.length ? el("small", { class: "posten-pl", text: p.plattformen.join(", ") }) : null)));
}

export function postenDialog(e, v, beiBearbeiten) {
  const d = dialog(e.titel || v.titel);
  const f = v.dateien || {};
  const film = f.video || f.youtube || f.lang;
  const bild = f.cover || f.thumbnail;
  d.inhalt.append(...[   // Leere Teile (null/undefined) nicht als Text anhängen
    standBlock(v),

    film ? el("video", { class: "posten-video", src: film, poster: bild || null, controls: true, playsinline: true, preload: "none" })
         : bild && el("img", { class: "posten-video", src: bild, alt: "" }),

    film ? null : el("div", { class: "posten-kanal" }, el("div", { class: "posten-kopf" }, el("b", { text: "Skript zum Prüfen, Video noch nicht gebaut" }))),
    textBlock("Hook (gewählt und Varianten)", v.hooks),
    textBlock("Skript Short", v.skript),
    textBlock("Hashtags", v.hashtags),
    textBlock("Caption", v.caption),
    textBlock("YouTube Shorts Titel", v.youtubeTitel),
    textBlock("YouTube Shorts Beschreibung", v.youtubeText),
    textBlock("YouTube Video Titel", v.langTitel),
    textBlock("YouTube Video Beschreibung", v.langText),
    textBlock("YouTube Video Titel (geplant)", v.langTitel ? null : v.langTitelPlan),
    textBlock("Skript YouTube Video", v.langSkript),

    el("button", { class: "zufuegen", text: "Eintrag bearbeiten", onclick: () => { d.zu(); beiBearbeiten(); } }),
    el("button", { class: "posten-zu", text: "Schließen", onclick: () => d.zu() }),
  ].filter(Boolean));
}
