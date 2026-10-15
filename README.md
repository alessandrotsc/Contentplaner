# Contentplaner

Ein Ort für alle Kanäle: **Kalender, Formate, Analytics**. Läuft als Webseite
und lässt sich auf dem iPhone wie eine App auf den Homescreen legen
(Safari › Teilen › Zum Home-Bildschirm). Design nach syncrate.de.

Live: https://alessandrotsc.github.io/Contentplaner/

## Aufbau

Oben wählst du das **Projekt** (Alle, Astromaster, HausRund, SynCrate) und
darunter die **Plattform** (Alle, Instagram, TikTok ...). Die Auswahl gilt in
allen Bereichen. Unten die Tab-Leiste:

- **Kalender**: Monat, Woche, Liste. Einträge mit Projekt, Plattformen, Format,
  Status (Idee bis Veröffentlicht), Caption zum Kopieren, Wiederholungen.
- **Formate**: Formate je Projekt, bei Astromaster mit den 5 Säulen, der
  Reihenfolge (520 Videos) und dem Knopf „In den Kalender einplanen“
  (z.B. 5 am Tag ab morgen).
- **Analytics**: Zeitraum 7/28/90 Tage, 1 Jahr oder eigener. Follower mit
  Netto plus/minus, Neue Follower, Entfolgt, Aufrufe, Reichweite,
  Profilaufrufe, Interaktionen, Likes, Kommentare, Geteilt, Gespeichert,
  Link-Klicks, Einnahmen. Immer im Vergleich zum Zeitraum davor.
  Follower-Kurve, Tagesbalken, Aufteilung je Plattform.
- **Mehr**: Projekte und Plattformen, Schnittstellen, Datei einlesen, Backup.

## Woher die Zahlen kommen

| Plattform | Weg | Was |
|---|---|---|
| Instagram | Instagram API mit Instagram-Login, Token in der App | Tageswerte bis 30 Tage zurück, Follower-Verlauf |
| TikTok | Display API (Login Kit, Sandbox reicht) | Gesamtstände; Tageswerte aus dem Vergleich zum letzten Abruf |
| YouTube | noch nicht gebaut | kommt mit dem ersten Kanal |
| alle | „Werte eintragen“ | Tag oder Zeitraum von Hand |

Die App ruft beim Öffnen selbst ab (höchstens alle 6 Stunden) oder per Knopf.
Zugangsdaten bleiben auf dem Gerät, nie im Code.

## Astromaster-Plan einlesen

Am Mac: `python3 01_Contentplan/app_export.py` im Astromaster-Ordner, dann in der
App unter Mehr › Datei einlesen `astromaster-app.json` wählen. Wird
zusammengeführt: Kalender, Zahlen und eigene Formate bleiben.

## Später zur echten App

Reines HTML, CSS und JS-Module ohne Server. Mit Capacitor lässt sich der Ordner
unverändert als iOS-App verpacken; dann nur in `src/store.js` den `SPEICHER`
auf Capacitor Preferences umstellen.

## Grenzen

- Daten liegen pro Gerät. Mac und iPhone gleichen sich nicht von selbst ab
  (Backup exportieren und einlesen). Für echten Abgleich braucht es später
  einen kleinen Server (z.B. Cloudflare Worker).
- Eine Webseite darf auf dem iPhone nicht in Fotos oder Ordner schauen.

## Weiterbauen

1. Nach jeder Änderung `VERSION` in `sw.js` hochzählen.
2. Datumsangaben bleiben Text „JJJJ-MM-TT“, nie Date-Objekte speichern.
