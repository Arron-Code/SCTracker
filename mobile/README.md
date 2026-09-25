# SCTracker Coffee Mobile

Expo/React-Native-App für Android und iOS mit vollständiger Oberfläche in Deutsch, Englisch, Amharisch und Tigrinya. Die Sprachauswahl bleibt dauerhaft im Header verfügbar und wird lokal gespeichert.

Die deutschsprachige Bedienungsanleitung für die aktuelle iOS-App steht unter
[`../docs/mobile-ios-gebrauchsanweisung-de.md`](../docs/mobile-ios-gebrauchsanweisung-de.md).

## Funktionen

- Offline-fähige Lieferanten- und Kaffee-Plot-Erfassung
- echte GeoJSON-Polygone durch mehrere GPS-Punkte sowie JSON-Import und -Bearbeitung
- eigenständige Geofencing-Funktion mit GPS-, Lieferanten- und manueller Land-/Region-Ermittlung
- editierbarer Kreismittelpunkt und Radius, aus der Plotfläche berechnete Startgröße sowie Hintergrund-Ein-/Austrittsüberwachung
- persistente, migrationsfähige AsyncStorage-Daten (`v1`-GPS-Entwürfe werden nach `v2` migriert)
- organisationsgetrennte Offline-Daten und Geofence-Registrierungen
- zusätzlich benutzergebundene Offline-Speicher-, Geräte- und Signaturschlüssel
- retry-sichere Push/Pull-Synchronisierung mit UUID-/Idempotency-IDs, Outbox, Inbox-Cursor und sichtbarer Konfliktauflösung
- Dokument-Upload über Presigned-URL-Initiierung und Abschluss
- Satellitenanalyse, Evidence-Pack-Anforderung mit Download/Teilen sowie DDS-Entwurf, Validierung, Einreichung und Status
- sichtbarer Online-/Offline-, Konfigurations- und Synchronisierungsstatus mit manueller Wiederholung
- Neon Managed Better Auth mit E-Mail-Anmeldung und aktiver Organisation
- zentrale Geräte- und Signaturschlüsselregistrierung mit Play Integrity bzw. App Attest
- drehbare, responsive Hoch-/Querformat- und Tablet-Layouts

`NOT_CONFIGURED`, fehlende API-/Auth-URLs und eine fehlende aktive Organisation
werden immer als blockierende Fehler angezeigt und nie als Erfolg behandelt. Vor
erfolgreicher Anmeldung und Organisationsauswahl werden keine Fachdaten geladen
oder angezeigt.

## Konfiguration

`.env.example` nach `.env.local` kopieren und die öffentlichen Backend- und
Neon-Auth-Basis-URLs setzen:

```powershell
Copy-Item .env.example .env.local
```

```dotenv
EXPO_PUBLIC_API_URL=http://localhost:3000
EXPO_PUBLIC_NEON_AUTH_URL=https://your-neon-auth-host.example/neondb/auth
EXPO_PUBLIC_PLAY_INTEGRITY_CLOUD_PROJECT_NUMBER=
```

Es ist keine Produktions-URL fest eingebaut. Beide URLs sind öffentliche
Laufzeitkonfiguration, keine Geheimnisse. Neon-API-Schlüssel,
Datenbank-Zugangsdaten und andere Server-Secrets dürfen nicht in Expo-Variablen
stehen. Für ein physisches Gerät muss die API-URL vom Gerät erreichbar sein;
`localhost` verweist dort auf das Gerät selbst.

Die App bietet Anmeldung, Abmeldung und Organisationserstellung/-auswahl in
Deutsch, Englisch, Amharisch und Tigrinya. Benutzerkonten werden für diese
B2B-App administrativ bereitgestellt; eine öffentliche Selbstregistrierung ist
nicht verfügbar.
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
- `POST /api/v1/devices/register`
- `POST /api/v1/devices/attestation/challenges`
- `POST /api/v1/devices/attestations`
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

## Veröffentlichung im Apple App Store

Die iOS-App verwendet die Bundle-ID `com.sctracker.coffee`, verwaltet die
Build-Nummer über EAS (`appVersionSource: remote`) und erhöht sie bei jedem
Produktions-Build automatisch. Das Privacy Manifest enthält die von den
eingebundenen Expo-/React-Native-Modulen deklarierten Required-Reason-APIs.

Voraussetzungen:

1. Ein kostenpflichtiges Apple-Developer-Konto und Zugriff auf den Expo-Owner
   `ajohannes`.
2. Eine App in App Store Connect mit der Bundle-ID
   `com.sctracker.coffee`.
3. Öffentliche E-Mail-Registrierung in der Neon-Auth-Konfiguration der
   Produktions-Branch deaktivieren und danach prüfen, dass
   `auth_methods.email_password.allow_sign_up` den Wert `false` hat. Die
   Mobile-App selbst enthält bereits keinen Registrierungsablauf mehr.
4. Datenschutz- und Support-URLs sowie App-Store-Texte und Screenshots für alle
   unterstützten Gerätegrößen.
5. Vollständig beantwortete App-Privacy-Angaben. Nach dem aktuellen
   Funktionsumfang sind insbesondere Konto-/E-Mail-Daten, Gerätekennungen,
   präzise Standortdaten, Lieferanten-/Betriebsdaten und hochgeladene Dokumente
   mit Backend und Datenschutzverantwortlichen abzugleichen. Die App verwendet
   diese Daten für ihre Funktion und deklariert kein Tracking.
6. Ein dokumentierter administrativer Prozess für Kontosperrung,
   Löschanfragen und gesetzliche Aufbewahrungspflichten. Die App bietet keine
   Selbstregistrierung.

Vor dem ersten Upload die Apple-ID der App aus **App Store Connect > App
Information > General Information** als `ascAppId` unter
`submit.production.ios` in `eas.json` ergänzen. Anschließend:

```powershell
npx eas-cli login
npx eas-cli credentials --platform ios
npm test
npm run typecheck
npx expo-doctor
npm run export:ios
npm run release:ios:build
npm run release:ios:submit
```

Der Submit lädt den Build zunächst zu App Store Connect/TestFlight hoch. Die
Freigabe für App Review, Altersfreigabe, Export-Compliance, Preis,
Verfügbarkeit, Datenschutzangaben, Review-Kontakt und gegebenenfalls ein
Review-Testkonto werden anschließend in App Store Connect gepflegt.

Für signierte Builds werden Expo Application Services sowie das
Apple-Entwicklerkonto benötigt.

## Veröffentlichung im Google Play Store

Die Android-App verwendet die unveränderliche Paket-ID
`com.sctracker.coffee`. Das EAS-Produktionsprofil erzeugt ein Android App
Bundle (`.aab`) und erhöht den `versionCode` über die remote verwaltete
EAS-Version automatisch. Der Submit lädt neue Builds zunächst als Entwurf in
den internen Test-Track; eine unbeabsichtigte Produktionsfreigabe findet nicht
statt.

Voraussetzungen:

1. Ein vollständig registriertes Google-Play-Developer-Konto.
2. Eine App in der Google Play Console mit der Paket-ID
   `com.sctracker.coffee`. Diese ID kann nach dem ersten Upload nicht mehr
   geändert werden.
3. Die Play Integrity API für das Google-Cloud-Projekt mit der Projektnummer
   `1070814792378` aktivieren und dieses Projekt in der Play Console verknüpfen.
   Das EAS-Produktionsprofil übergibt die Nummer bereits an die App.
4. Den produktiven Backend-Verifier mit `PLAY_INTEGRITY_VERIFY_URL` und
   `PLAY_INTEGRITY_VERIFY_TOKEN` konfigurieren. Ohne diesen Adapter meldet die
   Geräteattestierung ausdrücklich `NOT_CONFIGURED`.
5. Einen Google-Service-Account für die Google Play Android Developer API
   anlegen, in der Play Console mindestens für interne Releases berechtigen und
   den JSON-Schlüssel über `eas credentials --platform android` zu EAS
   hochladen. Der Schlüssel darf nicht in Git gespeichert werden.
6. Store Listing, App-Symbol, Feature Graphic, Telefon-/Tablet-Screenshots,
   Support- und Datenschutz-URL, Zielgruppe, Inhaltsbewertung und
   Werbeangaben vollständig pflegen.
7. Das Formular **Data safety** mit Backend und Datenschutzverantwortlichen
   abstimmen. Insbesondere Konto-/E-Mail-Daten, Gerätekennungen, präzise
   Standortdaten, Lieferanten-/Betriebsdaten und Dokumente sind entsprechend
   ihrer tatsächlichen Erhebung, Übertragung, Verschlüsselung und
   Löschmöglichkeit anzugeben.
8. Die Hintergrundstandortberechtigung in der Play Console begründen und ein
   Demonstrationsvideo bereitstellen. Die App benötigt sie ausschließlich für
   vom Benutzer aktivierte Kaffee-Plot-Geofences und lokale Ein-/Austritts-
   Benachrichtigungen.

Vor dem Upload:

```powershell
npx eas-cli login
npx eas-cli credentials --platform android
npm test
npm run typecheck
npx expo-doctor
npm run export:android
npm run release:android:build
npm run release:android:submit
```

Nach dem Draft-Upload wird der Release in der Google Play Console geprüft,
vervollständigt und zuerst an interne Tester verteilt. Erst nach erfolgreichem
Test und abgeschlossener Richtlinienprüfung sollte er in einen Produktions-
Release übernommen werden.
