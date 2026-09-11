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

## Tests

```powershell
npm test
```

## Documentation

- `docs\SCTracker-Analyse-Kaffee-EUDR.pdf`
- `docs\SCTracker-Gebrauchsanweisung-DE-EN-AM.pdf`
- `docs\SCTracker-Cloud-Services-Kaffee-EUDR.pdf`
- `docs\SCTracker-Mobile-Testcheckliste.pdf`
- Editable source documents are stored next to the PDFs.

Rebuild the PDFs with:

```powershell
python -m pip install -r requirements-docs.txt
python scripts\build_pdfs.py
```

This prototype supports compliance work but does not provide legal advice or make an automatic determination of EUDR compliance.