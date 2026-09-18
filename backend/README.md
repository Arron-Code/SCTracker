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
require `x-tenant-id` and `x-actor-id`; `x-device-id` is optional and `x-actor-roles` may carry a
comma-separated test/development role list such as `organization_admin`. Production startup fails
if development auth is enabled.

For production, set `NEON_AUTH_BASE_URL` to the Managed Better Auth URL (for this deployment,
`https://ep-weathered-boat-b1i5bn4m.neonauth.c-5.eu-central-1.aws.neon.tech/sctracker/auth`) and
leave `DEV_AUTH_ENABLED=false`. Set `AUTH_PROVIDERS=google` to publish the enabled social
providers and set `FRONTEND_ORIGINS` to the comma-separated browser origins allowed to call
the API. Optionally set `SC_TRACKER_FRONTEND_URL` when `/admin` should open a different
frontend base URL; otherwise backend administration entry redirects fall back to the first
configured `FRONTEND_ORIGINS` value. `GET /auth/config` exposes the non-secret Auth URL and
supported email-password, password-reset, and identity-provider capabilities so clients can
render consistent sign-in options. Passwords and reset tokens remain between the client and
Neon Auth and are never proxied or persisted by this API.

API requests require `Authorization: Bearer <token>`. The backend
caches the remote JWKS from `<NEON_AUTH_BASE_URL>/.well-known/jwks.json` and verifies EdDSA
signatures, expiry, and the exact issuer and audience origin. Missing configuration returns
`AUTH_NOT_CONFIGURED`; invalid tokens or claims return `UNAUTHENTICATED`.

Tenant and actor UUIDs are deterministic SHA-256 identifiers. The input is domain-separated as
`sctracker:neon-auth:v1:organization\0<activeOrganizationId>` or
`sctracker:neon-auth:v1:subject\0<sub>`, truncated to 128 bits, with RFC 4122 variant and version
8 bits applied. This keeps organization and subject collision domains distinct and stable while
remaining compatible with existing UUID columns. Production tenant authorization only uses the
signed `activeOrganizationId` claim; `x-tenant-id` and `x-actor-id` are ignored. `x-device-id`
remains optional operational metadata and does not influence authorization.

OpenAPI UI is available at `/docs`; the machine-readable document is `/docs/json`.
`GET /admin` and `GET /admin/` are backend entry routes only: they issue a redirect to
`<SC_TRACKER_FRONTEND_URL>#administration` (or the first configured frontend origin with the
same `#administration` fragment) so the backend does not duplicate a second administration UI.
Successful responses use `{ "data": ..., "meta": ... }`; failures use
`{ "error": { "code": "...", "message": "...", "details": ... } }`.

## Database and migrations

`npm run migrate` applies only pending, forward-only SQL migrations in a transaction. It never
drops application tables or resets a remote database. The initial migration enables PostGIS,
stores normalized plot geometry in SRID 4326, creates quantitative lineage tables, and includes
tenant columns and indexes suitable for subsequent RLS policy activation. Migration `002` adds
indexed geofence centers and radii derived from the canonical plot payload.
Migration `003` stores tenant-, actor-, device-, and key-bound P-256 signed
mobile events. Sequence and predecessor hashes are checked transactionally,
and database triggers make accepted events append-only.
Migration `004` adds the centralized tenant-scoped identity and trust registry:
organization users, registered devices, registered signing keys with revocation,
attestation challenges and append-only attestation records, plus current trust
state and append-only trust history.

Saved plot geofences are tenant-scoped and returned with normal plot reads and
sync pulls. `POST /api/v1/plots/:id/geofence/check` accepts
`{ "coordinates": [longitude, latitude] }` and reports the distance and whether
the point is inside the enabled circular geofence.

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

Supplier and plot mutations sent through the mobile sync format require a
signed event. Legacy unsigned sync remains available only for shipment
operations. The API verifies the canonical payload hash, event hash, P-256
signature, authenticated tenant and actor, explicit device/key registration,
revocation or suspension state, blocking trust state, stable device binding,
and contiguous chain head before applying mobile changes.

Authenticated clients and admin clients should target these standardized routes:

- `GET /api/v1/admin/users` → `OrganizationUser[]`
- `GET /api/v1/admin/devices` → `RegisteredDevice[]`
- `GET /api/v1/admin/devices/:deviceId/attestations`
- `GET /api/v1/admin/keys` → `RegisteredKey[]`
- `PATCH /api/v1/admin/users/:actorId/trust`
- `PATCH /api/v1/admin/devices/:deviceId/trust`
- `POST /api/v1/admin/keys/:keyId/revoke`
- `POST /api/v1/devices/register`
- `POST /api/v1/devices/attestation/challenges`
- `POST /api/v1/devices/attestations`

Exact request/response shapes:

- `POST /api/v1/devices/register`
  - request:
    ```json
    {
      "deviceId": "uuid",
      "displayName": "Field Device 01",
      "platform": "android|ios",
      "appVersion": "string",
      "osVersion": "string",
      "keyProtection": "software|tee|strongbox|secure_enclave|unknown",
      "metadata": {},
      "deviceKey": {
        "keyId": "string",
        "algorithm": "P256-SHA256",
        "publicKeyBase64": "base64"
      }
    }
    ```
  - response: `{ "data": { "device": RegisteredDevice, "key"?: RegisteredKey } }`
- `POST /api/v1/devices/attestation/challenges`
  - request: `{ "deviceId": "uuid", "provider": "play_integrity|app_attest", "keyId"?: "string", "metadata": {} }`
  - response: `{ "data": AttestationChallenge }`
- `POST /api/v1/devices/attestations`
  - request: `{ "deviceId": "uuid", "provider": "play_integrity|app_attest", "keyId"?: "string", "challengeId"?: "uuid", "proof": {}, "metadata": {} }`
  - response: `{ "data": AttestationRecord }`
- `PATCH /api/v1/admin/users/:actorId/trust` and `PATCH /api/v1/admin/devices/:deviceId/trust`
  - request: `{ "state": "UNVERIFIED|NOT_CONFIGURED|LOCALLY_TRUSTED|ORGANIZATION_VERIFIED|SUSPENDED|REVOKED", "reason": "string", "details": {} }`
  - response: `{ "data": TrustStateRecord }`
- `POST /api/v1/admin/keys/:keyId/revoke`
  - request: `{ "reason": "string" }`
  - response: `{ "data": RegisteredKey }`

Legacy `/api/v1/identity/*` and `/api/v1/admin/identity/*` routes remain as
backward-compatible aliases. Organization admins are still proven only by
verified JWT role claims in production. Device attestation verification never
fabricates success: missing Play Integrity/App Attest verifier configuration
stores and returns `NOT_CONFIGURED` with `verified: false`.

The Expo client registers its device and signing key before its first signed
sync. Android attestation additionally requires
`EXPO_PUBLIC_PLAY_INTEGRITY_CLOUD_PROJECT_NUMBER` in the mobile build. Configure
the backend verifier adapter through `PLAY_INTEGRITY_VERIFY_URL` and
`PLAY_INTEGRITY_VERIFY_TOKEN`, or the App Attest equivalents. These verifier
URLs must perform the platform-provider verification and return the documented
verification envelope; leaving them unset intentionally keeps devices in
`NOT_CONFIGURED` state.

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
