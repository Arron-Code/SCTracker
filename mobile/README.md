# SCTracker Coffee Mobile

Gemeinsame Expo/React-Native-App für Android und iOS. Die App ist auf Kaffee beschränkt und für Lieferanten, Kooperativen und Feldteams ausgelegt.

## Enthaltene Funktionen

- mobiles Kaffee-Compliance-Cockpit
- Lieferanten- und Produzentenübersicht
- GPS-Erfassung für Kaffee-Plots
- lokale Offline-Entwürfe mit AsyncStorage
- Sendungs- und DDS-Bereitschaft
- Hilfe in Deutsch, Englisch und Amharisch

Die aktuelle Version ist ein Prototyp. Lokale Entwürfe werden noch nicht mit einem Backend synchronisiert und es erfolgt keine Übermittlung an das EU Information System.

## Entwicklung starten

```powershell
Set-Location mobile
npm start
```

Danach kann der QR-Code mit Expo Go geöffnet werden. Android kann außerdem mit `npm run android` gestartet werden. Für den nativen iOS-Simulator ist macOS erforderlich; auf einem physischen iPhone funktioniert der Entwicklungsstart über Expo Go.

## Prüfungen

```powershell
npm run typecheck
npm run export:android
npm run export:ios
```

## Installierbare Builds

Expo Application Services kann signierte Android- und iOS-Builds erzeugen:

```powershell
npx eas-cli login
npx eas-cli build --profile preview --platform android
npx eas-cli build --profile preview --platform ios
```

Für einen iOS-Build und die App-Store-Veröffentlichung wird ein Apple-Developer-Konto benötigt. Für Google Play wird ein Google-Play-Developer-Konto benötigt. Store-Builds sollten erst nach Backend-Anbindung, Security Review, Datenschutzprüfung und muttersprachlicher Prüfung der amharischen Texte erstellt werden.
