/**
 * Mehr: Projekte und Plattformen, Verbindungen zu den Schnittstellen,
 * Datei einlesen, Backup.
 */

import * as S from "./store.js";
import * as D from "./datum.js";
import { neu } from "./zustand.js";
import { el, ikon, dialog, feld } from "./ui.js";
import { quelleFuer, abgleichen } from "./quellen.js";
import * as Server from "./server.js";

export function mehrBereich() {
  return el("div", { class: "seite" },
    el("div", { class: "abschnitt-titel", text: "Projekte und Plattformen" }),
    S.projekte().map(projektKarte),
    el("button", { class: "zufuegen", text: "Projekt hinzufügen", onclick: () => projektDialog() }),

    el("div", { class: "abschnitt-titel", text: "Server" }),
    serverKarte(),

    el("div", { class: "abschnitt-titel", text: "Daten" }),
    datenKarte(),

    el("div", { class: "abschnitt-titel", text: "Als App nutzen" }),
    el("div", { class: "karte-gross" },
      el("p", { class: "detail-text", text: "iPhone: in Safari öffnen, Teilen-Knopf, „Zum Home-Bildschirm“. Danach startet der Planer wie eine App, ohne Adressleiste, und funktioniert auch offline." }),
      el("p", { class: "hinweis", text: Server.aktiv()
        ? "Die Zahlen kommen vom Server und sind auf jedem Gerät gleich. Kalender und Formate liegen noch auf dem Gerät, dafür Backup exportieren und auf dem anderen Gerät einlesen."
        : "Alle Daten liegen auf diesem Gerät. Mac und iPhone gleichen sich noch nicht automatisch ab, dafür Backup exportieren und auf dem anderen Gerät einlesen." })),
  );
}

/* ---------------------------------------------------------- Projekte */

function projektKarte(p) {
  return el("div", { class: "karte-gross projekt" },
    el("div", { class: "projekt-kopf" },
      el("span", { class: "fpunkt gross", style: { background: p.farbe } }),
      el("b", { text: p.name }),
      el("button", { class: "weg", "aria-label": "Bearbeiten", onclick: () => projektDialog(p) }, ikon("stift"))),
    p.plattformen.map((pl) => plattformZeile(p, pl)),
    el("button", { class: "zufuegen klein", text: "Plattform hinzufügen", onclick: () => plattformDialog(p) }));
}

function plattformZeile(p, pl) {
  const v = S.verbindung(pl.id);
  const q = quelleFuer(pl.typ);
  const status = v ? (v.fehler ? "Fehler" : "verbunden") : q.direkt ? "nicht verbunden" : "von Hand";
  return el("button", { class: "pl-zeile", onclick: () => plattformDialog(p, pl) },
    ikon(pl.typ, 18),
    el("div", {}, el("b", { text: S.plattformTyp(pl.typ).name }), el("small", { text: v?.konto?.name || pl.handle || "kein Handle" })),
    el("span", { class: "verb-status " + (v ? (v.fehler ? "fehler" : "an") : ""), text: status }));
}

function projektDialog(vorgabe) {
  const p = { name: "", farbe: S.PROJEKT_FARBEN[S.projekte().length % S.PROJEKT_FARBEN.length], ...(vorgabe || {}) };
  const d = dialog(vorgabe ? "Projekt" : "Neues Projekt", () => {
    if (!p.name.trim()) { alert("Das Projekt braucht einen Namen."); return false; }
    S.projektSpeichern(p);
    neu();
  });
  d.inhalt.append(feld("Name", el("input", { class: "eingabe", value: p.name, placeholder: "z.B. Astromaster",
    oninput: (ev) => (p.name = ev.target.value) })));
  const farben = el("div", { class: "wahl" });
  S.PROJEKT_FARBEN.forEach((f) => {
    const b = el("button", { class: "farbe" + (f === p.farbe ? " an" : ""), style: { background: f },
      onclick: (ev) => { ev.preventDefault(); p.farbe = f; farben.querySelectorAll(".farbe").forEach((x) => x.classList.remove("an")); b.classList.add("an"); } });
    farben.append(b);
  });
  d.inhalt.append(feld("Farbe", farben));
  if (vorgabe) {
    d.inhalt.append(el("button", { class: "gefahr", text: "Projekt löschen",
      onclick: () => {
        if (confirm(`${p.name} mit allen Einträgen, Formaten und Zahlen löschen?`)) { S.projektLoeschen(p.id); d.zu(); neu({ projektId: null, plattformId: null }); }
      } }));
  }
}

/* ------------------------------------------------- Plattform + Verbindung */

function plattformDialog(p, vorgabe) {
  const pl = vorgabe ? { ...vorgabe } : { typ: "instagram", handle: "" };
  const alteV = vorgabe && S.verbindung(vorgabe.id);
  const zugang = { ...(alteV || {}) };

  const d = dialog(vorgabe ? S.plattformTyp(pl.typ).name : "Neue Plattform", () => {
    if (vorgabe) Object.assign(p.plattformen.find((x) => x.id === pl.id), pl);
    else { const neuPl = S.neuePlattform(pl.typ, pl.handle); pl.id = neuPl.id; p.plattformen.push(neuPl); }
    const q = quelleFuer(pl.typ);
    const ausgefuellt = q.felder?.every((f) => zugang[f.id]?.trim());
    if (ausgefuellt) {
      const geaendert = !alteV || q.felder.some((f) => zugang[f.id] !== alteV[f.id]);
      // Neue Zugangsdaten: Abrufstand zuruecksetzen, damit frisch geladen wird
      const neuerZugang = Object.fromEntries(q.felder.map((f) => [f.id, zugang[f.id].trim()]));
      if (Server.aktiv() && geaendert) {
        // Zugangsdaten gehen an den Server und bleiben nicht auf dem Geraet
        S.projektSpeichern(p);
        Server.verbindungSenden(pl.id, pl.typ, neuerZugang)
          .then((st) => { if (st.fehler) alert("Server meldet: " + st.fehler); })
          .catch((e) => alert("Server nicht erreichbar: " + e.message)).finally(() => neu());
      } else {
        S.verbindungSetzen(pl.id, geaendert ? neuerZugang : alteV);
        if (geaendert) abgleichen(S.plattformVon(pl.id)).catch((e) => alert("Abruf fehlgeschlagen: " + e.message)).finally(() => neu());
      }
    } else S.projektSpeichern(p);
    neu();
  });

  if (!vorgabe) {
    const typWahl = el("select", { class: "eingabe", onchange: (ev) => { pl.typ = ev.target.value; zugangZeichnen(); } });
    S.PLATTFORM_TYPEN.forEach((t) => typWahl.append(el("option", { value: t.id }, t.name)));
    d.inhalt.append(feld("Plattform", typWahl));
  }
  d.inhalt.append(feld("Handle", el("input", { class: "eingabe", value: pl.handle, placeholder: "@name",
    oninput: (ev) => (pl.handle = ev.target.value) })));

  const zugangBox = el("div");
  function zugangZeichnen() {
    zugangBox.innerHTML = "";
    const q = quelleFuer(pl.typ);
    zugangBox.append(el("div", { class: "menue-titel", text: "Schnittstelle" }));
    if (alteV) {
      zugangBox.append(el("div", { class: "detail-zeile" }, el("small", { text: "Status" }),
        el("b", { text: alteV.fehler ? "Fehler: " + alteV.fehler
          : alteV.letzterAbruf ? `verbunden${alteV.konto?.name ? " als " + alteV.konto.name : ""}, zuletzt ${new Date(alteV.letzterAbruf).toLocaleString("de-DE", { dateStyle: "short", timeStyle: "short" })}` : "verbunden, noch nicht abgerufen" })));
    }
    zugangBox.append(el("ol", { class: "anleitung" }, q.anleitung.map((t) => el("li", { text: t }))));
    (q.felder || []).forEach((f) => {
      const inp = el(f.lang ? "textarea" : "input", { class: "eingabe" + (f.lang ? " token" : ""), placeholder: f.name,
        autocomplete: "off", autocapitalize: "off", spellcheck: "false", oninput: (ev) => (zugang[f.id] = ev.target.value) });
      inp.value = zugang[f.id] || "";
      zugangBox.append(feld(f.name, inp));
    });
    if (alteV) zugangBox.append(el("button", { class: "gefahr", text: "Verbindung trennen",
      onclick: async () => {
        if (alteV.server) { try { await Server.verbindungTrennen(pl.id); } catch (e) { alert("Server nicht erreichbar: " + e.message); return; } }
        else S.verbindungSetzen(pl.id, null);
        d.zu(); neu();
      } }));
    if (q.felder) zugangBox.append(el("div", { class: "hinweis", text: alteV?.server
      ? "Die Zugangsdaten liegen auf eurem Server. Felder nur ausfüllen, um sie zu ersetzen."
      : Server.aktiv() ? "Die Zugangsdaten werden an euren Server geschickt und dort gespeichert, nicht auf diesem Gerät."
      : "Zugangsdaten bleiben nur auf diesem Gerät gespeichert." }));
  }
  zugangZeichnen();
  d.inhalt.append(zugangBox);

  if (vorgabe) {
    d.inhalt.append(el("button", { class: "gefahr", text: "Plattform entfernen",
      onclick: () => {
        if (!confirm("Plattform entfernen? Die Zahlen dazu werden gelöscht.")) return;
        p.plattformen = p.plattformen.filter((x) => x.id !== pl.id);
        if (alteV?.server) Server.verbindungTrennen(pl.id, true).catch(() => {});
        S.verbindungSetzen(pl.id, null);
        S.messungen([pl.id]).forEach((m) => S.messungLoeschen(m.id));
        S.projektSpeichern(p);
        d.zu(); neu({ plattformId: null });
      } }));
  }
}

/* -------------------------------------------------------------- Server */

function serverKarte() {
  const e = Server.einstellung();
  return el("div", { class: "karte-gross" },
    el("button", { class: "pl-zeile", onclick: serverDialog }, ikon("sync", 18),
      el("div", {}, el("b", { text: "Content-Hub-Server" }),
        el("small", { text: e?.url ? e.url.replace(/^https?:\/\//, "") : "Holt die Zahlen rund um die Uhr, auch wenn die App zu ist." })),
      el("span", { class: "verb-status " + (e?.url ? "an" : ""), text: e?.url ? "verbunden" : "nicht eingetragen" })));
}

function serverDialog() {
  const e = { url: "", schluessel: "", ...(Server.einstellung() || {}) };
  const meldung = el("div", { class: "hinweis" });
  const d = dialog("Server", () => {
    const url = e.url.trim(), schluessel = e.schluessel.trim();
    if (!url && !schluessel) { Server.einstellen(null); location.reload(); return; }
    meldung.textContent = "Prüfe Verbindung …";
    Server.testen(url, schluessel).then(async () => {
      Server.einstellen({ url, schluessel });
      // Schnittstellen, die bisher direkt auf diesem Geraet liefen, ziehen auf den Server um
      for (const pl of S.plattformen()) {
        const v = S.verbindung(pl.id), q = quelleFuer(pl.typ);
        if (v && !v.server && q.felder?.every((f) => v[f.id])) {
          await Server.verbindungSenden(pl.id, pl.typ, Object.fromEntries(q.felder.map((f) => [f.id, v[f.id]]))).catch(() => {});
        }
      }
      location.reload();
    }).catch((err) => { meldung.textContent = "Klappt nicht: " + err.message; });
    return false;
  });
  d.inhalt.append(
    el("p", { class: "detail-text", text: "Euer eigener Server bei Hetzner holt die Zahlen von Instagram und TikTok rund um die Uhr. Die App zeigt sie dann auf jedem Gerät gleich an und aktualisiert sich alle 30 Sekunden, solange sie offen ist." }),
    feld("Adresse", el("input", { class: "eingabe", value: e.url, placeholder: "https://…", inputmode: "url",
      autocomplete: "off", autocapitalize: "off", spellcheck: "false", oninput: (ev) => (e.url = ev.target.value) })),
    feld("Server-Schlüssel", el("input", { class: "eingabe", value: e.schluessel, type: "password",
      autocomplete: "off", autocapitalize: "off", spellcheck: "false", oninput: (ev) => (e.schluessel = ev.target.value) })),
    meldung,
    el("div", { class: "hinweis", text: "Adresse und Schlüssel bleiben nur auf diesem Gerät und kommen nicht ins Backup. Beide Felder leeren und speichern, um den Server zu entfernen." }));
}

/* --------------------------------------------------------------- Daten */

function datenKarte() {
  const datei = el("input", { type: "file", accept: "application/json,.json", style: { display: "none" },
    onchange: (ev) => {
      const f = ev.target.files[0];
      if (!f) return;
      const leser = new FileReader();
      leser.onload = () => {
        try {
          const vorschau = JSON.parse(leser.result);
          if (vorschau.typ !== "projekt-import" && !confirm("Das ist ein komplettes Backup und ersetzt alles auf diesem Gerät. Weiter?")) return;
          const text = S.importieren(leser.result);
          neu();
          alert(text);
        } catch (err) { alert("Datei passt nicht: " + err.message); }
      };
      leser.readAsText(f);
      ev.target.value = "";
    } });

  return el("div", { class: "karte-gross" },
    el("button", { class: "pl-zeile", onclick: () => datei.click() }, ikon("ordner", 18),
      el("div", {}, el("b", { text: "Datei einlesen" }),
        el("small", { text: "Projekt-Import (z.B. astromaster-app.json) wird zusammengeführt, ein Backup ersetzt alles." }))),
    datei,
    el("button", { class: "pl-zeile", onclick: () => {
      const blob = new Blob([S.exportieren()], { type: "application/json" });
      const a = el("a", { href: URL.createObjectURL(blob), download: `contentplaner-${D.heute()}.json` });
      document.body.append(a); a.click(); a.remove();
    } }, ikon("kopieren", 18),
      el("div", {}, el("b", { text: "Backup exportieren" }), el("small", { text: "Alles inklusive Zahlen und Zugangsdaten. Gut aufheben." }))),
    el("button", { class: "pl-zeile gefahr-zeile", onclick: () => {
      if (confirm("Wirklich alle Projekte, Einträge, Formate und Zahlen löschen?")) { S.allesLoeschen(); neu({ projektId: null, plattformId: null }); }
    } }, ikon("muell", 18), el("div", {}, el("b", { text: "Alles löschen" }))),
  );
}
