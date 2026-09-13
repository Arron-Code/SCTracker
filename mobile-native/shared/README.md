# SCTracker shared protocol artifacts

`protocol-v1.md` is the normative EventEnvelope v1 contract.
`canonical-json-v1.json` fixes the narrow integer-only canonical JSON profile, and
`test-vectors/wire-protocol-v1.json` fixes exact genesis, Unicode, OFFER, and ACCEPT bytes and
hashes.

Consumers must treat every typed value explicitly and must not round-trip a fixture through a
generic JSON number model. Hash the exact UTF-8 bytes and compare the lowercase hexadecimal
SHA-256 value.

The Swift and Kotlin codecs reproduce these vectors. This establishes software-level
canonicalization compatibility, not production security or hardware interoperability. Changing a
rule requires a new protocol identifier and new vectors; existing signed material must continue
to use the version recorded in its envelope.
