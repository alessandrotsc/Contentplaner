/**
 * Contentplaner. Aufbau und Bedienung nach Google Kalender, aber nur fuer
 * Content: jeder Eintrag gehoert zu einem Kanal, hat ein Format, einen Status
 * und eine Caption zum Kopieren.
 */

import * as S from "./store.js";
import * as D from "./datum.js";
import { el, ikon, ikonKnopf, dialog, feld, pillen, inZwischenablage } from "./ui.js";

const app = document.getElementById("app");

const zustand = {
  ansicht: "monat",      // monat | woche | agenda
  anker: D.heute(),      // Tag, auf den sich die Ansicht bezieht
  gewaehlt: D.heute(),
};

/* ------------------------------------------------------- Vorkommen sammeln */

/** Alle sichtbaren Eintraege, die an diesem Tag stattfinden. */
function anTag(tag) {
  const sichtbar = new Set(S.kanaele().filter((k) => k.sichtbar).map((k) => k.id));
  return S.eintraege()
    .filter((e) => sichtbar.has(e.kanalId) && D.faelltAuf(e, tag))
    .sort((a, b) => (a.zeit || "99").localeCompare(b.zeit || "99"));
}

const statusVon = (id) => S.STATUS.find((s) => s.id === id) || S.STATUS[0];

/* -------------------------------------------------------------- Kopfzeile */

function kopf() {
  const d = D.ausIso(zustand.anker);
  let titel = `${D.MONATE[d.getMonth()]} ${d.getFullYear()}`;
  if (zustand.ansicht === "woche") {
    const mo = D.montagDerWoche(zustand.anker);
    titel = `${D.kurzesDatum(mo)} bis ${D.kurzesDatum(D.plusTage(mo, 6))}`;
  }

  return el("div", { class: "kopf" },
    el("div", { class: "kopf-zeile" },
      ikonKnopf("menue", menueOeffnen),
      el("div", { class: "titel", text: titel }),
      el("button", { class: "heute-knopf", text: "Heute", onclick: () => {
        zustand.anker = D.heute();
        zustand.gewaehlt = D.heute();
        zeichnen();
      }}),
      ikonKnopf("zurueck", () => blaettern(-1)),
      ikonKnopf("vor", () => blaettern(1)),
    ),
    zustand.ansicht === "monat" && el("div", { class: "wochentage" },
      D.WOCHENTAGE.map((t) => el("span", { text: t }))),
  );
}

function blaettern(richtung) {
  if (zustand.ansicht === "monat") zustand.anker = D.plusMonate(zustand.anker, richtung);
  else if (zustand.ansicht === "woche") zustand.anker = D.plusTage(zustand.anker, 7 * richtung);
  else zustand.anker = D.plusTage(zustand.anker, 14 * richtung);
  zeichnen();
}

/* ---------------------------------------------------------- Ansicht Monat */

function monatsAnsicht() {
  const d = D.ausIso(zustand.anker);
  const tage = D.monatsRaster(d.getFullYear(), d.getMonth());
  const heute = D.heute();
  const raster = el("div", { class: "monat" });

  tage.forEach((tag) => {
    const fremd = D.ausIso(tag).getMonth() !== d.getMonth();
    const posten = anTag(tag);
    const klassen = ["zelle"];
    if (fremd) klassen.push("fremd");
    if (tag === heute) klassen.push("heute");
    if (tag === zustand.gewaehlt) klassen.push("gewaehlt");

    const zelle = el("div", {
      class: klassen.join(" "),
      onclick: () => {
        zustand.gewaehlt = tag;
        zustand.anker = tag;
        zustand.ansicht = "agenda";
        zeichnen();
      },
    }, el("div", { class: "tageszahl", text: String(D.ausIso(tag).getDate()) }));

    posten.slice(0, 3).forEach((e) => {
      const kn = S.kanal(e.kanalId);
      zelle.append(el("div", {
        class: "chip",
        style: { borderLeftColor: kn?.farbe || "#888" },
        text: e.titel || "Ohne Titel",
      }));
    });
    if (posten.length > 3) {
      zelle.append(el("div", { class: "mehr", text: `+${posten.length - 3}` }));
    }
    raster.append(zelle);
  });

  return el("div", { class: "blatt" }, raster);
}

/* ---------------------------------------------------------- Ansicht Woche */

function wochenAnsicht() {
  const mo = D.montagDerWoche(zustand.anker);
  const tage = Array.from({ length: 7 }, (_, i) => D.plusTage(mo, i));
  const heute = D.heute();

  const kopfZeile = el("div", { class: "woche-kopf" }, el("div"));
  tage.forEach((tag) => {
    kopfZeile.append(el("div", { class: tag === heute ? "heute" : "" },
      el("div", { class: "wt", text: D.WOCHENTAGE[D.wochentag(tag)] }),
      el("div", { class: "zahl", text: String(D.ausIso(tag).getDate()) }),
    ));
  });

  const stunden = el("div", { class: "stunde-spalte" });
  for (let h = 0; h < 24; h++) {
    stunden.append(el("div", { text: h ? `${String(h).padStart(2, "0")}:00` : "" }));
  }

  const raster = el("div", { class: "raster" }, stunden);
  tage.forEach((tag) => {
    const spalte = el("div", {
      class: "tag-spalte",
      onclick: () => { zustand.gewaehlt = tag; eintragDialog({ datum: tag }); },
    });
    for (let h = 0; h < 24; h++) spalte.append(el("div", { class: "stunde-linie" }));

    anTag(tag).forEach((e) => {
      const kn = S.kanal(e.kanalId);
      const [hh, mm] = (e.zeit || "09:00").split(":").map(Number);
      spalte.append(el("div", {
        class: "block",
        style: { top: ((hh + mm / 60) * 52) + "px", height: "48px",
                 borderLeftColor: kn?.farbe || "#888" },
        text: e.titel || "Ohne Titel",
        onclick: (ev) => { ev.stopPropagation(); eintragDialog(e, tag); },
      }));
    });
    raster.append(spalte);
  });

  const blatt = el("div", { class: "blatt" }, kopfZeile, raster);
  // Der Arbeitstag interessiert, nicht die Nacht
  setTimeout(() => { blatt.scrollTop = 7 * 52; }, 0);
  return blatt;
}

/* ------------------------------------------------- Ansicht Agenda und Tag */

function agendaAnsicht() {
  const start = zustand.anker;
  const box = el("div", { class: "agenda" });
  const heute = D.heute();
  let gefunden = 0;

  for (let i = 0; i < 45; i++) {
    const tag = D.plusTage(start, i);
    const posten = anTag(tag);
    if (!posten.length) continue;
    gefunden += posten.length;

    const gruppe = el("div", { class: "agenda-tag" },
      el("div", { class: "agenda-datum" + (tag === heute ? " ist-heute" : "") },
        el("b", { text: D.WOCHENTAGE[D.wochentag(tag)] + ", " + D.ausIso(tag).getDate() + ". " + D.MONATE[D.ausIso(tag).getMonth()] }),
        el("span", { text: tag === heute ? "heute" : "" }),
      ));

    posten.forEach((e) => gruppe.append(karte(e, tag)));
    box.append(gruppe);
  }

  if (!gefunden) {
    box.append(el("div", { class: "leer",
      text: "Ab hier steht nichts im Plan. Tipp unten rechts auf das Plus." }));
  }
  return el("div", { class: "blatt" }, box);
}

function karte(e, tag) {
  const kn = S.kanal(e.kanalId);
  const fm = e.formatId ? S.format(e.formatId) : null;
  const st = statusVon(e.status);

  const meta = [kn?.name, fm?.name, e.zeit].filter(Boolean);
  const metaBox = el("div", { class: "karte-meta" });
  meta.forEach((t, i) => {
    if (i) metaBox.append(el("span", { class: "punkt", text: "·" }));
    metaBox.append(el("span", { text: t }));
  });
  // Die Serienregel bekommt eine eigene Zeile. In der Meta-Zeile wuerde sie
  // umbrechen und den Trennpunkt am Zeilenende haengen lassen.
  const serie = e.wiederholung && e.wiederholung.art !== "einmal"
    ? el("div", { class: "karte-meta", style: { marginTop: "3px" } },
        el("span", { text: D.regelText(e.wiederholung) }))
    : null;

  return el("div", { class: "karte", onclick: () => eintragDialog(e, tag) },
    el("div", { class: "karte-strich", style: { background: kn?.farbe || "#888" } }),
    el("div", { class: "karte-text" },
      el("div", { class: "karte-titel", text: e.titel || "Ohne Titel" }),
      metaBox, serie,
    ),
    el("div", { class: "status-pille",
      style: { background: st.farbe + "22", color: st.farbe }, text: st.name }),
  );
}

/* ------------------------------------------------------------ Seitenmenue */

function menueOeffnen() {
  const schleier = el("div", { class: "schleier", onclick: () => zu() });
  const menue = el("div", { class: "menue" });
  const zu = () => {
    menue.classList.remove("auf");
    schleier.classList.remove("auf");
    setTimeout(() => { menue.remove(); schleier.remove(); }, 240);
  };

  const inhalt = el("div", { class: "menue-inhalt" });

  inhalt.append(el("div", { class: "menue-titel", text: "Ansicht" }));
  [["monat", "raster", "Monat"], ["woche", "kalender", "Woche"], ["agenda", "liste", "Liste"]]
    .forEach(([id, ik, name]) => {
      inhalt.append(el("button", {
        class: "menue-zeile" + (zustand.ansicht === id ? " aktiv" : ""),
        onclick: () => { zustand.ansicht = id; zu(); zeichnen(); },
      }, ikon(ik), name));
    });

  inhalt.append(el("div", { class: "menue-titel", text: "Kanäle" }));
  S.kanaele().forEach((kn) => {
    const kasten = el("span", {
      class: "kanal-punkt",
      style: { borderColor: kn.farbe, background: kn.sichtbar ? kn.farbe : "transparent" },
    }, kn.sichtbar ? ikon("haken") : null);

    inhalt.append(el("div", { class: "menue-zeile" + (kn.sichtbar ? "" : " kanal-aus") },
      el("button", {
        style: { display: "contents" },
        onclick: () => { S.sichtbarkeitUmschalten(kn.id); zu(); zeichnen(); },
      }, kasten),
      el("span", { class: "kanal-name", text: kn.name }),
      el("button", { class: "weg", onclick: () => { zu(); kanalDialog(kn); } }, ikon("stift")),
    ));
  });
  inhalt.append(el("button", { class: "menue-zeile", onclick: () => { zu(); kanalDialog(); } },
    ikon("plus"), "Kanal hinzufügen"));

  inhalt.append(el("div", { class: "menue-titel", text: "Verwaltung" }));
  inhalt.append(el("button", { class: "menue-zeile", onclick: () => { zu(); formatUebersicht(); } },
    ikon("liste"), "Formate"));
  inhalt.append(el("button", { class: "menue-zeile", onclick: () => { zu(); einstellungen(); } },
    ikon("zahnrad"), "Daten und Backup"));

  menue.append(
    el("div", { class: "menue-kopf" },
      el("b", { text: "Contentplaner" }),
      el("p", { text: `${S.eintraege().length} Einträge · ${S.kanaele().length} Kanäle` })),
    inhalt);

  document.body.append(schleier, menue);
  requestAnimationFrame(() => { schleier.classList.add("auf"); menue.classList.add("auf"); });
}

/* -------------------------------------------------------- Dialog: Eintrag */

function eintragDialog(vorgabe = {}, tagDerSerie = null) {
  const istNeu = !vorgabe.id;
  const e = {
    titel: "", kanalId: S.kanaele()[0]?.id, formatId: null,
    datum: zustand.gewaehlt, zeit: "", status: "idee",
    caption: "", notiz: "", ablage: "",
    wiederholung: { art: "einmal", intervall: 1, einheit: "woche", tage: [], bis: "" },
    ...vorgabe,
  };
  e.wiederholung = { art: "einmal", intervall: 1, einheit: "woche", tage: [], bis: "",
                     ...(e.wiederholung || {}) };

  const d = dialog(istNeu ? "Neuer Eintrag" : "Eintrag", () => {
    if (!e.titel.trim()) { alert("Der Eintrag braucht einen Titel."); return false; }
    S.eintragSpeichern(e);
    zeichnen();
  });

  // Titel
  d.inhalt.append(feld("Titel", el("input", {
    class: "eingabe", value: e.titel, placeholder: "z.B. Reel Heckenschnitt",
    oninput: (ev) => (e.titel = ev.target.value),
  })));

  // Kanal
  const kanalWahl = el("select", { class: "eingabe", onchange: (ev) => {
    e.kanalId = ev.target.value;
    formatWahlFuellen();
  }});
  S.kanaele().forEach((kn) =>
    kanalWahl.append(el("option", { value: kn.id, selected: kn.id === e.kanalId }, kn.name)));

  // Format, haengt am Kanal
  const formatWahl = el("select", { class: "eingabe",
    onchange: (ev) => (e.formatId = ev.target.value || null) });
  function formatWahlFuellen() {
    formatWahl.innerHTML = "";
    formatWahl.append(el("option", { value: "" }, "Kein Format"));
    S.formate(e.kanalId).forEach((f) =>
      formatWahl.append(el("option", { value: f.id, selected: f.id === e.formatId }, f.name)));
  }
  formatWahlFuellen();

  d.inhalt.append(el("div", { class: "zeile-2" },
    feld("Kanal", kanalWahl), feld("Format", formatWahl)));

  // Datum und Uhrzeit
  d.inhalt.append(el("div", { class: "zeile-2" },
    feld("Datum", el("input", { class: "eingabe", type: "date", value: e.datum,
      onchange: (ev) => (e.datum = ev.target.value) })),
    feld("Uhrzeit", el("input", { class: "eingabe", type: "time", value: e.zeit,
      onchange: (ev) => (e.zeit = ev.target.value) })),
  ));

  // Status
  d.inhalt.append(feld("Status",
    pillen(S.STATUS, e.status, (id) => (e.status = id))));

  // Wiederholung
  const extra = el("div");
  function extraZeichnen() {
    extra.innerHTML = "";
    const r = e.wiederholung;
    if (r.art === "einmal") return;

    if (r.art === "benutzerdefiniert") {
      const zahl = el("input", { class: "eingabe", type: "number", min: "1", value: r.intervall,
        oninput: (ev) => (r.intervall = Math.max(1, +ev.target.value || 1)) });
      const einheit = el("select", { class: "eingabe",
        onchange: (ev) => { r.einheit = ev.target.value; extraZeichnen(); } });
      [["tag", "Tage"], ["woche", "Wochen"], ["monat", "Monate"]].forEach(([id, n]) =>
        einheit.append(el("option", { value: id, selected: r.einheit === id }, n)));
      extra.append(el("div", { class: "zeile-2" },
        feld("Alle", zahl), feld("Einheit", einheit)));
    }

    const brauchtTage = r.art === "woechentlich" || r.art === "zweiwoechentlich"
      || (r.art === "benutzerdefiniert" && r.einheit === "woche");
    if (brauchtTage) {
      const reihe = el("div", { class: "tage-wahl" });
      D.WOCHENTAGE.forEach((name, i) => {
        reihe.append(el("button", {
          class: r.tage.includes(i) ? "an" : "", text: name,
          onclick: (ev) => {
            ev.preventDefault();
            r.tage = r.tage.includes(i) ? r.tage.filter((x) => x !== i) : [...r.tage, i];
            ev.target.classList.toggle("an");
          },
        }));
      });
      extra.append(feld("An diesen Tagen", reihe,
        el("div", { class: "hinweis",
          text: "Nichts gewählt heißt: am Wochentag des Startdatums." })));
    }

    extra.append(feld("Endet am", el("input", { class: "eingabe", type: "date", value: r.bis,
      onchange: (ev) => (r.bis = ev.target.value) }),
      el("div", { class: "hinweis", text: "Leer lassen für unbegrenzt." })));
  }

  d.inhalt.append(feld("Wiederholung",
    pillen(D.WIEDERHOLUNGEN, e.wiederholung.art, (id) => {
      e.wiederholung.art = id;
      extraZeichnen();
    }), extra));
  extraZeichnen();

  // Caption mit Kopierknopf
  const capFeld = el("textarea", { class: "eingabe",
    placeholder: "Text, der später unter das Video kommt",
    oninput: (ev) => (e.caption = ev.target.value) });
  capFeld.value = e.caption;
  const kopierKnopf = el("button", { class: "kopieren", onclick: (ev) => {
    ev.preventDefault();
    inZwischenablage(capFeld.value, kopierKnopf);
  }}, ikon("kopieren"), el("span", { text: "Caption kopieren" }));
  d.inhalt.append(feld("Caption", capFeld, kopierKnopf));

  // Notiz
  const notizFeld = el("textarea", { class: "eingabe", placeholder: "Hook, Ablauf, To-dos",
    oninput: (ev) => (e.notiz = ev.target.value) });
  notizFeld.value = e.notiz;
  d.inhalt.append(feld("Notiz", notizFeld));

  // Ablage
  d.inhalt.append(feld("Ablageort",
    el("input", { class: "eingabe", value: e.ablage,
      placeholder: "z.B. Fotos › Album HausRund, oder iCloud-Link",
      oninput: (ev) => (e.ablage = ev.target.value) }),
    el("div", { class: "hinweis",
      text: "Eine Webseite darf auf dem iPhone nicht selbst in deine Ordner schauen. "
          + "Trag hier hin, wo das Material liegt, oder häng unten ein Vorschaubild an." })));

  // Anhang
  const vorschau = el("div");
  function vorschauZeichnen() {
    vorschau.innerHTML = "";
    if (e.bild) {
      vorschau.append(el("img", { class: "anhang-vorschau", src: e.bild }));
      vorschau.append(el("button", { class: "zufuegen", text: "Vorschaubild entfernen",
        onclick: (ev) => { ev.preventDefault(); e.bild = null; vorschauZeichnen(); } }));
    }
  }
  const dateiWahl = el("input", { type: "file", accept: "image/*",
    style: { display: "none" },
    onchange: (ev) => {
      const datei = ev.target.files[0];
      if (!datei) return;
      verkleinern(datei, (datenUrl) => { e.bild = datenUrl; vorschauZeichnen(); });
    }});
  d.inhalt.append(feld("Vorschaubild",
    el("button", { class: "zufuegen", text: "Bild auswählen",
      onclick: (ev) => { ev.preventDefault(); dateiWahl.click(); } }),
    dateiWahl, vorschau));
  vorschauZeichnen();

  // Loeschen
  if (!istNeu) {
    if (e.wiederholung.art !== "einmal" && tagDerSerie) {
      d.inhalt.append(el("button", { class: "gefahr",
        text: `Nur den ${D.kurzesDatum(tagDerSerie)} absagen`,
        onclick: () => { S.vorkommenAbsagen(e.id, tagDerSerie); d.zu(); zeichnen(); } }));
    }
    d.inhalt.append(el("button", { class: "gefahr",
      text: e.wiederholung.art === "einmal" ? "Eintrag löschen" : "Ganze Serie löschen",
      onclick: () => {
        if (confirm("Wirklich löschen?")) { S.eintragLoeschen(e.id); d.zu(); zeichnen(); }
      }}));
  }
}

/** Bilder als Data-URL klein halten, sonst ist der Speicher schnell voll. */
function verkleinern(datei, fertig) {
  const leser = new FileReader();
  leser.onload = () => {
    const bild = new Image();
    bild.onload = () => {
      const max = 900;
      const f = Math.min(1, max / Math.max(bild.width, bild.height));
      const c = el("canvas");
      c.width = Math.round(bild.width * f);
      c.height = Math.round(bild.height * f);
      c.getContext("2d").drawImage(bild, 0, 0, c.width, c.height);
      fertig(c.toDataURL("image/jpeg", 0.72));
    };
    bild.src = leser.result;
  };
  leser.readAsDataURL(datei);
}

/* ---------------------------------------------------------- Dialog: Kanal */

function kanalDialog(vorgabe) {
  const kn = { name: "", farbe: S.KANAL_FARBEN[0], ...(vorgabe || {}) };
  const d = dialog(vorgabe ? "Kanal" : "Neuer Kanal", () => {
    if (!kn.name.trim()) { alert("Der Kanal braucht einen Namen."); return false; }
    S.kanalSpeichern(kn);
    zeichnen();
  });

  d.inhalt.append(feld("Name", el("input", { class: "eingabe", value: kn.name,
    placeholder: "z.B. HausRund Instagram",
    oninput: (ev) => (kn.name = ev.target.value) })));

  const farbReihe = el("div", { class: "wahl" });
  S.KANAL_FARBEN.forEach((f) => {
    const b = el("button", {
      style: { background: f, width: "40px", height: "40px", borderRadius: "12px",
               borderColor: f === kn.farbe ? "#fff" : "transparent", borderWidth: "2px",
               borderStyle: "solid" },
      onclick: (ev) => {
        ev.preventDefault();
        kn.farbe = f;
        farbReihe.querySelectorAll("button").forEach((x) => (x.style.borderColor = "transparent"));
        b.style.borderColor = "#fff";
      },
    });
    farbReihe.append(b);
  });
  d.inhalt.append(feld("Farbe", farbReihe));

  if (vorgabe) {
    d.inhalt.append(el("button", { class: "gefahr", text: "Kanal löschen",
      onclick: () => {
        if (confirm("Kanal samt seinen Einträgen und Formaten löschen?")) {
          S.kanalLoeschen(kn.id); d.zu(); zeichnen();
        }
      }}));
  }
}

/* ------------------------------------------------------- Formatuebersicht */

function formatUebersicht() {
  const d = dialog("Formate", null);

  function zeichnen2() {
    d.inhalt.innerHTML = "";
    if (!S.kanaele().length) {
      d.inhalt.append(el("div", { class: "leer", text: "Lege zuerst einen Kanal an." }));
      return;
    }
    S.kanaele().forEach((kn) => {
      d.inhalt.append(el("div", { class: "menue-titel",
        style: { padding: "16px 0 8px", color: kn.farbe }, text: kn.name }));

      S.formate(kn.id).forEach((f) => {
        d.inhalt.append(el("div", { class: "liste-zeile" },
          el("div", { style: { flex: "1", minWidth: "0" } },
            el("b", { text: f.name }),
            f.beschreibung && el("small", { text: f.beschreibung })),
          el("button", { class: "weg", onclick: () => { formatDialog(f, zeichnen2); } },
            ikon("stift")),
        ));
      });

      d.inhalt.append(el("button", { class: "zufuegen", text: "Format hinzufügen",
        onclick: () => formatDialog({ kanalId: kn.id }, zeichnen2) }));
    });

    d.inhalt.append(el("div", { class: "hinweis", style: { marginTop: "18px" },
      text: "Formate sind deine wiederkehrenden Videoarten, zum Beispiel "
          + "Vorher/Nachher, Wusstest du, Kundenstimme. Beim Anlegen eines Eintrags "
          + "wählst du eins aus und bekommst die hinterlegte Caption als Vorlage." }));
  }
  zeichnen2();
}

function formatDialog(vorgabe, danach) {
  const f = { name: "", beschreibung: "", caption: "", ...vorgabe };
  const d = dialog(f.id ? "Format" : "Neues Format", () => {
    if (!f.name.trim()) { alert("Das Format braucht einen Namen."); return false; }
    S.formatSpeichern(f);
    danach();
  });

  d.inhalt.append(feld("Name", el("input", { class: "eingabe", value: f.name,
    placeholder: "z.B. Vorher und Nachher",
    oninput: (ev) => (f.name = ev.target.value) })));

  const besch = el("textarea", { class: "eingabe", placeholder: "Wofür ist das Format, wie ist der Aufbau",
    oninput: (ev) => (f.beschreibung = ev.target.value) });
  besch.value = f.beschreibung;
  d.inhalt.append(feld("Beschreibung", besch));

  const cap = el("textarea", { class: "eingabe", placeholder: "Standardtext, den du jedes Mal anpasst",
    oninput: (ev) => (f.caption = ev.target.value) });
  cap.value = f.caption;
  d.inhalt.append(feld("Caption-Vorlage", cap));

  if (f.id) {
    d.inhalt.append(el("button", { class: "gefahr", text: "Format löschen",
      onclick: () => {
        if (confirm("Format löschen?")) { S.formatLoeschen(f.id); d.zu(); danach(); }
      }}));
  }
}

/* -------------------------------------------------------- Einstellungen */

function einstellungen() {
  const d = dialog("Daten und Backup", null);

  d.inhalt.append(el("div", { class: "hinweis", style: { marginTop: "12px" },
    text: "Alle Daten liegen nur auf diesem Gerät, es gibt keinen Server. "
        + "Mach ab und zu ein Backup, besonders bevor du iOS aktualisierst." }));

  d.inhalt.append(feld("Sichern", el("button", { class: "zufuegen", text: "Backup exportieren",
    onclick: () => {
      const blob = new Blob([S.exportieren()], { type: "application/json" });
      const a = el("a", { href: URL.createObjectURL(blob),
        download: `contentplaner-${D.heute()}.json` });
      document.body.append(a); a.click(); a.remove();
    }})));

  const datei = el("input", { type: "file", accept: "application/json",
    style: { display: "none" },
    onchange: (ev) => {
      const f = ev.target.files[0];
      if (!f) return;
      const leser = new FileReader();
      leser.onload = () => {
        try {
          S.importieren(leser.result);
          d.zu(); zeichnen();
          alert("Backup eingelesen.");
        } catch (err) { alert("Datei passt nicht: " + err.message); }
      };
      leser.readAsText(f);
    }});
  d.inhalt.append(feld("Wiederherstellen",
    el("button", { class: "zufuegen", text: "Backup einlesen",
      onclick: () => datei.click() }), datei,
    el("div", { class: "hinweis", text: "Ersetzt alles, was gerade drin ist." })));

  d.inhalt.append(el("button", { class: "gefahr", text: "Alles löschen und neu anfangen",
    onclick: () => {
      if (confirm("Wirklich alle Kanäle, Formate und Einträge löschen?")) {
        S.allesLoeschen(); d.zu(); zeichnen();
      }
    }}));
}

/* ------------------------------------------------------------------ Start */

function zeichnen() {
  app.innerHTML = "";
  const ansicht = zustand.ansicht === "monat" ? monatsAnsicht()
                : zustand.ansicht === "woche" ? wochenAnsicht()
                : agendaAnsicht();
  app.append(kopf(), ansicht);

  document.querySelector(".fab")?.remove();
  document.body.append(el("button", { class: "fab",
    onclick: () => eintragDialog({ datum: zustand.gewaehlt }) }, ikon("plus")));
}

S.beiAenderung(() => {});
zeichnen();
