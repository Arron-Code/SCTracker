import assert from "node:assert/strict";
import test from "node:test";
import { p256 } from "@noble/curves/nist.js";
import {
  canonicalJson,
  authActorId,
  authTenantId,
  decryptAuthenticated,
  encryptAuthenticated,
  p256PublicKey,
  p256Sign,
  p256Verify,
  sha256Hex,
  textEncoder,
} from "./crypto-core";
import { decryptExport, encryptExport } from "./encrypted-export";

function deterministicBytes(length: number): Uint8Array {
  return Uint8Array.from({ length }, (_, index) => (index * 17 + 11) % 256);
}

test("authenticated encryption rejects ciphertext and associated-data tampering", () => {
  const key = deterministicBytes(32);
  const nonce = deterministicBytes(24);
  const aad = textEncoder.encode("sctracker.mobileState.v3.encrypted.org-1");
  const plaintext = textEncoder.encode('{"plots":[{"id":"plot-1"}]}');
  const ciphertext = encryptAuthenticated(plaintext, key, nonce, aad);

  assert.deepEqual(decryptAuthenticated(ciphertext, key, nonce, aad), plaintext);
  const tampered = ciphertext.slice();
  tampered[0] ^= 1;
  assert.throws(() => decryptAuthenticated(tampered, key, nonce, aad));
  assert.throws(() =>
    decryptAuthenticated(ciphertext, key, nonce, textEncoder.encode("other-scope")),
  );
});

test("canonical JSON and compact P-256 signatures are deterministic and verifiable", () => {
  const privateKey = deterministicBytes(32);
  assert.equal(p256.utils.isValidSecretKey(privateKey), true);
  const message = textEncoder.encode(canonicalJson({ z: 2, a: { y: true, x: "value" } }));
  const signature = p256Sign(message, privateKey);
  const publicKey = p256PublicKey(privateKey);

  assert.equal(signature.length, 64);
  assert.equal(publicKey.length, 65);
  assert.equal(p256Verify(signature, message, publicKey), true);
  assert.equal(p256Verify(signature, textEncoder.encode("changed"), publicKey), false);
  assert.equal(sha256Hex(message).length, 64);
});

test("auth actor IDs match the backend UUID derivation contract", () => {
  assert.equal(
    authActorId("b4aaf8aa-06d2-4e4e-82f2-d8b020e5442e"),
    "a719c88f-0a50-8638-b470-b9517e43d6c6",
  );
  assert.equal(
    authTenantId("test-org"),
    "1980fbcc-8fd5-8e1e-9636-5d3088395699",
  );
});

test("export packages round-trip and fail closed with the wrong passphrase", async () => {
  const plaintext = textEncoder.encode('{"evidence":"verified"}');
  const encrypted = await encryptExport(
    plaintext,
    "correct horse battery staple",
    async (length) => deterministicBytes(length),
    "evidence.json",
    "application/json",
  );
  const decrypted = await decryptExport(encrypted, "correct horse battery staple");

  assert.deepEqual(decrypted.bytes, plaintext);
  assert.equal(decrypted.fileName, "evidence.json");
  await assert.rejects(() => decryptExport(encrypted, "incorrect password"));
});
