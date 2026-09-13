# SCTracker Native Apps — User Manual

## English · Reference implementation

Version 0.1 — September 2026

> IMPORTANT: The iOS and Android apps are executable reference implementations, not production systems, security certifications, legal advice, or an automatic EUDR compliance decision.

## 1. Purpose and security limits

SCTracker records coffee batch, sack, seal, custody-transfer, location, media-reference, and package-verification evidence while a device is offline. Events are append-only and hash-linked so later changes are detectable.

The reference apps demonstrate local signing, lifecycle rules, transfer decisions, quarantine, and verified package exchange. Production deployment additionally requires backend identity and authorization, organization trust and revocation, secure enrollment and recovery, encrypted backup and transport, approved retention, monitoring, privacy review, independent protocol/security review, and trained operators. A hash or device signature proves neither that a fact is true nor that an actor was authorized.

## 2. Installation and setup

### Android

1. Use Android 8.0/API 26 or newer with a screen lock; install only an organization-approved signed build.
2. For development, open `mobile-native\android` in Android Studio with JDK 17 and Android SDK 35, or run `.\gradlew.bat assembleDebug`.
3. Grant only required camera, location, file, and NFC permissions. The current reference UI models media and GPS data but does not complete all permission/capture flows.
4. Confirm the header says the device is offline-ready and that the language icon remains visible.

### iOS

1. Use iOS 17 or newer with a passcode; install only an organization-approved signed build.
2. For development, open `mobile-native\ios\SCTrackerNative.xcodeproj` in Xcode 16 or newer and select the `SCTrackerNative` scheme.
3. Physical-device NFC requires the correct App ID and Near Field Communication Tag Reading entitlement. The simulator uses a development-only software signing key.
4. Confirm the globe icon remains visible in every screen header.

Do not use simulator data, development keys, debug builds, or sample actors for production records.

## 3. Device registration and trust package

The shipped actors, roles, and trust states are placeholders. A production administrator must register the device, bind its public key to an organization and named operator, record hardware/OS/app versions and key-protection level, issue a signed trust package, define roles and expiry, and support revocation.

Before work, verify that the device ID, key ID, organization, operator, roles, validity period, and trust-package signature match the deployment record. `UNVERIFIED`, `LOCALLY_TRUSTED`, `ORGANIZATION_VERIFIED`, and `REVOKED` are protocol identifiers; only organization policy may grant authority. Reject an expired, unknown, mismatched, or revoked package.

## 4. Language selection

Tap the persistent globe/language icon in the top header and choose Deutsch, English, አማርኛ, or ትግርኛ. The selection persists locally. Identifiers, hashes, codes, proper names, and protocol values remain unchanged; explanatory labels are translated.

## 5. Offline preparation

Before leaving connectivity:

- charge the device and confirm sufficient protected storage;
- open the app, select the correct language, and verify operator/device trust;
- download the assigned work and approved trust package in a production implementation;
- verify date/time, camera, location, and required permissions;
- prepare a safe package-transfer method and a paper fallback;
- never rely on NFC: real chip operations are intentionally blocked.

Offline-ready means local workflows can run. It does not mean identity, trust, backup, or synchronization is complete.

## 6. Operator authentication

The reference apps do not implement production login. Production must require an organization-issued identity, device unlock, short inactivity timeout, role authorization for every action, and supervisor approval for sensitive corrections or reconciliation. Never share credentials or leave an unlocked device unattended. Stop work if the displayed operator, organization, or role is wrong.

## 7. Genesis and sack capture

1. Open Workflows/Sacks and choose new batch Genesis.
2. Enter the batch reference and origin exactly as shown on source records.
3. Set the sack count from 1 through 100. Counts outside that range are refused.
4. Create the batch. The app creates deterministic sack references and starts the batch at `UNISSUED`.
5. Compare every displayed sack reference with the physical marking before continuing.

Do not reuse identifiers or silently edit a Genesis event. If source data is wrong, create an authorized correction/void event according to production policy.

## 8. GPS quality

Capture location outdoors with a clear sky view. Wait for a stable fix and inspect horizontal accuracy, provider, capture time, and mock-location indication where available. The reference acceptance indicator uses 25 metres or better, but deployment policy may be stricter. Retry poor fixes and record why no acceptable fix was possible. GPS is evidence metadata, not proof of origin; never invent, round, or copy coordinates from another site.

## 9. Lifecycle, controls, damage, opening, and corrections

Normal lifecycle identifiers are `UNISSUED` → `ISSUED` → `SEALED` → `IN_TRANSIT` → `OPENED`. `VOID` and `DAMAGED` are terminal exception states. The UI offers only actions allowed from the current state.

- Issue only after checking Genesis and physical sacks.
- Seal only after confirming the approved seal procedure.
- Start transit only when custody and shipment details are correct.
- Open only at the authorized destination and record evidence.
- Mark damaged when a sack or seal is damaged; stop normal processing and follow quarantine policy.
- Mark void when an identifier or record must not be used.
- Never overwrite history. Corrections are new signed events referring to the incorrect record and require the configured authorization.

## 10. OFFER, ACCEPT, REJECT, and PENDING

An `OFFER` creates a transfer in `PENDING`. Ownership/custody is not complete while pending. The receiver must compare batch/sack references, sender, receiver, condition, and the exact offer hash. `ACCEPT` or `REJECT` must reference that exact hash. A second decision or a mismatched hash must be refused. Keep disputed or concurrent transfers pending/quarantined for supervisor review; do not recreate them to hide the conflict.

## 11. Photo and document evidence

Photograph labels, seals, condition, and authorized supporting documents clearly. Avoid unrelated people, IDs, screens, or private surroundings. Check focus, completeness, time, batch association, MIME type, size, and SHA-256 reference before continuing. The reference models store metadata and hashes, not a complete secure media vault. Production needs encrypted media storage, upload retry, malware scanning, retention/deletion policy, and access control.

## 12. Quarantine, conflicts, and review

Quarantine a batch or package when signatures, hashes, sequence, previous hash, identity/trust, lifecycle, evidence, or physical condition cannot be verified. A divergent event branch is not merged automatically. Preserve both branches, record the error code, stop further operational actions, and escalate. “Mark reviewed” only records review in the reference app; production reconciliation requires a signed compensating decision and authorized supervisor.

## 13. Package export, import, and verification

For export, select create signed export, keep the generated package unchanged, and transfer it through an approved channel. For import, choose import and verify. Verification must finish before any event is accepted: manifest structure/signature, exact file set, safe paths, byte sizes, every file SHA-256, chain root, event chain, and event signatures are checked.

Never partially import, rename/edit package contents, bypass a verification failure, or treat a self-contained signature as organization trust. Invalid or divergent packages stay quarantined. Production also needs size limits, streaming archives, recipient encryption, malware/media scanning, trusted-key lookup, replay controls, and audit-backed synchronization.

## 14. Error codes and operator response

- `SCT-INPUT` / `GENESIS_SACK_COUNT_INVALID`: correct required input or the 1–100 count.
- `SCT-STATE` / `TRANSITION_NOT_ALLOWED`: refresh the record and use only an allowed lifecycle action.
- `SCT-EVENT`: stop and preserve the data; duplicate, sequence, hash, or chain integrity failed.
- `SCT-SIGN` / `KEYSTORE_UNAVAILABLE`: stop signing; verify device registration and key protection.
- `SCT-PACKAGE` / `MANIFEST_*`: do not import; quarantine the package and report its hash.
- `SCT-CONFLICT` / `IMPORT_QUARANTINED`: stop batch processing and request authorized reconciliation.
- `SCT-STORAGE`: stop work, preserve the device, and contact support; do not clear app data.
- `SCT-CHIP` / `SCT-NFC`: do not retry as proof of authenticity; use the approved non-NFC fallback.

Record the exact code, time, device ID, batch/transfer/package identifier, and action. Do not send secrets, complete personal data, APDUs, or chip responses in support messages.

## 15. Privacy and lost device

Collect only necessary data. Do not place passwords, secret keys, unnecessary personal data, full document images, or precise coordinates in notes, logs, chat, or public systems. Follow consent, access, retention, and deletion policies.

If a device is lost or stolen: report it immediately; revoke the device key and trust package; disable its sessions; identify the last trusted event/package checkpoint; quarantine later unsigned/untrusted activity; remotely lock or erase only under approved policy; and enroll a replacement as a new device. Never restore a signing key by copying an app backup.

## 16. Troubleshooting

- App will not open: verify supported OS, storage, signed build, and device policy; do not reinstall before support preserves evidence.
- Language is wrong: use the persistent globe icon and restart only if the saved choice is not applied.
- No location: move outdoors, enable permission, wait for accuracy, and record the fallback.
- Import fails: keep the original package unchanged and report its hash plus error code.
- Conflicting history: stop operations and quarantine; never select a branch manually.
- NFC fails: expected with the shipped disabled profile; use the approved fallback.
- Signing/storage fails: stop capture and contact the administrator; do not clear app data or change device time.

## 17. Mandatory NFC warning

> REAL NFC AUTHENTICATION, READ, UPDATE, AND READ-BACK MUST REMAIN BLOCKED until an approved manufacturer-specific proof of concept identifies the chip and memory/application layout; uses authoritative APDUs and status words; defines secure, non-app-embedded key provisioning, diversification, rotation, and revocation; proves iOS/Android compatibility; tests replay, relay, cloning, tearing, interruption, lockout, damage, and read-back; and passes independent security review.

The repository contains no approved production chip profile, APDU set, or provisioning keys. UID is lookup-only and never proof of authenticity.
