# SCTracker Coffee Mobile

Expo/React-Native-App für Android und iOS mit vollständiger Oberfläche in Deutsch, Englisch, Amharisch und Tigrinya. Die Sprachauswahl bleibt dauerhaft im Header verfügbar und wird lokal gespeichert.

## Funktionen

- Offline-fähige Lieferanten- und Kaffee-Plot-Erfassung
- echte GeoJSON-Polygone durch mehrere GPS-Punkte sowie JSON-Import und -Bearbeitung
- persistente, migrationsfähige AsyncStorage-Daten (`v1`-GPS-Entwürfe werden nach `v2` migriert)
- retry-sichere Push/Pull-Synchronisierung mit UUID-/Idempotency-IDs, Outbox, Inbox-Cursor und sichtbarer Konfliktauflösung
- Dokument-Upload über Presigned-URL-Initiierung und Abschluss
- Satellitenanalyse, Evidence-Pack-Anforderung mit Download/Teilen sowie DDS-Entwurf, Validierung, Einreichung und Status
- sichtbarer Online-/Offline-, Konfigurations- und Synchronisierungsstatus mit manueller Wiederholung

`NOT_CONFIGURED` und eine fehlende API-URL werden immer als blockierende Fehler angezeigt und nie als Erfolg behandelt.

## Konfiguration

`.env.example` nach `.env.local` kopieren und die Backend-Basis-URL setzen:

```powershell
Copy-Item .env.example .env.local
```

```dotenv
EXPO_PUBLIC_API_URL=http://localhost:3000
```

Es ist keine Produktions-URL fest eingebaut. Für ein physisches Gerät muss die URL vom Gerät erreichbar sein; `localhost` verweist dort auf das Gerät selbst.

Die App erwartet JSON-Antworten im Format `{ "data": ..., "meta": ... }` und Fehler als `{ "error": { "code": "...", "message": "...", "details": ... } }`.

Verwendete Endpunkte:

- `POST /api/v1/sync/push`
- `GET /api/v1/sync/pull?cursor=...`
- `POST /api/v1/documents/uploads`
- `POST /api/v1/documents/uploads/:id/complete`
- `POST|GET /api/v1/satellite/analyses[/:id]`
- `POST|GET /api/v1/evidence-packs[/:id]`
- `POST|GET /api/v1/dds/drafts[/:id]`
- `POST /api/v1/dds/drafts/:id/validate`
- `POST /api/v1/dds/drafts/:id/submit`

## Entwicklung

```powershell
npm install
npm start
```

## Prüfungen

```powershell
npm test
npm run typecheck
npx expo-doctor
npm run export:android
npm run export:ios
```

Für signierte Builds werden weiterhin Expo Application Services sowie die jeweiligen Apple-/Google-Entwicklerkonten benötigt.
