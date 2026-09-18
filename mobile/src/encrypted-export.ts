import {
  canonicalJson,
  decodeBase64,
  decryptAuthenticated,
  deriveExportKey,
  encodeBase64,
  encryptAuthenticated,
  EXPORT_SCRYPT_N,
  textDecoder,
  textEncoder,
} from "./crypto-core";

export type EncryptedExportEnvelope = {
  format: "sctracker-e2ee-package";
  version: 1;
  algorithm: "XChaCha20-Poly1305";
  kdf: "scrypt";
  workFactor: number;
  blockSize: 8;
  parallelization: 1;
  salt: string;
  nonce: string;
  contentType: string;
  fileName: string;
  ciphertext: string;
};

type ExportHeader = Omit<EncryptedExportEnvelope, "ciphertext">;

export async function encryptExport(
  plaintext: Uint8Array,
  passphrase: string,
  randomBytes: (length: number) => Uint8Array | Promise<Uint8Array>,
  fileName: string,
  contentType: string,
): Promise<Uint8Array> {
  if (passphrase.normalize("NFKC").length < 12) {
    throw new Error("The export passphrase must contain at least 12 characters.");
  }
  const salt = await randomBytes(16);
  const nonce = await randomBytes(24);
  const header: ExportHeader = {
    format: "sctracker-e2ee-package",
    version: 1,
    algorithm: "XChaCha20-Poly1305",
    kdf: "scrypt",
    workFactor: EXPORT_SCRYPT_N,
    blockSize: 8,
    parallelization: 1,
    salt: encodeBase64(salt),
    nonce: encodeBase64(nonce),
    contentType,
    fileName,
  };
  const key = await deriveExportKey(passphrase, salt);
  const ciphertext = encryptAuthenticated(
    plaintext,
    key,
    nonce,
    textEncoder.encode(canonicalJson(header)),
  );
  return textEncoder.encode(canonicalJson({ ...header, ciphertext: encodeBase64(ciphertext) }));
}

export async function decryptExport(
  encoded: Uint8Array,
  passphrase: string,
): Promise<{ bytes: Uint8Array; fileName: string; contentType: string }> {
  const envelope = JSON.parse(textDecoder.decode(encoded)) as EncryptedExportEnvelope;
  if (
    envelope.format !== "sctracker-e2ee-package" ||
    envelope.version !== 1 ||
    envelope.algorithm !== "XChaCha20-Poly1305" ||
    envelope.kdf !== "scrypt" ||
    envelope.workFactor !== EXPORT_SCRYPT_N ||
    envelope.blockSize !== 8 ||
    envelope.parallelization !== 1
  ) {
    throw new Error("Unsupported encrypted export format.");
  }
  const { ciphertext, ...header } = envelope;
  const key = await deriveExportKey(passphrase, decodeBase64(envelope.salt));
  return {
    bytes: decryptAuthenticated(
      decodeBase64(ciphertext),
      key,
      decodeBase64(envelope.nonce),
      textEncoder.encode(canonicalJson(header)),
    ),
    fileName: envelope.fileName,
    contentType: envelope.contentType,
  };
}
