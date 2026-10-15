/**
 * Abgleich mit dem eigenen Content-Hub-Server (Hetzner, Quellcode in
 * ~/Desktop/Claude Code/Content-Hub-Server). Ist er eingetragen, holt der Server
 * die Zahlen rund um die Uhr bei Instagram und TikTok, und die App zieht sie
 * nur noch ab. Die Zugangsdaten der Plattformen liegen dann auf dem Server,
 * nicht mehr auf dem Geraet. Mac und iPhone sehen dieselben Zahlen.
 *
 * Adresse und Server-Schluessel liegen pro Geraet (nicht im Backup), damit ein
 * weitergegebenes Backup keinen Zugang zum Server enthaelt.
 */

import * as S from "./store.js";

const KEY = "contentplaner.server";
const TAKT = 30_000;

export function einstellung() {
  try { return JSON.parse(localStorage.getItem(KEY)) || null; } catch { return null; }
}
export function einstellen(e) {
  try { e ? localStorage.setItem(KEY, JSON.stringify(e)) : localStorage.removeItem(KEY); } catch { /* privates Fenster */ }
}
export const aktiv = () => !!(einstellung()?.url && einstellung()?.schluessel);

async function anfrage(pfad, opt = {}) {
  const e = einstellung();
  const r = await fetch(e.url.replace(/\/+$/, "") + "/api" + pfad, { ...opt, cache: "no-store",
    headers: { Authorization: `Bearer ${e.schluessel}`, "Content-Type": "application/json" } });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.fehler || `Server antwortet mit ${r.status}`);
  return j;
}

/** Fuer den Knopf „Verbindung testen“: prueft Adresse und Schluessel. */
export async function testen(url, schluessel) {
  const alt = einstellung();
  einstellen({ url, schluessel });
  try { await anfrage("/daten?seit=" + Date.now()); }
  finally { einstellen(alt); }
}

let seit = 0;   // beim Start einmal alles, danach nur Geaendertes

/** Holt neue Zahlen und den Verbindungsstatus. Gibt die Zahl neuer Messungen zurueck. */
export async function abgleichen() {
  const r = await anfrage(`/daten?seit=${seit}`);
  for (const m of r.messungen) S.messungSpeichern(m, true);
  for (const pl of S.plattformen()) {
    const st = r.verbindungen[pl.id];
    const lokal = S.verbindung(pl.id);
    if (st) S.verbindungSetzen(pl.id, { server: true, ...st });
    else if (lokal?.server) S.verbindungSetzen(pl.id, null);   // auf dem Server getrennt
  }
  seit = r.jetzt - 5000;   // kleine Ueberlappung, falls waehrend der Abfrage geschrieben wurde
  S.speichernAnstossen();
  return r.messungen.length;
}

export async function verbindungSenden(plattformId, typ, zugang) {
  const st = await anfrage(`/verbindung/${encodeURIComponent(plattformId)}`,
    { method: "PUT", body: JSON.stringify({ typ, ...zugang }) });
  S.verbindungSetzen(plattformId, { server: true, ...st });
  await abgleichen();
  return st;
}

export async function verbindungTrennen(plattformId, zahlenLoeschen = false) {
  await anfrage(`/verbindung/${encodeURIComponent(plattformId)}${zahlenLoeschen ? "?zahlen=1" : ""}`, { method: "DELETE" });
  S.verbindungSetzen(plattformId, null);
}

/** Solange die App sichtbar ist, alle 30 Sekunden nachsehen. */
export function dauerabgleich(beiNeuem) {
  const los = () => {
    if (!aktiv() || document.visibilityState !== "visible") return;
    abgleichen().then((n) => beiNeuem(n)).catch((e) => console.warn("Server", e.message));
  };
  setInterval(los, TAKT);
  document.addEventListener("visibilitychange", los);
  los();
}
