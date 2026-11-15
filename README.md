# Mindmap

Einfacher Mindmap-Editor im Browser mit Benutzerkonten. Jede Person meldet sich mit ihrem Kürzel an und sieht ihre eigenen Mindmaps – auf jedem Gerät.

## Funktionen
- Punkt anklicken und lostippen, **Tab** = Unterpunkt, **Enter** = gleiche Ebene
- Punkte per Drag & Drop umhängen, Äste einfärben, ein- und ausklappen
- **Meine Mindmaps:** beliebig viele Mindmaps pro Konto, automatisch gespeichert
- **Benutzer verwalten** (Admins): Konten anlegen, Passwörter setzen, Admin-Rechte vergeben, Konten löschen
- Export als PNG-Bild, als eingerückte Liste und als Sicherung (JSON); Import aus Liste oder Sicherung

## Aufbau
- `public/index.html` – die ganze Oberfläche (eine Datei, ohne Build)
- `netlify/functions/api.mjs` – API unter `/api/*`: Anmeldung, Mindmaps, Benutzerverwaltung
- Daten liegen in **Netlify Blobs** (Store `mindmap`). Passwörter werden mit scrypt gehasht, Anmeldungen sind 30 Tage gültig.

## Veröffentlichen
Auf Netlify: *Add new project → Import an existing project → GitHub → timeo44/mindmap*. Die Einstellungen kommen aus `netlify.toml`, es ist nichts weiter zu konfigurieren. Jeder Push auf `main` wird automatisch veröffentlicht.

GitHub Pages reicht dafür nicht, weil Pages keinen Server für Anmeldung und Speicherung bietet.

## Erste Anmeldung
Kürzel `admin` mit dem Startpasswort, das du separat erhalten hast. Beim ersten Anmelden muss ein eigenes Passwort gesetzt werden; danach ist das Startpasswort wirkungslos.
