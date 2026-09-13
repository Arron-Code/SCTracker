package com.sctracker.reference.domain

import java.security.KeyPairGenerator
import java.security.Signature
import java.security.spec.ECGenParameterSpec
import kotlin.test.assertEquals
import kotlin.test.assertIs
import org.junit.Test

class PackageManifestTest {
    @Test
    fun `verifies signature and every file before import`() {
        val keyPair = KeyPairGenerator.getInstance("EC").run {
            initialize(ECGenParameterSpec("secp256r1"))
            generateKeyPair()
        }
        val content = "append-only-events".toByteArray()
        val manifest = UnsignedManifest(
            packageId = "PKG-1",
            createdAtEpochMillis = 1_700_000_000_000,
            signerDeviceId = "DEV-1",
            headEventHash = "a".repeat(64),
            entries = listOf(ManifestEntry("events/events.jsonl", content.size.toLong(), CanonicalJson.sha256(content))),
        )
        val signer = ManifestSigner { bytes ->
            Signature.getInstance("SHA256withECDSA").run {
                initSign(keyPair.private)
                update(bytes)
                sign()
            }
        }
        val verifier = ManifestSignatureVerifier { bytes, signature ->
            Signature.getInstance("SHA256withECDSA").run {
                initVerify(keyPair.public)
                update(bytes)
                verify(signature)
            }
        }
        val signed = PackageManifests.sign(manifest, signer)
        assertIs<ManifestVerification.Valid>(
            PackageManifests.verifyBeforeImport(
                signed,
                mapOf("events/events.jsonl" to content),
                verifier,
            ),
        )
        val tampered = PackageManifests.verifyBeforeImport(
            signed,
            mapOf("events/events.jsonl" to "changed".toByteArray()),
            verifier,
        )
        assertEquals(
            ErrorCode.MANIFEST_ENTRY_HASH_MISMATCH,
            (tampered as ManifestVerification.Invalid).code,
        )
    }

    @Test
    fun `rejects an invalid package signature before file acceptance`() {
        val manifest = UnsignedManifest(
            packageId = "PKG-2",
            createdAtEpochMillis = 1,
            signerDeviceId = "DEV-1",
            headEventHash = "b".repeat(64),
            entries = emptyList(),
        )
        val signed = SignedManifest(manifest, signatureBase64 = "AA==")
        val result = PackageManifests.verifyBeforeImport(
            signed,
            emptyMap(),
            ManifestSignatureVerifier { _, _ -> false },
        )
        assertEquals(
            ErrorCode.MANIFEST_SIGNATURE_INVALID,
            (result as ManifestVerification.Invalid).code,
        )
    }
}
