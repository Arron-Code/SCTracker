# SCTracker native iOS reference

This directory contains an independent SwiftUI reference implementation for the
SCTracker coffee field workflow. It does not replace or modify the Expo app in
`mobile/`.

## Requirements and setup

- macOS with Xcode 16 or newer
- iOS 17 deployment target
- an Apple development team and an NFC-capable physical iPhone for Core NFC
- the Near Field Communication Tag Reading capability enabled for the app ID

Open `SCTrackerNative.xcodeproj`, choose the `SCTrackerNative` scheme, select an
iPhone simulator or device, and run. The reference bundle identifier is
`org.sctracker.reference.ios`; change it to an identifier owned by the signing
team before installing on a device.

Run the unit tests from Xcode or on macOS:

```sh
xcodebuild \
  -project SCTrackerNative.xcodeproj \
  -scheme SCTrackerNative \
  -destination 'platform=iOS Simulator,name=iPhone 16' \
  test
```

The simulator uses an explicitly labelled, ephemeral software P-256 key. A
physical device requires Secure Enclave and refuses to fall back to an
exportable software key. Device builds also reject imported packages or events
marked as simulator-development signatures.

Operator manuals are available in
[`mobile-native\docs`](../docs/): [Deutsch](../docs/user-manual-de.md),
[English](../docs/user-manual-en.md), [አማርኛ](../docs/user-manual-am.md),
[ትግርኛ](../docs/user-manual-ti.md), and the
[combined printable PDF](../docs/SCTracker-Native-User-Manual-DE-EN-AM-TI.pdf).

## Architecture

- `Domain/` defines Actor, Device, Batch, Sack, Seal, Event, Media, Transfer,
  lifecycle transitions, canonical serialization, and hash-chain verification.
- `Infrastructure/OfflineRepository.swift` stores an atomic, protected local
  snapshot. Workflows do not require a network connection.
- `Infrastructure/Signing.swift` signs event and package hashes with a
  non-exportable Secure Enclave P-256 key where available. The Keychain stores
  only the Secure Enclave key handle representation.
- `Infrastructure/PackageTransfer.swift` creates signed manifests and verifies
  manifest signature, file hash, chain root, and every event chain before any
  imported event is merged.
- `Infrastructure/NFCAdapter.swift` is a real Core NFC ISO 7816 session adapter.
  It performs select, optional authentication, read, write, and read-back using
  APDUs supplied by a configured chip profile.
- `Features/` provides accessible SwiftUI screens for genesis (1–100 sacks),
  batch lifecycle, transfer offer/accept/reject, quarantine/conflicts, package
  import/export, trust placeholders, and settings. A persistent globe control
  switches German, English, Amharic, and Tigrinya.

Events are append-only. Each event contains `prevHash`, `payloadHash`, a
sequence number, actor/device references, optional GPS quality and media
references, and a signature envelope. Corrections must be expressed as new
events. Import divergence creates a conflict and quarantines the related batch;
the implementation never silently chooses a branch.

## Deterministic serialization

`EventWireCodecV1` maps protocol events to the normative `EventEnvelope` in
`../shared/protocol-v1.md`. The richer `LedgerEvent` remains an iOS-local storage model and is
not itself an interchange envelope. The wire protocol uses a deliberately narrow canonical JSON
representation rather than claiming deterministic CBOR support:

- UTF-8 with no whitespace
- object keys sorted by UTF-8 byte order
- null, Boolean, signed 64-bit integer, string, array, and object values
- integer base units only; no decimal point, exponent, leading zero, plus sign,
  or negative zero
- RFC 3339 UTC timestamps with exactly three fractional digits where a
  timestamp is part of a signed structure

Shared rules and exact genesis, Unicode, OFFER, and ACCEPT vectors are under `../shared`. Swift
and Kotlin reproduce the same bytes and hashes in unit tests. Signatures use low-S P-256 IEEE
P1363 over the canonical unsigned envelope. Unicode normalization is intentionally not performed.

This demonstrates software-level canonicalization compatibility only. Production remains blocked
on real iOS/Android package exchange, trust-registry/revocation, device enrollment and
attestation, Secure Enclave/Android Keystore trials, reboot/clock behavior, and the mandatory
chip/profile/device proof of concept below.

## Security and privacy boundaries

- UID is lookup metadata only. It is never accepted as authenticity proof.
- No chip secret, signing secret, personal data, GPS coordinate, document
  content, or APDU payload is logged.
- Event signatures establish possession of a device key, not actor identity,
  authorization, chip authenticity, or organizational trust. Role and trust
  values are explicit placeholders pending backend-issued credentials and
  revocation.
- Local file protection and Secure Enclave reduce device compromise risk but
  do not replace device passcode policy, MDM, jailbreak detection, backend
  authorization, key attestation, revocation, or encrypted backup policy.
- Imported package signatures are self-contained. Production must bind trusted
  public keys to organizations through a separately governed trust registry.
- Photo/document models retain metadata and SHA-256 hashes; this reference does
  not capture or store media bytes.
- GPS quality is recorded as evidence, not treated as proof of origin.
- UI status always includes text and an icon; color is supplementary. Primary
  controls have at least a 44-point target and support Dynamic Type.

The code is a reference implementation, not a production security
certification or legal compliance determination.

## Error-code contract

| Prefix | Area | Examples |
| --- | --- | --- |
| `SCT-INPUT` | validation | invalid reference or sack count |
| `SCT-STATE` | lifecycle | disallowed batch transition |
| `SCT-EVENT` | ledger | duplicate, broken chain, payload/event hash mismatch |
| `SCT-SIGN` | signatures | missing, malformed, or invalid signature |
| `SCT-PACKAGE` | exchange | invalid manifest or file hash |
| `SCT-CHIP` / `SCT-NFC` | seal hardware | unconfigured profile, unsupported chip, unavailable reader |
| `SCT-STORAGE` | persistence | protected snapshot read/write failure |
| `SCT-CONFLICT` | reconciliation | divergent imported chain |

The exact stable values are defined by `ErrorCode` in `Domain/Models.swift`.
User-facing translations may change, but integrations should key only on the
code.

## Mandatory seal-chip proof of concept

The shipped `ChipProfile.disabled` intentionally blocks all authentication,
read, and update operations. Do not enable it until a proof of concept records
all of the following:

1. Exact chip manufacturer, part number, memory layout, lifecycle, and genuine
   data sheet under an appropriate license.
2. Manufacturer-approved ISO 7816 command set, select strategy, status-word
   handling, write limits, anti-tearing behavior, and read-back semantics.
3. Authentication protocol and cryptographic review, including key
   diversification, rotation, revocation, secure provisioning, and who can
   perform each operation. Keys must never be embedded in the app.
4. iPhone/Core NFC compatibility evidence on every supported device and iOS
   version, including entitlement and ISO 7816 application-identifier
   requirements.
5. Physical tests for interrupted writes, duplicate scans, cloned UID,
   counterfeit/replaced tags, damaged seals, offline recovery, and concurrent
   transfer attempts.
6. A threat model and independent review that defines what the chip can and
   cannot prove.

Only after those items are approved should a separately reviewed configured
profile supply exact APDU bytes to `CoreNFCISO7816Adapter`. This repository
contains no invented APDU, application identifier, default key, or secret.

## Current limitations

- No backend sync, login, tenant isolation, remote trust registry, or
  organizational key attestation.
- Conflict review marks a case reviewed; production reconciliation needs a
  signed compensating-event workflow and supervisor authorization.
- Snapshot persistence is intentionally small-scale and should become a
  transactional local database for large deployments.
- Package transport is a single JSON document. Production should use a bounded,
  streaming archive format with size limits and malware/media scanning.
- Translations require review by native-speaking domain specialists.
- A macOS/Xcode environment is required to compile, execute XCTest, and conduct
  the mandatory physical-device NFC proof of concept.
