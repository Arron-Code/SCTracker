package com.sctracker.reference.security

import android.os.Build
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyInfo
import android.security.keystore.KeyProperties
import android.security.keystore.StrongBoxUnavailableException
import java.security.KeyFactory
import java.security.KeyPairGenerator
import java.security.KeyStore
import java.security.Signature
import java.security.spec.ECGenParameterSpec

enum class KeyProtection {
    STRONGBOX,
    TRUSTED_EXECUTION_ENVIRONMENT,
    SOFTWARE_OR_UNKNOWN,
}

data class KeyProvisioningReport(
    val alias: String,
    val protection: KeyProtection,
    val strongBoxRequested: Boolean,
    val strongBoxFallbackUsed: Boolean,
)

class AndroidKeystoreSigner(private val alias: String = "sctracker-reference-p256-v1") {
    private val keyStore = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }

    fun ensureKey(): KeyProvisioningReport {
        if (!keyStore.containsAlias(alias)) {
            val strongBoxSucceeded = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                try {
                    generate(requireStrongBox = true)
                    true
                } catch (_: StrongBoxUnavailableException) {
                    false
                }
            } else {
                false
            }
            if (!strongBoxSucceeded) generate(requireStrongBox = false)
        }
        val entry = keyStore.getEntry(alias, null) as KeyStore.PrivateKeyEntry
        val keyInfo = KeyFactory.getInstance(entry.privateKey.algorithm, "AndroidKeyStore")
            .getKeySpec(entry.privateKey, KeyInfo::class.java)
        val protection = when {
            Build.VERSION.SDK_INT >= Build.VERSION_CODES.S &&
                keyInfo.securityLevel == KeyProperties.SECURITY_LEVEL_STRONGBOX -> KeyProtection.STRONGBOX
            Build.VERSION.SDK_INT >= Build.VERSION_CODES.S &&
                keyInfo.securityLevel == KeyProperties.SECURITY_LEVEL_TRUSTED_ENVIRONMENT ->
                KeyProtection.TRUSTED_EXECUTION_ENVIRONMENT
            @Suppress("DEPRECATION")
            Build.VERSION.SDK_INT < Build.VERSION_CODES.S && keyInfo.isInsideSecureHardware ->
                KeyProtection.TRUSTED_EXECUTION_ENVIRONMENT
            else -> KeyProtection.SOFTWARE_OR_UNKNOWN
        }
        return KeyProvisioningReport(
            alias = alias,
            protection = protection,
            strongBoxRequested = Build.VERSION.SDK_INT >= Build.VERSION_CODES.P,
            strongBoxFallbackUsed = Build.VERSION.SDK_INT >= Build.VERSION_CODES.P &&
                protection != KeyProtection.STRONGBOX,
        )
    }

    fun publicKeySpki(): ByteArray {
        ensureKey()
        return keyStore.getCertificate(alias).publicKey.encoded
    }

    fun sign(message: ByteArray): ByteArray {
        ensureKey()
        val privateKey = (keyStore.getEntry(alias, null) as KeyStore.PrivateKeyEntry).privateKey
        return Signature.getInstance("SHA256withECDSA").run {
            initSign(privateKey)
            update(message)
            sign()
        }
    }

    private fun generate(requireStrongBox: Boolean) {
        val builder = KeyGenParameterSpec.Builder(
            alias,
            KeyProperties.PURPOSE_SIGN or KeyProperties.PURPOSE_VERIFY,
        )
            .setAlgorithmParameterSpec(ECGenParameterSpec("secp256r1"))
            .setDigests(KeyProperties.DIGEST_SHA256)
            .setUserAuthenticationRequired(false)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            builder.setIsStrongBoxBacked(requireStrongBox)
        }
        KeyPairGenerator.getInstance(KeyProperties.KEY_ALGORITHM_EC, "AndroidKeyStore")
            .run {
                initialize(builder.build())
                generateKeyPair()
            }
    }
}
