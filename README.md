# Mindmap

Einfacher Mindmap-Editor im Browser mit Benutzerkonten. Jede Person meldet sich mit ihrem Kürzel an und sieht ihre eigenen Mindmaps – auf jedem Gerät.

## Funktionen
- Punkt anklicken und lostippen, **Tab** = Unterpunkt, **Enter** = gleiche Ebene
- Punkte per Drag & Drop umhängen, Äste einfärben, ein- und ausklappen
- **Kategorien:** pro Mindmap eigene Kategorien mit Farbe anlegen und Punkten zuweisen
- **Duplikate finden:** zeigt Begriffe, die mehrfach vorkommen, markiert sie und springt zu jedem Vorkommen
- **Meine Mindmaps:** beliebig viele Mindmaps pro Konto, automatisch gespeichert
- **Benutzer verwalten** (Admins): Konten anlegen, Passwörter setzen, Admin-Rechte vergeben, Konten löschen
- **Export** als PDF, PNG, JPG, Text (eingerückte Liste) oder JSON – auf Wunsch mit eingeklappten Ästen und hellem Hintergrund
- **Import** aus Datei oder eingefügtem Text: eingerückte Liste, Markdown, JSON-Export/Sicherung, OPML, FreeMind/Freeplane (.mm), Mermaid-Mindmap
- Für alle anderen Programme (XMind, MindManager, Miro, Bilder …) gibt es im Import-Dialog einen KI-Prompt, der die Mindmap ins passende Format umwandelt

## Aufbau
- `public/index.html` – die ganze Oberfläche (eine Datei, ohne Build)
- `netlify/functions/api.mjs` – API unter `/api/*`: Anmeldung, Mindmaps, Benutzerverwaltung
- Daten liegen in **Netlify Blobs** (Store `mindmap`). Passwörter werden mit scrypt gehasht, Anmeldungen sind 30 Tage gültig.

## Veröffentlichen
Auf Netlify: *Add new project → Import an existing project → GitHub → timeo44/mindmap*. Die Einstellungen kommen aus `netlify.toml`, es ist nichts weiter zu konfigurieren. Jeder Push auf `main` wird automatisch veröffentlicht.

GitHub Pages reicht dafür nicht, weil Pages keinen Server für Anmeldung und Speicherung bietet.

## Erste Anmeldung
Kürzel `admin` mit dem Startpasswort, das du separat erhalten hast. Beim ersten Anmelden muss ein eigenes Passwort gesetzt werden; danach ist das Startpasswort wirkungslos.
