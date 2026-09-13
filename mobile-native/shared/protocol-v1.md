# SCTracker native reference protocol v1

This document defines the deterministic subset shared by the native reference clients. It is
not a production security claim or a substitute for an independently reviewed protocol.

## Canonical JSON

- UTF-8 without BOM or trailing newline.
- JSON object keys sorted by Unicode code point.
- Arrays retain their declared order.
- No insignificant whitespace.
- Strings use JSON escaping.
- Booleans and `null` use lowercase JSON tokens.
- Integers use base-10 without leading zeroes.
- Non-finite numbers are forbidden. Domain quantities should use integer base units where
  interoperability matters; floating point is not used in signed or chained protocol values.
- SHA-256 digests are lowercase hexadecimal.

An event payload is canonicalized and hashed as `payloadHash`. The event envelope excludes the
payload and `eventHash`, is canonicalized, and is hashed as `eventHash`. Event 1 uses 64 zeroes as
`prevHash`; every later event uses the preceding `eventHash`. Sequence numbers start at 1.

## Genesis vector

Payload:

```json
{"state":"ISSUED"}
```

`payloadHash`:

```text
28ec7bccebeef254cf6d88315dd1999f7306d86721e07e021f9cf55a8793771e
```

Canonical envelope:

```json
{"actorId":"ACT-1","aggregateId":"SACK-1","aggregateType":"Sack","deviceId":"DEV-1","eventId":"EV-1","eventType":"SACK_ISSUED","occurredAtEpochMillis":1700000000000,"payloadHash":"28ec7bccebeef254cf6d88315dd1999f7306d86721e07e021f9cf55a8793771e","prevHash":"0000000000000000000000000000000000000000000000000000000000000000","sequence":1}
```

`eventHash`:

```text
0543ade20a40ec5825515a818d9d112c02a733becfa009ba1fb39671ee2fed49
```

## Transfer and package rules

A transfer starts as `PENDING`. Its ACCEPT or REJECT event must carry the exact offer hash; a
display ID is insufficient. Importers verify the ECDSA P-256/SHA-256 signature over the canonical
unsigned manifest and then verify the exact file set, byte lengths, and SHA-256 hashes before any
event is admitted. Failed or divergent imports remain quarantined; they never replace local
history.
