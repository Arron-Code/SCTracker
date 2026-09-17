# SCTracker

SCTracker is a coffee-specific EUDR traceability web client. It connects supplier and plot data with quantitative batch lineage, risk review, evidence packaging, and DDS preparation.

## Scope

The current client is deliberately limited to coffee:

- supplier and producer intake
- plot and geolocation validation
- source-lot, batch, and shipment lineage
- evidence completeness and human review
- DDS and simplified declaration preparation
- immutable audit concepts

Blockchain, proprietary satellite models, native mobile applications, and broad ERP integrations are intentionally outside the first release.

## Run locally

```powershell
npm start
```

Open `http://localhost:4173`.

## Web API configuration

By default, the web client calls the same origin under `/api/v1`. Deployments can inject a different base URL before `app.js` loads:

```html
<script>
  window.SC_TRACKER_CONFIG = {
    SC_TRACKER_API_URL: "https://api.example.com/api/v1",
    SC_TRACKER_NEON_AUTH_URL: "https://your-neon-auth-host.example/neondb/auth",
    SC_TRACKER_AUTH_PROVIDERS: ["google"]
  };
</script>
```

`config.example.js` documents the public runtime values. Copy its shape into a
deployment-provided script or inline configuration loaded before `app.js`.
Neither value is a secret. The repository bundles the pinned
`@neondatabase/auth` browser client locally with `npm run build:auth`; production
does not execute third-party CDN code.

The account dialog supports email sign-up, sign-in, password reset, Google sign-in,
sign-out, and organization creation/selection. Add further social providers to
`SC_TRACKER_AUTH_PROVIDERS` after enabling them in Neon Auth. Password reset links
return to the current web application and are consumed without storing the token.
API requests call Neon Auth's `token()` endpoint immediately
before each request and send the returned short-lived JWT as
`Authorization: Bearer <token>`. Raw JWTs are never written to `localStorage`.
Users must select an active organization before protected API data is loaded.

The client expects successful responses as `{ "data": ..., "meta": ... }` and errors as `{ "error": { "code": "...", "message": "...", "details": ... } }`. It integrates:

- `GET` and `POST` `/suppliers`, `/plots`, and `/shipments`
- presigned document initiation at `POST /documents/uploads`, binary `PUT` to the returned URL, and `POST /documents/:id/complete`
- analysis creation and status at `POST /analyses` and `GET /analyses/:id`
- evidence-pack creation and status at `POST /evidence-packs` and `GET /evidence-packs/:id`
- DDS validation/submission and status at `POST /dds/submissions` and `GET /dds/submissions/:id`

GeoJSON import accepts `Point`, `Polygon`, and `MultiPolygon` geometries, individual Features, or FeatureCollections. Coordinates, closed rings, minimum ring size, and polygon self-intersections are checked before requests are sent.

Mock API behavior is disabled by default. Enable the in-memory mock only for explicit local development:

```html
<script>
  window.SC_TRACKER_CONFIG = { mockApi: true };
</script>
```

## Mobile app

The Android and iOS application is located in `mobile\`. It uses Expo and React Native and provides GPS coffee-plot capture, local offline drafts, supplier status, shipment readiness, and German, English, and Amharic guidance.

```powershell
Set-Location mobile
npm install
Copy-Item .env.example .env
npm start
```

See `mobile\README.md` for Android, iOS, and EAS build instructions.

Set `EXPO_PUBLIC_API_URL` and `EXPO_PUBLIC_NEON_AUTH_URL` in `mobile\.env`.
These URLs are public configuration, not secrets. Native auth cookies are kept
by the official Better Auth Expo plugin in `expo-secure-store`; raw JWTs are
requested with `token()` for each API call and are never saved in AsyncStorage.
Offline supplier and plot capture remains available while signed out or
disconnected, and the existing outbox is retained until authenticated sync
succeeds.

## Native iOS reference

An independent SwiftUI reference implementation is located in
`mobile-native\ios\`. It demonstrates offline batch, sack, seal, transfer,
signed event-chain, verified package import/export, and guarded Core NFC
boundaries without changing the Expo app. Open
`mobile-native\ios\SCTrackerNative.xcodeproj` in Xcode 16 or newer.

See `mobile-native\ios\README.md` for architecture, security limitations,
shared protocol vectors, and the mandatory physical seal-chip proof of concept.

## Native Android reference

An independent Kotlin/Jetpack Compose reference implementation is located in
`mobile-native\android\`. It demonstrates the same offline evidence protocol,
lifecycle, transfer, quarantine, signed-package, and guarded NFC boundaries.

See `mobile-native\android\README.md` for build instructions and security
limitations.

## Backend platform

The production-oriented TypeScript/Fastify API, PostgreSQL/PostGIS migrations, and asynchronous
worker are isolated in `backend\`. Existing web and Expo workflows do not depend on it.

See `backend\README.md` for local setup, API contracts, S3 Object Lock requirements, worker
operation, and Railway deployment.

## Tests

```powershell
npm test
npm run check
npm run build:auth

Set-Location mobile
npm test
npm run typecheck
npx expo-doctor
```

## Backend authentication contract

The API validates the Neon-issued JWT and derives its internal UUID principals
from the signed `sub` and `activeOrganizationId` claims. Clients never send
user- or organization-ID overrides and never derive backend UUIDs themselves.

## Documentation

- `docs\SCTracker-Analyse-Kaffee-EUDR.pdf`
- `docs\SCTracker-Gebrauchsanweisung-DE-EN-AM.pdf`
- `docs\SCTracker-Cloud-Services-Kaffee-EUDR.pdf`
- `docs\SCTracker-Mobile-Testcheckliste.pdf`
- `mobile-native\docs\user-manual-de.md`
- `mobile-native\docs\user-manual-en.md`
- `mobile-native\docs\user-manual-am.md`
- `mobile-native\docs\user-manual-ti.md`
- `mobile-native\docs\SCTracker-Native-User-Manual-DE-EN-AM-TI.pdf`
- Editable source documents are stored next to the PDFs.

Rebuild the PDFs with:

```powershell
python -m pip install -r requirements-docs.txt
python scripts\build_pdfs.py
```

This prototype supports compliance work but does not provide legal advice or make an automatic determination of EUDR compliance.