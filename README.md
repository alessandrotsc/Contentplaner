# Contentplaner

Kalender für die Contentplanung über alle Kanäle. Aufbau und Bedienung nach
Google Kalender, Farben von Syncrate. Läuft als Webseite und lässt sich auf dem
iPhone wie eine App auf den Homescreen legen.

## Was drin ist

**Drei Ansichten**, umschaltbar über das Menü links oben:
- **Monat** wie im Google Kalender, sechs Wochen, Einträge als farbige Chips
- **Woche** mit Stundenraster, springt beim Öffnen auf 7 Uhr
- **Liste** zeigt die nächsten 45 Tage als Agenda, das ist die Arbeitsansicht

**Kanäle.** Jeder Kanal hat eine Farbe und lässt sich im Menü ein- und
ausblenden. Zwei sind vorangelegt, HausRund und Syncrate.

**Formate.** Pro Kanal die wiederkehrenden Videoarten, zum Beispiel
Vorher/Nachher oder Wusstest du. Jedes Format kann eine Caption-Vorlage haben.

**Einträge** mit Titel, Kanal, Format, Datum, Uhrzeit, Status, Caption, Notiz,
Ablageort und Vorschaubild.

**Status** von Idee über Skript, Gedreht, Im Schnitt, Fertig bis
Veröffentlicht. Der Status ist der Unterschied zu einem normalen Kalender: du
siehst nicht nur wann etwas rausgeht, sondern woran es gerade hängt.

**Wiederholungen:** jeden Tag, jede Woche, alle zwei Wochen, jeden Monat oder
benutzerdefiniert, also alle N Tage, Wochen oder Monate. Bei wöchentlichen
Serien lassen sich einzelne Wochentage anklicken. Ein einzelner Termin einer
Serie kann abgesagt werden, ohne die Serie zu zerstören.

**Caption kopieren.** Ein Knopf unter dem Caption-Feld legt den Text in die
Zwischenablage, damit er beim Hochladen nur noch eingefügt werden muss.

## Was bewusst nicht geht

**Die App kann nicht selbst in deine Fotos oder Ordner schauen.** Das erlaubt
iOS einer Webseite nicht, egal wie sie installiert ist. Dafür gibt es zwei
Wege im Eintrag:

1. **Ablageort** als Textfeld, zum Beispiel "Fotos › Album HausRund" oder ein
   iCloud-Link. Damit findest du das Material wieder.
2. **Vorschaubild** über den Datei-Auswähler. Das Bild wird auf 900 px
   verkleinert und im Eintrag gespeichert, damit man auf einen Blick sieht,
   worum es geht.

Wenn echter Ordnerzugriff gebraucht wird, führt kein Weg an einer nativen App
vorbei. Die Daten sind als JSON exportierbar und lassen sich mitnehmen.

## Daten und Backup

Alles liegt im Browser-Speicher dieses einen Geräts. Kein Server, kein Konto,
keine Synchronisation zwischen Handy und Rechner.

**Deshalb regelmäßig ein Backup ziehen:** Menü → Daten und Backup → Backup
exportieren. Das ist eine JSON-Datei. Über "Backup einlesen" kommt sie zurück,
auch auf einem anderen Gerät.

## Auf dem iPhone installieren

Die App muss über **https** oder **localhost** laufen, sonst startet der
Service Worker nicht und sie funktioniert offline nicht.

1. Ordner auf einen Webspace legen, zum Beispiel GitHub Pages wie beim
   Calisthenics-Tracker
2. Die Adresse in Safari öffnen, **nicht** in Chrome
3. Teilen-Knopf, dann "Zum Home-Bildschirm"

Zum Testen am Rechner reicht:

```
cd ~/Desktop/Claude\ Code/Contentplaner
python3 -m http.server 8931
```

Dann http://localhost:8931 im Browser öffnen.

## Aufbau des Codes

| Datei | Wofür |
|---|---|
| `index.html` | Gerüst, lädt Manifest und Service Worker |
| `src/store.js` | Daten, Speichern, Export und Import |
| `src/datum.js` | Datumsrechnung und die Wiederholungslogik |
| `src/ui.js` | DOM-Helfer, Icons, Dialog-Bausteine |
| `src/app.js` | Ansichten, Menü, Formulare |
| `src/styles.css` | Design, alle Farben als Variablen oben |
| `sw.js` | Offline-Cache |

**Zwei Dinge, die beim Ändern wichtig sind:**

1. **Nach jeder Änderung an den Dateien die `VERSION` in `sw.js` hochzählen.**
   Sonst zeigt das iPhone hartnäckig die alte Fassung aus dem Cache.
2. **Datumsangaben laufen als Text "JJJJ-MM-TT" durch die App**, nie als
   Date-Objekt in der Datenhaltung. Date rechnet in UTC, dadurch verschiebt
   sich in der Sommerzeit ein Termin um einen Tag. Gerechnet wird auf lokaler
   Mittagszeit, da ist der Abstand zur Zeitumstellung am größten.

Wiederholungen werden **nicht** als viele Einzeltermine gespeichert, sondern
als Regel am Eintrag. Beim Anzeigen eines Zeitraums werden die Vorkommen
berechnet. Sonst müllt eine tägliche Serie den Speicher zu und lässt sich
nachträglich nicht mehr sauber ändern.
