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

const projektVon = (plattformId) => S.projekte().find((p) => p.plattformen.some((x) => x.id === plattformId));

/** Jedes Geraet vergibt eigene Plattform-IDs. Was der Server unter einer fremden ID kennt,
 *  wird ueber Projektname + Plattformtyp der passenden Plattform hier zugeordnet. */
function zuordnung(verbindungen) {
  const map = {};
  for (const [sid, st] of Object.entries(verbindungen)) {
    if (S.plattformVon(sid)) { map[sid] = sid; continue; }
    const pl = S.projekte().find((p) => p.name === st.projekt)?.plattformen.find((x) => x.typ === st.typ);
    if (pl) map[sid] = pl.id;
  }
  return map;
}

/** Holt neue Zahlen und den Verbindungsstatus. Gibt die Zahl neuer Messungen zurueck. */
export async function abgleichen() {
  const r = await anfrage(`/daten?seit=${seit}`);
  const map = zuordnung(r.verbindungen);
  let n = 0;
  for (const m of r.messungen) {
    const pid = map[m.plattformId] || (S.plattformVon(m.plattformId) && m.plattformId);
    if (pid) { S.messungSpeichern({ ...m, plattformId: pid }, true); n++; }
  }
  const verbunden = new Set();
  for (const [sid, st] of Object.entries(r.verbindungen)) {
    if (!map[sid]) continue;
    verbunden.add(map[sid]);
    S.verbindungSetzen(map[sid], { server: true, serverId: sid, ...st });
  }
  for (const pl of S.plattformen()) {
    if (S.verbindung(pl.id)?.server && !verbunden.has(pl.id)) S.verbindungSetzen(pl.id, null);   // auf dem Server getrennt
  }
  seit = r.jetzt - 5000;   // kleine Ueberlappung, falls waehrend der Abfrage geschrieben wurde
  S.speichernAnstossen();
  return n;
}

const serverId = (plattformId) => S.verbindung(plattformId)?.serverId || plattformId;

export async function verbindungSenden(plattformId, typ, zugang) {
  const sid = serverId(plattformId);
  const st = await anfrage(`/verbindung/${encodeURIComponent(sid)}`,
    { method: "PUT", body: JSON.stringify({ typ, projekt: projektVon(plattformId)?.name || "", ...zugang }) });
  S.verbindungSetzen(plattformId, { server: true, serverId: sid, ...st });
  await abgleichen();
  return st;
}

export async function verbindungTrennen(plattformId, zahlenLoeschen = false) {
  await anfrage(`/verbindung/${encodeURIComponent(serverId(plattformId))}${zahlenLoeschen ? "?zahlen=1" : ""}`, { method: "DELETE" });
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
