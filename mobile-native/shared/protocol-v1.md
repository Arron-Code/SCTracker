# SCTracker native wire protocol v1

This document is normative for interchange between the iOS and Android reference clients.
Platform persistence models may contain additional fields, but those fields are not part of this
wire protocol. This is a deterministic reference profile, not a production security claim.

## Canonical JSON

- The encoding is UTF-8, without a BOM, insignificant whitespace, or a trailing newline.
- Object names are ordered by the lexicographic order of their UTF-8 bytes. Input strings are
  preserved exactly; Unicode normalization is forbidden.
- Arrays retain their declared order.
- `"` and `\` use their two-character JSON escapes. U+0008, U+0009, U+000A, U+000C, and U+000D
  use `\b`, `\t`, `\n`, `\f`, and `\r`. Other U+0000 through U+001F values use lowercase
  `\u00xx`. Other Unicode scalar values are emitted as UTF-8, not `\u` escapes.
- The only numbers in wire structures are signed 64-bit base-10 integers. They have no leading
  zero, plus sign, decimal point, exponent, or negative zero. Quantities are expressed as an
  explicitly named integer base unit (for example, `quantityGrams`), never binary floating point.
- Boolean and `null` tokens are lowercase. Duplicate object names and malformed Unicode are
  invalid.

`canonical-json-v1.json` and `test-vectors/wire-protocol-v1.json` contain exact UTF-8 and SHA-256
vectors. The U+E000/U+10000 vector intentionally distinguishes UTF-8 ordering from Kotlin/JVM
UTF-16 `String` ordering.

## EventEnvelope

The exact v1 field names and types are:

| Field | Type | Rule |
| --- | --- | --- |
| `schema` | integer | exactly `1` |
| `eventId` | string | non-empty, globally unique |
| `eventType` | string | non-empty protocol event name |
| `aggregateId` | string | non-empty aggregate identifier |
| `sequence` | integer | starts at `1`, increments by one per aggregate |
| `prevHash` | string | 64 lowercase hexadecimal characters |
| `createdMonotonic` | integer | non-negative, device-local monotonic tick; only ordered within one device boot/session |
| `reportedUtc` | string, optional | when present, RFC 3339 UTC `YYYY-MM-DDTHH:mm:ss.SSSZ`; omit when unavailable |
| `deviceId` | string | non-empty enrolled device identifier |
| `actorId` | string | non-empty actor identifier |
| `payloadHash` | string | SHA-256 of the canonical payload, lowercase hexadecimal |
| `keyId` | string | non-empty identifier resolved through the trust registry |
| `signature` | string | standard padded Base64 of a 64-byte IEEE P1363 signature (`r || s`) |

Unknown fields are invalid. Event 1 uses 64 ASCII zeroes as `prevHash`; every later event uses the
preceding event's `eventHash`. `reportedUtc` is evidence supplied by a wall clock and does not
replace sequence, monotonic ordering, or server anchoring.

The **signing bytes** are the canonical EventEnvelope with `signature` omitted. `payloadHash` is
SHA-256 of the canonical payload bytes. `eventHash` is SHA-256 of the signing bytes; it is not a
wire-envelope field. Both hashes operate on the exact UTF-8 bytes and are lowercase hexadecimal.
The signature is ECDSA P-256 with SHA-256 over the signing bytes. Its wire encoding is fixed-width
IEEE P1363, not ASN.1 DER. Producers MUST emit low-S signatures (`s <= n/2` for the P-256 group
order); verifiers MUST reject high-S, malformed, non-64-byte, or non-canonical Base64 signatures.

Decoders MUST reject an envelope whose input bytes are not already canonical. They MUST validate
the payload hash, schema, sequence, genesis/link hash, timestamp grammar, signature encoding and
low-S rule before admission. A repeated `eventId` with identical canonical envelope and payload is
idempotent; the same ID with different bytes is a collision and is rejected.

## Transfer offer binding

`TRANSFER_OFFER` payloads use exactly `transferId`, `fromActorId`, `toActorId`, and sorted unique
`sackIds`. `offerHash` is SHA-256 of those canonical payload bytes. `TRANSFER_ACCEPT` and
`TRANSFER_REJECT` payloads use exactly `transferId`, `decision` (`ACCEPT` or `REJECT`), and the
exact lowercase `offerHash`. A display ID or a recomputed summary is insufficient. The shared
vectors fix the OFFER and ACCEPT bytes and hashes.

## Interoperability and remaining gates

The Swift and Kotlin wire codecs implement the canonical bytes, payload/event hashes, envelope
shape, P1363 format, low-S validation, offer binding, and replay/collision behavior described
above. Their richer local event and package models remain platform-specific and must cross a wire
codec before interchange.

Interoperability is demonstrated at the software/vector level only. Production remains blocked
on backend trust-registry and revocation design, device enrollment and attestation, real iOS and
Android cross-device package exchange, Secure Enclave/Android Keystore signature trials, clock
and reboot behavior, and the documented chip/profile/device proof of concept. No NFC APDU,
application identifier, chip key, or signing key is defined by this protocol.
