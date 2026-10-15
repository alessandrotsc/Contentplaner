/**
 * Schnittstellen zu den Plattformen. Jede Quelle liefert Messungen im selben
 * Format: { plattformId, von, bis, quelle, werte: { follower, aufrufe, ... } }.
 *
 * Die Abrufe laufen direkt aus der App (beide APIs erlauben das per CORS).
 * Zugangsdaten liegen nur auf dem Geraet, nie im Code oder auf GitHub.
 *
 * Instagram  Instagram API mit Instagram-Login, langlebiger Token (60 Tage,
 *            wird automatisch verlaengert). Tageswerte bis 30 Tage zurueck.
 * TikTok     Display API (user.info.stats, video.list). TikTok liefert nur
 *            Gesamtstaende, die Tageswerte entstehen aus der Differenz zum
 *            letzten Abruf. Darum: App regelmaessig oeffnen.
 * YouTube    noch nicht gebaut (kommt mit dem ersten YouTube-Kanal).
 */

import * as S from "./store.js";
import * as D from "./datum.js";
import * as Server from "./server.js";

const IG = "https://graph.instagram.com/v25.0";
const TT = "https://open.tiktokapis.com/v2";
const SECHS_STUNDEN = 6 * 3600 * 1000;

export const QUELLEN = {
  instagram: {
    direkt: true,
    felder: [{ id: "token", name: "Zugriffstoken", lang: true }],
    anleitung: [
      "developers.facebook.com öffnen, App anlegen, Anwendungsfall „Instagram API mit Instagram-Login“.",
      "Unter „API-Einrichtung mit Instagram-Login“ das Konto hinzufügen und „Token generieren“.",
      "Berechtigungen: instagram_business_basic und instagram_business_manage_insights.",
      "Token hier einfügen. Er wird alle 30 Tage von selbst verlängert, solange du die App ab und zu öffnest.",
    ],
    abrufen: instagramAbrufen,
  },
  tiktok: {
    direkt: true,
    felder: [
      { id: "clientKey", name: "Client Key" },
      { id: "clientSecret", name: "Client Secret" },
      { id: "refreshToken", name: "Refresh-Token", lang: true },
    ],
    anleitung: [
      "developers.tiktok.com: App anlegen, Produkt „Login Kit“ mit den Scopes user.info.basic, user.info.stats, video.list.",
      "Im Sandbox-Modus das eigene Konto als Target User eintragen (keine Prüfung nötig).",
      "Am Mac einmal anmelden: python3 tools/tiktok_login.py (im Astromaster-Ordner), Refresh-Token aus tools/tiktok_token.json kopieren.",
      "Client Key, Secret und Refresh-Token hier einfügen. TikTok liefert nur Gesamtstände, Tageswerte entstehen aus dem Vergleich zum letzten Abruf.",
    ],
    abrufen: tiktokAbrufen,
  },
  youtube: {
    direkt: false,
    anleitung: ["Wird gebaut, sobald ein YouTube-Kanal startet (YouTube Analytics API mit Google-Login)."],
  },
};

export const quelleFuer = (typ) => QUELLEN[typ] || { direkt: false, anleitung: ["Für diese Plattform gibt es keine offene Schnittstelle. Werte von Hand eintragen."] };

/** Alle verbundenen Plattformen abrufen. Gibt die Zahl erfolgreicher Abrufe zurueck.
 *  Mit eingetragenem Server holt die App alles von dort statt direkt. */
export async function allesAbgleichen({ nurWennAlt = false } = {}) {
  if (Server.aktiv()) return Server.abgleichen();
  let n = 0;
  for (const pl of S.plattformen()) {
    const v = S.verbindung(pl.id);
    if (!v) continue;
    if (nurWennAlt && v.letzterAbruf && Date.now() - v.letzterAbruf < SECHS_STUNDEN) continue;
    try { await abgleichen(pl); n++; } catch (e) { console.warn(pl.typ, e); }
  }
  return n;
}

export async function abgleichen(pl) {
  const v = S.verbindung(pl.id);
  const q = quelleFuer(pl.typ);
  if (v?.server) return Server.abgleichen();
  if (!v || !q.abrufen) throw new Error("Nicht verbunden");
  try {
    const info = await q.abrufen(pl, v);
    v.letzterAbruf = Date.now();
    v.fehler = null;
    if (info) v.konto = info;
  } catch (e) {
    v.fehler = e.message;
    throw e;
  } finally {
    S.speichernAnstossen();
  }
}

async function holen(url, opt) {
  const r = await fetch(url, opt);
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.error?.message || (j.error?.code && j.error.code !== "ok")) {
    throw new Error(j.error?.message || j.error_description || `HTTP ${r.status}`);
  }
  return j;
}

const unix = (iso) => Math.floor(new Date(iso + "T00:00:00").getTime() / 1000);

/* ---------------------------------------------------------------- Instagram */

// Diese Kennzahlen liefert die API als Tagessumme (metric_type=total_value)
const IG_METRIKEN = {
  views: "aufrufe", reach: "reichweite", total_interactions: "interaktionen", likes: "likes",
  comments: "kommentare", shares: "geteilt", saves: "gespeichert", profile_links_taps: "linkklicks",
};

async function instagramAbrufen(pl, v) {
  // Token verlaengern, wenn aelter als 30 Tage (gilt 60 Tage)
  if (!v.tokenSeit || Date.now() - v.tokenSeit > 30 * 86400000) {
    try {
      const r = await holen(`https://graph.instagram.com/refresh_access_token?grant_type=ig_refresh_token&access_token=${v.token}`);
      v.token = r.access_token;
      v.tokenSeit = Date.now();
    } catch (e) {
      if (!v.tokenSeit) v.tokenSeit = Date.now();   // frischer Token laesst sich erst nach 24 h verlaengern
    }
  }

  const ich = await holen(`${IG}/me?fields=username,followers_count,media_count&access_token=${v.token}`);
  const heute = D.heute();

  // Beim ersten Mal 30 Tage zurueck, danach ab dem letzten Abruf (zwei Tage Ueberlappung,
  // weil Instagram die Werte des Vortags noch nachzieht)
  const letzter = v.letzterTag || D.plusTage(heute, -30);
  let tag = D.plusTage(letzter, -2);
  if (tag < D.plusTage(heute, -29)) tag = D.plusTage(heute, -29);

  v.ungueltig ||= [];
  const tage = [];
  while (tag <= heute) {
    const werte = {};
    const metriken = Object.keys(IG_METRIKEN).filter((m) => !v.ungueltig.includes(m));
    const zeit = `&metric_type=total_value&period=day&since=${unix(tag)}&until=${unix(D.plusTage(tag, 1))}&access_token=${v.token}`;
    let antwort;
    try {
      antwort = await holen(`${IG}/me/insights?metric=${metriken.join(",")}${zeit}`);
    } catch (e) {
      // Eine einzige unbekannte Kennzahl laesst die ganze Abfrage scheitern: einzeln pruefen und merken
      antwort = { data: [] };
      for (const m of metriken) {
        try { antwort.data.push(...(await holen(`${IG}/me/insights?metric=${m}${zeit}`)).data); }
        catch { v.ungueltig.push(m); }
      }
    }
    for (const x of antwort.data || []) werte[IG_METRIKEN[x.name]] = x.total_value?.value ?? 0;

    try {
      const f = await holen(`${IG}/me/insights?metric=follows_and_unfollows&breakdown=follow_type${zeit}`);
      for (const res of f.data?.[0]?.total_value?.breakdowns?.[0]?.results || []) {
        if (res.dimension_values[0] === "FOLLOWER") werte.neu = res.value;
        if (res.dimension_values[0] === "NON_FOLLOWER") werte.verloren = res.value;
      }
    } catch { /* unter 100 Followern liefert Instagram das nicht */ }

    tage.push({ tag, werte });
    tag = D.plusTage(tag, 1);
  }

  // Followerkurve rueckwaerts aus dem heutigen Stand und den Tagesbewegungen
  let stand = ich.followers_count;
  for (let i = tage.length - 1; i >= 0; i--) {
    tage[i].werte.follower = stand;
    stand -= (tage[i].werte.neu || 0) - (tage[i].werte.verloren || 0);
  }
  tage.at(-1).werte.beitraege = ich.media_count;

  for (const t of tage) S.messungSpeichern({ plattformId: pl.id, von: t.tag, bis: t.tag, quelle: "api", werte: t.werte }, true);
  v.letzterTag = heute;
  return { name: "@" + ich.username };
}

/* ------------------------------------------------------------------- TikTok */

async function tiktokAbrufen(pl, v) {
  if (!v.accessToken || Date.now() > (v.ablauf || 0)) {
    const body = new URLSearchParams({ client_key: v.clientKey, client_secret: v.clientSecret,
      grant_type: "refresh_token", refresh_token: v.refreshToken });
    const r = await holen(`${TT}/oauth/token/`, { method: "POST", body,
      headers: { "Content-Type": "application/x-www-form-urlencoded" } });
    v.accessToken = r.access_token;
    v.refreshToken = r.refresh_token || v.refreshToken;
    v.ablauf = Date.now() + (r.expires_in - 120) * 1000;
  }
  const auth = { Authorization: `Bearer ${v.accessToken}` };

  const info = (await holen(`${TT}/user/info/?fields=display_name,username,follower_count,likes_count,video_count`, { headers: auth })).data.user;

  // Summen ueber alle Videos (video.list, 20 pro Seite)
  const summe = { aufrufe: 0, likes: 0, kommentare: 0, geteilt: 0 };
  let cursor = null, weiter = true, seiten = 0;
  while (weiter && seiten++ < 50) {
    const r = await holen(`${TT}/video/list/?fields=id,view_count,like_count,comment_count,share_count`, {
      method: "POST", headers: { ...auth, "Content-Type": "application/json" },
      body: JSON.stringify({ max_count: 20, ...(cursor ? { cursor } : {}) }) });
    for (const vid of r.data.videos || []) {
      summe.aufrufe += vid.view_count || 0;
      summe.likes += vid.like_count || 0;
      summe.kommentare += vid.comment_count || 0;
      summe.geteilt += vid.share_count || 0;
    }
    cursor = r.data.cursor;
    weiter = r.data.has_more;
  }

  const heute = D.heute();
  S.messungSpeichern({ plattformId: pl.id, von: heute, bis: heute, quelle: "api",
    werte: { follower: info.follower_count, beitraege: info.video_count } }, true);

  // Bewegung seit dem letzten Abruf als Zeitraum-Messung (Tag nach letztem Abruf bis heute)
  const alt = v.letzteSummen;
  if (alt && alt.datum < heute) {
    const werte = {};
    for (const [k, w] of Object.entries(summe)) werte[k] = Math.max(0, w - (alt[k] || 0));
    S.messungSpeichern({ plattformId: pl.id, von: D.plusTage(alt.datum, 1), bis: heute, quelle: "api", werte }, true);
  }
  if (!alt || alt.datum < heute) v.letzteSummen = { datum: heute, ...summe };
  return { name: "@" + (info.username || info.display_name) };
}
