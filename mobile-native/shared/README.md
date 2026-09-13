# SCTracker shared protocol artifacts

`canonical-json-v1.json` is the language-neutral fixture for the narrow
canonical JSON encoder used by the native reference applications.

Consumers must treat every typed value explicitly. They must not round-trip a
fixture through a generic JSON number model and assume that integers, decimals,
or Unicode strings remain byte-identical. Hash the exact UTF-8 bytes in
`canonicalUtf8` and compare the lowercase hexadecimal SHA-256 value.

The vectors establish regression compatibility, not production security.
Changing a rule requires a new protocol identifier and new vectors; existing
signed material must continue to use the version recorded in its manifest.
