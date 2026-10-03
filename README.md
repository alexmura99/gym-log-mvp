# Gym Log

Gym Log ist ein persönlicher Trainingsplaner und Workout-Logger für Krafttraining, gebaut für das Handy. Man plant die Woche, trägt im Gym Sätze live ein und bekommt aus dem letzten Training einen Vorschlag für das nächste Mal.

## Was die App kann

- **Plan:** Wochenplanung von Montag bis Sonntag mit Trainingstagen, Ruhetagen und geplanten Übungen. Tage lassen sich mit den Pfeilen oder am Rechner per Drag-and-Drop tauschen.
- **Live:** Ein Workout im Gym eintragen. Die geplanten Übungen von heute sind vorbelegt, das empfohlene Gewicht steht im ersten Satz. Die Eingaben bleiben als Entwurf erhalten, auch bei Tab-Wechsel oder Neuladen.
- **Nachtrag:** Vergangenes Training nachtragen und gespeicherte Workouts bearbeiten.
- **Historie:** Alle Workouts nach Wochen, mit den Sätzen pro Muskelgruppe und der Gesamtzahl der Sätze je Woche.
- **Profil:** Konto, eigene Übungen anlegen, umbenennen und löschen, Abmelden.
- **Empfehlung:** Zu jeder Übung zeigt die App die letzte Einheit und ein konkretes Ziel (Gewicht, Sätze, Wiederholungen).
- **Hinweise ohne Verbindung:** Fehlt das Netz, sagt die App das verständlich und lädt die Daten nach, sobald es wieder da ist.
- **Als App auf dem Home-Bildschirm:** Läuft auf dem iPhone im Vollbildmodus, mit eigenem Symbol.

## Technik

- Next.js 16 (App Router), React 19, TypeScript
- Supabase: Anmeldung per E-Mail und Passwort, Postgres mit Row Level Security (jeder Nutzer sieht nur seine eigenen Daten)
- Tailwind CSS 4

Diese Next.js-Version unterscheidet sich in Teilen von älteren. Maßgeblich sind die Docs im Paket unter `node_modules/next/dist/docs/` (siehe auch `AGENTS.md`).

## Voraussetzungen

- Node.js 20.9 oder neuer (Anforderung von Next.js 16) und npm
- Für das Testskript Node.js 22.18 oder neuer, weil es TypeScript direkt ausführt. Entwickelt wurde mit Node.js 24.
- Ein Supabase-Projekt

## Lokal einrichten

1. Abhängigkeiten installieren:

   ```bash
   npm install
   ```

2. Im Projektordner eine Datei `.env.local` anlegen, die diese beiden Variablen enthält:

   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`

   Die Werte stehen im Supabase-Dashboard unter den API-Einstellungen des Projekts. Sie gehören nie ins Repository. `.env*` ist in `.gitignore` ausgeschlossen.

3. Die Datenbank einrichten (nächster Abschnitt).

4. Entwicklungsserver starten:

   ```bash
   npm run dev
   ```

   Die App läuft dann unter `http://localhost:3000`.

## Datenbank in Supabase einrichten

Die SQL-Dateien werden im SQL-Editor von Supabase ausgeführt, **in dieser Reihenfolge**:

1. `supabase/schema.sql`: Tabellen, Zugriffsregeln (Row Level Security), Standardübungen. Die Datei kann mehrfach ausgeführt werden und löscht keine Daten.
2. `supabase/migrations/001_save_workout.sql`: die Datenbankfunktion `save_workout`, mit der Workouts in einem Schritt gespeichert oder ersetzt werden (inklusive Sicherung der vorherigen Fassung in `workout_versions`). Ohne sie funktioniert das Speichern nicht.
3. `supabase/migrations/002_exercises_public_name_unique.sql`: Index, der doppelte Namen bei Standardübungen verhindert. Er ist in `schema.sql` schon enthalten. Die Datei ist für eine ältere Datenbank gedacht, in der nur dieser Schritt fehlt. Sie schlägt fehl, solange Standardübungen doppelt vorhanden sind.

Bei einer Datenbank mit echten Daten vorher ein Backup anlegen. Je nach Authentifizierungs-Einstellung in Supabase müssen neue Nutzer ihre E-Mail-Adresse bestätigen.

## Deployment

Die App läuft auf Vercel und ist mit dem GitHub-Repository verbunden. Jeder Push auf `main` wird automatisch gebaut und veröffentlicht.

- Die beiden Umgebungsvariablen (siehe oben) sind in den Projekteinstellungen von Vercel gesetzt. Sie werden beim Bauen in die App eingebettet. Nach einer Änderung der Werte ist ein neuer Deploy nötig.
- **Reihenfolge bei Änderungen an der Datenbank:** Zuerst das SQL in Supabase ausführen, dann den Code pushen. Sonst ruft die veröffentlichte App Datenbankteile auf, die es noch nicht gibt.
- Ein geändertes App-Symbol zeigt das iPhone erst, wenn das Symbol vom Home-Bildschirm gelöscht und die App über Safari ("Zum Home-Bildschirm") neu angelegt wird.

## Prüfen

```bash
npm run lint
npm run build
npm run test:recommendations
```

`test:recommendations` führt die Regeln der Empfehlung mit Beispielfällen durch (`scripts/test-recommendations.ts`).

## Wie die Empfehlung funktioniert

Die Logik steht in `lib/recommendations.ts`. Sie folgt dem Prinzip der doppelten Progression: Erst steigert man die Wiederholungen bis zur oberen Grenze eines Bereichs, dann das Gewicht.

- **Arbeitssätze** sind die Sätze mit dem schwersten Gewicht der letzten Einheit. Nur sie zählen. Leichtere Sätze, davor oder danach, werden angezeigt, aber nicht gewertet.
- **Wiederholungsbereich:** 8 bis 12 für alle Übungen.
- **Steigern**, wenn alle Arbeitssätze 12 Wiederholungen erreicht haben und die durchschnittliche RPE nicht über 9 lag (oder fehlt). Das neue Gewicht ist das alte plus ein Schritt, danach beginnt man wieder bei 8.
- **Halten**, solange der Bereich noch nicht ausgereizt ist, oder wenn die RPE über 9 lag. Das Ziel ist dann eine Wiederholung mehr als im schwächsten Arbeitssatz.
- **Verringern** erst, wenn zwei Einheiten in Folge deutlich unter dem Bereich lagen (höchstens 6 Wiederholungen).
- **Schrittgröße:** 2,5 % des Arbeitsgewichts, aufgerundet auf 2,5 kg, mindestens 2,5 und höchstens 5 kg.
- **RPE** (wie anstrengend ein Satz war, von 6 bis 10) ist freiwillig und dient nur als Bremse. Eine fehlende RPE wird nicht geschätzt.

Alle Werte stehen als Konstanten am Anfang der Datei.

## Projektstruktur

- `app/`: Seite, Layout, Symbole, Web-App-Manifest
- `components/`: Oberflächenbausteine (Formular, Historie, Planer, Übungsverwaltung, Hilfe)
- `lib/`: Supabase-Zugang, Empfehlung, Datum, Fehlertexte, Entwurf, seitenweises Laden
- `types/`: gemeinsame Typen und Konstanten
- `supabase/`: `schema.sql` und die Migrationen
- `scripts/`: das Testskript der Empfehlung

## Bekannte Einschränkungen

- Der Live-Entwurf liegt nur im Browser des jeweiligen Geräts, nicht in der Datenbank. Auf einem anderen Gerät ist er nicht da.
- Ein Wiederholungsbereich und eine Schrittgröße gelten für alle Übungen. Eine Einstellung je Übung ist nicht vorhanden.
- Speichern braucht eine Verbindung. Ohne Netz startet die App nur mit einer noch gültigen Sitzung, sonst erscheint die Anmeldung.
- Bei Pyramiden-Sätzen zählt nur der schwerste Satz als Arbeitssatz.
- Jede Übung gehört zu genau einer Muskelgruppe, und die Wochenauswertung nutzt immer die aktuelle Gruppe der Übung.
- Unter iOS gibt es kein eigenes Startbild, und für Android sind keine maskierbaren Symbole angelegt.
