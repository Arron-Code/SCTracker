# SCTracker Coffee Mobile

Expo/React-Native-App für Android und iOS mit vollständiger Oberfläche in Deutsch, Englisch, Amharisch und Tigrinya. Die Sprachauswahl bleibt dauerhaft im Header verfügbar und wird lokal gespeichert.

## Funktionen

- Offline-fähige Lieferanten- und Kaffee-Plot-Erfassung
- echte GeoJSON-Polygone durch mehrere GPS-Punkte sowie JSON-Import und -Bearbeitung
- eigenständige Geofencing-Funktion mit GPS-, Lieferanten- und manueller Land-/Region-Ermittlung
- editierbarer Kreismittelpunkt und Radius, aus der Plotfläche berechnete Startgröße sowie Hintergrund-Ein-/Austrittsüberwachung
- persistente, migrationsfähige AsyncStorage-Daten (`v1`-GPS-Entwürfe werden nach `v2` migriert)
- organisationsgetrennte Offline-Daten und Geofence-Registrierungen
- retry-sichere Push/Pull-Synchronisierung mit UUID-/Idempotency-IDs, Outbox, Inbox-Cursor und sichtbarer Konfliktauflösung
- Dokument-Upload über Presigned-URL-Initiierung und Abschluss
- Satellitenanalyse, Evidence-Pack-Anforderung mit Download/Teilen sowie DDS-Entwurf, Validierung, Einreichung und Status
- sichtbarer Online-/Offline-, Konfigurations- und Synchronisierungsstatus mit manueller Wiederholung
- Neon Managed Better Auth mit E-Mail-Anmeldung und aktiver Organisation

`NOT_CONFIGURED`, fehlende API-/Auth-URLs und eine fehlende aktive Organisation
werden immer als blockierende Fehler angezeigt und nie als Erfolg behandelt.
Offline-Entwürfe und die Outbox bleiben dabei vollständig verfügbar.

## Konfiguration

`.env.example` nach `.env.local` kopieren und die öffentlichen Backend- und
Neon-Auth-Basis-URLs setzen:

```powershell
Copy-Item .env.example .env.local
```

```dotenv
EXPO_PUBLIC_API_URL=http://localhost:3000
EXPO_PUBLIC_NEON_AUTH_URL=https://your-neon-auth-host.example/neondb/auth
```

Es ist keine Produktions-URL fest eingebaut. Beide URLs sind öffentliche
Laufzeitkonfiguration, keine Geheimnisse. Neon-API-Schlüssel,
Datenbank-Zugangsdaten und andere Server-Secrets dürfen nicht in Expo-Variablen
stehen. Für ein physisches Gerät muss die API-URL vom Gerät erreichbar sein;
`localhost` verweist dort auf das Gerät selbst.

Die App bietet Anmeldung, Registrierung, Abmeldung und
Organisationserstellung/-auswahl in Deutsch, Englisch, Amharisch und Tigrinya.
Das Better-Auth-Expo-Plugin speichert Session-Cookies in `expo-secure-store`.
Kurzlebige JWTs werden mit `token()` je API-Aufruf neu bezogen und nie in
AsyncStorage oder localStorage gespeichert.

Die App erwartet JSON-Antworten im Format `{ "data": ..., "meta": ... }` und Fehler als `{ "error": { "code": "...", "message": "...", "details": ... } }`.
Jeder API-Aufruf sendet `Authorization: Bearer <token>`. Das Backend leitet
interne UUIDs ausschließlich aus den signierten JWT-Claims `sub` und
`activeOrganizationId` ab; der Client sendet keine überschreibbaren
Principal-IDs.

Verwendete Endpunkte:

- `POST /api/v1/sync/push`
- `GET /api/v1/sync/pull?cursor=...`
- `POST /api/v1/plots/:id/geofence/check`
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

Für Hintergrund-Geofencing wird ein nativer Development- oder
Produktions-Build benötigt. Die App fordert Vordergrund- und
Hintergrund-Standortberechtigungen an und sendet lokale Benachrichtigungen beim
Betreten oder Verlassen gespeicherter Plot-Regionen. Expo Go unterstützt dieses
native Hintergrundverhalten nicht vollständig.

## Prüfungen

```powershell
npm test
npm run typecheck
npx expo-doctor
npm run export:android
npm run export:ios
```

Für signierte Builds werden weiterhin Expo Application Services sowie die jeweiligen Apple-/Google-Entwicklerkonten benötigt.
