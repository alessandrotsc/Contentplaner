/** Kleine DOM-Helfer und die Icons. Bewusst ohne Framework. */

export function el(tag, attrs = {}, ...kinder) {
  const n = document.createElement(tag);
  for (const [s, w] of Object.entries(attrs)) {
    if (s === "class") n.className = w;
    else if (s === "html") n.innerHTML = w;
    else if (s === "text") n.textContent = w;
    else if (s.startsWith("on")) n.addEventListener(s.slice(2).toLowerCase(), w);
    else if (s === "style" && typeof w === "object") Object.assign(n.style, w);
    else if (w !== null && w !== undefined && w !== false) n.setAttribute(s, w);
  }
  for (const kind of kinder.flat()) {
    if (kind === null || kind === undefined || kind === false) continue;
    n.append(kind.nodeType ? kind : document.createTextNode(kind));
  }
  return n;
}

const PFADE = {
  menue: "M3 6h18M3 12h18M3 18h18",
  zurueck: "M15 6l-6 6 6 6",
  vor: "M9 6l6 6-6 6",
  plus: "M12 5v14M5 12h14",
  zu: "M6 6l12 12M18 6L6 18",
  haken: "M4 12l5 5L20 6",
  muell: "M4 7h16M9 7V5h6v2M6 7l1 13h10l1-13",
  kopieren: "M9 9h10v10H9zM5 15V5h10",
  stift: "M4 20h4L19 9l-4-4L4 16z",
  kalender: "M4 6h16v14H4zM4 10h16M9 3v4M15 3v4",
  liste: "M4 6h16M4 12h16M4 18h16",
  raster: "M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z",
  ordner: "M3 7h6l2 2h10v10H3z",
  zahnrad: "M12 9a3 3 0 100 6 3 3 0 000-6M19 12l2 1-2 4-2-1a7 7 0 01-2 1v2h-4v-2a7 7 0 01-2-1l-2 1-2-4 2-1a7 7 0 010-2l-2-1 2-4 2 1a7 7 0 012-1V3h4v2a7 7 0 012 1l2-1 2 4-2 1a7 7 0 010 2",
  runter: "M6 9l6 6 6-6",
};

export function ikon(name, groesse) {
  const s = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  s.setAttribute("viewBox", "0 0 24 24");
  s.setAttribute("fill", "none");
  s.setAttribute("stroke", "currentColor");
  s.setAttribute("stroke-width", "1.9");
  s.setAttribute("stroke-linecap", "round");
  s.setAttribute("stroke-linejoin", "round");
  if (groesse) { s.style.width = groesse + "px"; s.style.height = groesse + "px"; }
  const p = document.createElementNS("http://www.w3.org/2000/svg", "path");
  p.setAttribute("d", PFADE[name] || "");
  s.append(p);
  return s;
}

export function ikonKnopf(name, beiKlick, klasse = "ikon-knopf") {
  return el("button", { class: klasse, onclick: beiKlick, "aria-label": name }, ikon(name));
}

/** Bottom-Sheet. Gibt ein Objekt mit .inhalt zum Fuellen und .zu() zurueck. */
export function dialog(titel, beimSpeichern) {
  const inhalt = el("div", { class: "dialog-inhalt" });
  const huelle = el("div", { class: "dialog-huelle" });
  const zu = () => huelle.remove();

  huelle.addEventListener("click", (e) => { if (e.target === huelle) zu(); });

  const kopf = el("div", { class: "dialog-kopf" },
    ikonKnopf("zu", zu),
    el("b", { text: titel }),
    beimSpeichern && el("button", {
      class: "speichern",
      onclick: () => { if (beimSpeichern() !== false) zu(); },
      text: "Sichern",
    }),
  );

  huelle.append(el("div", { class: "dialog" }, kopf, inhalt));
  document.body.append(huelle);
  return { inhalt, zu };
}

export function feld(beschriftung, ...kinder) {
  return el("div", { class: "feld" },
    beschriftung && el("label", { text: beschriftung }), ...kinder);
}

/** Auswahlreihe aus Pillen. werte = [{id, name}] */
export function pillen(werte, aktiv, beiWahl) {
  const box = el("div", { class: "wahl" });
  werte.forEach((w) => {
    const b = el("button", {
      class: w.id === aktiv ? "an" : "",
      text: w.name,
      onclick: () => {
        box.querySelectorAll("button").forEach((x) => x.classList.remove("an"));
        b.classList.add("an");
        beiWahl(w.id);
      },
    });
    box.append(b);
  });
  return box;
}

export function inZwischenablage(text, knopf) {
  const fertig = () => {
    const alt = knopf.lastChild.textContent;
    knopf.classList.add("fertig");
    knopf.lastChild.textContent = "Kopiert";
    setTimeout(() => {
      knopf.classList.remove("fertig");
      knopf.lastChild.textContent = alt;
    }, 1400);
  };
  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(text).then(fertig).catch(() => ersatz(text, fertig));
  } else ersatz(text, fertig);
}

/** Safari im Standalone-Modus verweigert die Clipboard-API manchmal. */
function ersatz(text, fertig) {
  const t = el("textarea", { style: { position: "fixed", opacity: "0" } });
  t.value = text;
  document.body.append(t);
  t.select();
  try { document.execCommand("copy"); fertig(); } catch (e) { /* still */ }
  t.remove();
}
