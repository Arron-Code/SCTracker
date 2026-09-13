# SCTracker native Android reference

This is an independent Kotlin/Jetpack Compose reference implementation. The existing Expo
application in `mobile\` is not a dependency and is not modified.

The reference mirrors SCTracker's coffee evidence visual language while demonstrating an
offline-first operational core for batches, sacks, seals, transfers, exceptions, and signed
packages. It is intentionally a reference, not production-ready security or a completed field
application.

## Build and test

Prerequisites:

- JDK 17
- Android SDK platform 35 and build-tools 35.0.0
- Android Studio Ladybug or Gradle 8.9

From this directory:

```powershell
.\gradlew.bat testDebugUnitTest assembleDebug
```

Open `mobile-native\android` directly in Android Studio to run on an Android 8.0 (API 26) or
newer device. NFC hardware is optional; the bundled chip profile remains disabled on every
device.

## Product and UI scope

- German, English, Amharic, and Tigrinya UI copy.
- A persistent language icon in the top app bar; the choice is stored in private app
  preferences.
- Overview, genesis/sack, transfer, exception/quarantine/conflict, and signed package screens.
- Minimum 48–56 dp interaction targets. Statuses include text and symbols, not color alone.
- Coffee-focused visual tokens match the Expo prototype: forest, paper, panel, lime, and amber.

The UI is an executable reference surface. Production workflows must connect these screens to
authenticated actor/device enrollment, durable repositories, camera/location permission flows,
approved package transport, and reviewed synchronization policy.

## Architecture

`domain`
: Pure Kotlin protocol entities and rules. `Actor`, `Device`, `Batch`, `Sack`, `Seal`, `Event`,
  `Media`, and `Transfer` are explicit serializable models. Lifecycle rules cover `UNISSUED`,
  `ISSUED`, `SEALED`, `IN_TRANSIT`, `OPENED`, `VOID`, and `DAMAGED`. Genesis creates 1–100
  deterministic sack IDs. Transfers begin in `PENDING`; ACCEPT/REJECT requires the exact offer
  hash.

`data`
: `AppendOnlyFileEventStore` persists canonical JSON Lines in private app storage, verifies the
  complete SHA-256 chain before reads and before appends, and treats exact event replay as
  idempotent. An event ID with different content is an explicit collision. A production app
  should add encrypted storage, transactional indexing, backup policy, and migration tests
  without weakening the append-only record.

`security`
: `AndroidKeystoreSigner` provisions a P-256 signing key and reports whether the key is in
  StrongBox, a trusted execution environment, or software/unknown storage. StrongBox is preferred
  where Android supports it; generation safely retries without StrongBox and reports the fallback.
  The key is non-exportable. Only the public SPKI and signatures leave the keystore.

`nfc`
: `NfcReaderController` uses Android reader mode and `IsoDepSealService` provides
  select/read/write/read-back hooks. The default `DisabledUnconfigured` profile blocks all chip
  authentication and update operations. UID is returned only as a lookup hint and is never an
  authenticator.

`ui`
: Compose reference workflows and persistent language selection. Screen actions intentionally do
  not imply backend acceptance or chip authentication.

`mobile-native\shared`
: The canonical JSON rules and cross-client deterministic test vector.

## Event and package integrity

`EventWireCodecV1` maps protocol events to the normative `EventEnvelope` in
`mobile-native\shared\protocol-v1.md`. It signs and hashes the exact canonical UTF-8 bytes, uses
the 64-zero genesis hash, enforces integer-only JSON and UTF-8 byte key ordering, and fixes
signatures to low-S P-256 IEEE P1363. The richer `Event` model remains local storage format and is
not an interchange envelope.

Package manifests are sorted and canonicalized before ECDSA P-256/SHA-256 signing. Import
verification checks the signature, path safety, exact file set, byte sizes, and every file hash
before returning a valid result. A caller must keep invalid, divergent, or untrusted packages in
quarantine and must not partially import them.

Canonicalization and fixed genesis, Unicode, OFFER, and ACCEPT vectors are documented under
`mobile-native\shared`. Kotlin and Swift reproduce the same bytes and hashes in unit tests.
Production use remains blocked on cross-device package exchange, trust-registry/revocation,
device enrollment and attestation, Secure Enclave/Keystore trials, reboot/clock tests, and the
chip/profile/device proof of concept below.

## Security and privacy boundaries

- No secret or personal-data logging is implemented. Integrators must keep payloads, keys,
  coordinates, media URIs, and chip responses out of logs and crash reports.
- GPS records include accuracy, provider, capture time, altitude/speed/bearing when present, and
  the Android mock-location signal. GPS is evidence metadata, not proof of origin.
- Media records contain MIME type, byte length, capture time, optional GPS, and SHA-256. Media
  bytes remain outside events and packages reference them by hash.
- Role and trust states are placeholders, not authorization. Server-side policy and revocation
  are mandatory.
- Keystore protection depends on device hardware and configuration. The runtime report must be
  displayed or uploaded during enrollment; software/unknown protection must not be described as
  hardware-backed.
- Hash chains reveal tampering after a trusted checkpoint; they do not establish that captured
  facts were true and do not replace signatures, authorization, secure time, or server anchoring.
- The reference does not encrypt exported files, manage recipient keys, pin a backend, provide
  remote attestation, or make an EUDR compliance determination.
- Error handling uses stable `ErrorCode` values so UI, quarantine, and synchronization layers can
  preserve the reason for refusal.

## Mandatory chip proof-of-concept

Do not enable a `Configured` chip profile until a written, hardware-backed proof-of-concept has:

1. Identified the exact manufacturer, chip model, memory/application layout, and supported
   Android devices.
2. Obtained authoritative APDU and authentication documentation under appropriate terms.
3. Defined key generation, injection, rotation, revocation, loss, and per-environment separation;
   no static app-embedded secret is permitted.
4. Reviewed replay, relay, cloning, tearing, partial-write, lockout, and read-back behavior.
5. Tested select/read/authenticate/write/read-back sequences on representative production chips,
   including interruption and damaged-tag cases.
6. Produced compatibility evidence and independent security review with approved status words,
   timeout limits, payload limits, and safe retry policy.
7. Confirmed privacy handling: UID remains lookup-only, chip responses are not logged, and
   personal data is not written to a tag.

Until all seven gates are met, authentication and updates must remain blocked by
`DisabledUnconfigured`. This repository intentionally contains no invented APDU, chip secret, or
manufacturer claim.
