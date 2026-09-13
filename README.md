# SCTracker

SCTracker is an early product prototype for coffee-specific EUDR traceability. It demonstrates the operational path from supplier and plot data through quantitative batch lineage, risk review, evidence packaging, and DDS preparation.

## Scope

The current prototype is deliberately limited to coffee:

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

## Mobile app

The Android and iOS application is located in `mobile\`. It uses Expo and React Native and provides GPS coffee-plot capture, local offline drafts, supplier status, shipment readiness, and German, English, and Amharic guidance.

```powershell
Set-Location mobile
npm start
```

See `mobile\README.md` for Android, iOS, and EAS build instructions.

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
```

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