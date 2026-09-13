# SCTracker backend

Production-oriented Fastify API and background worker for the SCTracker EUDR workflow.
The backend is isolated from the existing static and Expo applications.

## Local development

Requirements: Node.js 22+, PostgreSQL 16+ with PostGIS, and an S3-compatible bucket.

```powershell
Set-Location backend
Copy-Item .env.example .env
npm install
$env:DATABASE_URL = "postgresql://postgres:postgres@localhost:5432/sctracker"
npm run migrate
$env:DEV_AUTH_ENABLED = "true"
npm run dev
```

Development auth is intentionally unavailable unless `DEV_AUTH_ENABLED=true`. Requests then
require `x-tenant-id` and `x-actor-id`; `x-device-id` is optional. Production startup fails if
development auth is enabled. Connect a real authentication gateway before production traffic.

OpenAPI UI is available at `/docs`; the machine-readable document is `/docs/json`.
Successful responses use `{ "data": ..., "meta": ... }`; failures use
`{ "error": { "code": "...", "message": "...", "details": ... } }`.

## Database and migrations

`npm run migrate` applies only pending, forward-only SQL migrations in a transaction. It never
drops application tables or resets a remote database. The initial migration enables PostGIS,
stores normalized plot geometry in SRID 4326, creates quantitative lineage tables, and includes
tenant columns and indexes suitable for subsequent RLS policy activation.

Demo data is never inserted by migration. It requires the explicit development-only command:

```powershell
$env:NODE_ENV = "development"
npm run seed:dev
```

## API and worker

Run the API with `npm start` and the worker with `npm run start:worker`. The worker claims queued
analysis, evidence-pack, and DDS jobs with `FOR UPDATE SKIP LOCKED`, records bounded exponential
retry state, and transitions jobs through `queued`, `processing`, `complete`, or `failed`.

External integrations never synthesize success. Missing Sentinel Hub, S3, or EU Information
System V3 Acceptance settings produce `NOT_CONFIGURED`. Evidence uploads persist expected
SHA-256, size, and MIME metadata, verify the uploaded object, retain version IDs, and become
immutable after completion.

## S3 Object Lock

Create the evidence bucket with versioning and Object Lock enabled at bucket creation time.
Keep `S3_OBJECT_LOCK_REQUIRED=true` in production. The API verifies the bucket configuration
before issuing uploads and verifies retention metadata on completion. Grant only these actions:
`s3:PutObject`, `s3:HeadObject`, `s3:GetObjectLockConfiguration`, and the minimum multipart
permissions if multipart support is added.

## Railway deployment

1. Provision PostgreSQL with PostGIS and set `DATABASE_URL`.
2. Provision separate API and worker services from the same repository.
3. Configure the API with `backend/railway.toml` and the worker with
   `backend/railway.worker.toml`.
4. Set provider variables through Railway; do not commit credentials.
5. Run `npm run migrate` as a controlled one-off release command before switching traffic.
6. Verify `/health`, then exercise an upload and confirm Object Lock/version metadata.

Rollback application services to the previous image if needed. Migrations are additive;
do not run destructive rollback SQL remotely. Restore data using database point-in-time recovery
or a tested forward repair migration.

## Validation

```powershell
npm run lint
npm run typecheck
npm test
npm run build
```
