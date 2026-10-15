/**
 * Mehr: Projekte und Plattformen, Verbindungen zu den Schnittstellen,
 * Datei einlesen, Backup.
 */

import * as S from "./store.js";
import * as D from "./datum.js";
import { neu } from "./zustand.js";
import { el, ikon, dialog, feld } from "./ui.js";
import { quelleFuer, abgleichen } from "./quellen.js";

export function mehrBereich() {
  return el("div", { class: "seite" },
    el("div", { class: "abschnitt-titel", text: "Projekte und Plattformen" }),
    S.projekte().map(projektKarte),
    el("button", { class: "zufuegen", text: "Projekt hinzufügen", onclick: () => projektDialog() }),

    el("div", { class: "abschnitt-titel", text: "Daten" }),
    datenKarte(),

    el("div", { class: "abschnitt-titel", text: "Als App nutzen" }),
    el("div", { class: "karte-gross" },
      el("p", { class: "detail-text", text: "iPhone: in Safari öffnen, Teilen-Knopf, „Zum Home-Bildschirm“. Danach startet der Planer wie eine App, ohne Adressleiste, und funktioniert auch offline." }),
      el("p", { class: "hinweis", text: "Alle Daten liegen auf diesem Gerät. Mac und iPhone gleichen sich noch nicht automatisch ab, dafür Backup exportieren und auf dem anderen Gerät einlesen." })),
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
      S.verbindungSetzen(pl.id, geaendert ? Object.fromEntries(q.felder.map((f) => [f.id, zugang[f.id].trim()])) : alteV);
      if (geaendert) abgleichen(S.plattformVon(pl.id)).catch((e) => alert("Abruf fehlgeschlagen: " + e.message)).finally(() => neu());
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
      onclick: () => { S.verbindungSetzen(pl.id, null); d.zu(); neu(); } }));
    if (q.felder) zugangBox.append(el("div", { class: "hinweis", text: "Zugangsdaten bleiben nur auf diesem Gerät gespeichert." }));
  }
  zugangZeichnen();
  d.inhalt.append(zugangBox);

  if (vorgabe) {
    d.inhalt.append(el("button", { class: "gefahr", text: "Plattform entfernen",
      onclick: () => {
        if (!confirm("Plattform entfernen? Die Zahlen dazu werden gelöscht.")) return;
        p.plattformen = p.plattformen.filter((x) => x.id !== pl.id);
        S.verbindungSetzen(pl.id, null);
        S.messungen([pl.id]).forEach((m) => S.messungLoeschen(m.id));
        S.projektSpeichern(p);
        d.zu(); neu({ plattformId: null });
      } }));
  }
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
