package com.sctracker.reference.domain

import java.util.Base64
import kotlinx.serialization.Serializable
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.encodeToJsonElement

@Serializable
data class ManifestEntry(val path: String, val byteSize: Long, val sha256: String)

@Serializable
data class UnsignedManifest(
    val format: String = "sctracker-transfer-package",
    val version: Int = 1,
    val packageId: String,
    val createdAtEpochMillis: Long,
    val signerDeviceId: String,
    val headEventHash: String,
    val entries: List<ManifestEntry>,
)

@Serializable
data class SignedManifest(
    val manifest: UnsignedManifest,
    val algorithm: String = "SHA256withECDSA",
    val signatureBase64: String,
)

fun interface ManifestSigner {
    fun sign(bytes: ByteArray): ByteArray
}

fun interface ManifestSignatureVerifier {
    fun verify(bytes: ByteArray, signature: ByteArray): Boolean
}

object PackageManifests {
    fun canonicalBytes(manifest: UnsignedManifest): ByteArray {
        validateEntries(manifest.entries)
        val normalized = manifest.copy(entries = manifest.entries.sortedBy { it.path })
        return CanonicalJson.encode(Json.encodeToJsonElement(normalized))
    }

    fun sign(manifest: UnsignedManifest, signer: ManifestSigner): SignedManifest =
        SignedManifest(
            manifest = manifest.copy(entries = manifest.entries.sortedBy { it.path }),
            signatureBase64 = Base64.getEncoder().encodeToString(signer.sign(canonicalBytes(manifest))),
        )

    fun verifyBeforeImport(
        signed: SignedManifest,
        packageFiles: Map<String, ByteArray>,
        verifier: ManifestSignatureVerifier,
    ): ManifestVerification {
        val bytes = try {
            canonicalBytes(signed.manifest)
        } catch (error: IllegalArgumentException) {
            val code = if (error.message == ErrorCode.MANIFEST_DUPLICATE_ENTRY.name) {
                ErrorCode.MANIFEST_DUPLICATE_ENTRY
            } else {
                ErrorCode.MANIFEST_PATH_INVALID
            }
            return ManifestVerification.Invalid(code)
        }
        val signature = try {
            Base64.getDecoder().decode(signed.signatureBase64)
        } catch (_: IllegalArgumentException) {
            return ManifestVerification.Invalid(ErrorCode.MANIFEST_SIGNATURE_INVALID)
        }
        if (!verifier.verify(bytes, signature)) {
            return ManifestVerification.Invalid(ErrorCode.MANIFEST_SIGNATURE_INVALID)
        }
        for (entry in signed.manifest.entries) {
            val content = packageFiles[entry.path]
                ?: return ManifestVerification.Invalid(ErrorCode.MANIFEST_ENTRY_HASH_MISMATCH)
            if (content.size.toLong() != entry.byteSize || CanonicalJson.sha256(content) != entry.sha256) {
                return ManifestVerification.Invalid(ErrorCode.MANIFEST_ENTRY_HASH_MISMATCH)
            }
        }
        if (packageFiles.keys != signed.manifest.entries.map { it.path }.toSet()) {
            return ManifestVerification.Invalid(ErrorCode.MANIFEST_ENTRY_HASH_MISMATCH)
        }
        return ManifestVerification.Valid(signed.manifest.packageId)
    }

    fun json(signed: SignedManifest): String = Json.encodeToString(signed)

    private fun validateEntries(entries: List<ManifestEntry>) {
        require(entries.map { it.path }.distinct().size == entries.size) {
            ErrorCode.MANIFEST_DUPLICATE_ENTRY.name
        }
        entries.forEach {
            require(
                it.path.isNotBlank() &&
                    !it.path.startsWith("/") &&
                    !it.path.startsWith("\\") &&
                    !it.path.contains("..") &&
                    !it.path.contains('\\'),
            ) { ErrorCode.MANIFEST_PATH_INVALID.name }
        }
    }
}

sealed interface ManifestVerification {
    data class Valid(val packageId: String) : ManifestVerification
    data class Invalid(val code: ErrorCode) : ManifestVerification
}
