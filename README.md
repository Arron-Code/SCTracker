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
    SC_TRACKER_API_URL: "https://api.example.com/api/v1"
  };
</script>
```

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
npm start
```

See `mobile\README.md` for Android, iOS, and EAS build instructions.

## Tests

```powershell
npm test
npm run check
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