package com.sctracker.reference.domain

import java.math.BigInteger
import java.security.KeyPairGenerator
import java.security.Signature
import java.security.spec.ECGenParameterSpec
import java.util.Base64
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertFalse
import kotlin.test.assertTrue
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import org.junit.Test

class WireProtocolV1Test {
    private val payload = buildJsonObject { put("state", "ISSUED") }
    private val payloadHash = "28ec7bccebeef254cf6d88315dd1999f7306d86721e07e021f9cf55a8793771e"
    private val zeroSignature =
        "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=="

    @Test
    fun `reproduces exact genesis payload and envelope vectors`() {
        val envelope = fixtureEnvelope(zeroSignature)

        assertEquals("""{"state":"ISSUED"}""", EventWireCodecV1.payloadBytes(payload).decodeToString())
        assertEquals(payloadHash, CanonicalJson.sha256(EventWireCodecV1.payloadBytes(payload)))
        assertEquals(
            """{"actorId":"ACT-1","aggregateId":"SACK-1","createdMonotonic":123456789,"deviceId":"DEV-1","eventId":"EV-1","eventType":"SACK_ISSUED","keyId":"KEY-1","payloadHash":"$payloadHash","prevHash":"${EventWireCodecV1.GENESIS_HASH}","reportedUtc":"2026-09-13T16:00:00.000Z","schema":1,"sequence":1}""",
            EventWireCodecV1.signingBytes(envelope).decodeToString(),
        )
        assertEquals(
            "0a48be7c8f9aab2f6c2a3066d45c4371d2eec94fd307c59ecd60a2243d348773",
            EventWireCodecV1.eventHash(envelope),
        )
        assertEquals(
            """{"actorId":"ACT-1","aggregateId":"SACK-1","createdMonotonic":123456789,"deviceId":"DEV-1","eventId":"EV-1","eventType":"SACK_ISSUED","keyId":"KEY-1","payloadHash":"$payloadHash","prevHash":"${EventWireCodecV1.GENESIS_HASH}","reportedUtc":"2026-09-13T16:00:00.000Z","schema":1,"sequence":1,"signature":"$zeroSignature"}""",
            EventWireCodecV1.envelopeBytes(envelope).decodeToString(),
        )
        assertEquals(
            "8a9703d8cd5eac9ae00cf1e8943ad206c6d4ab5f5d4a6e081c796b8a2b61348e",
            CanonicalJson.sha256(EventWireCodecV1.envelopeBytes(envelope)),
        )
        assertEquals(envelope, EventWireCodecV1.decodeEnvelope(EventWireCodecV1.envelopeBytes(envelope)))
        assertFailsWith<IllegalArgumentException> {
            EventWireCodecV1.decodeEnvelope(" ${EventWireCodecV1.envelopeBytes(envelope).decodeToString()}".encodeToByteArray())
        }
    }

    @Test
    fun `uses UTF-8 key ordering escaping and integer-only numbers`() {
        val value = buildJsonObject {
            put("\uD800\uDC00", "supplementary")
            put("\uE000", "private")
            put("control", "A\nB\t\"\\")
        }
        val bytes = CanonicalJson.encode(value)
        assertEquals(
            "{\"control\":\"A\\nB\\t\\\"\\\\\",\"\uE000\":\"private\",\"\uD800\uDC00\":\"supplementary\"}",
            bytes.decodeToString(),
        )
        assertEquals(
            "2e28d5f76e9c174abc2af77b68ff4b9160fb36c83f7c0b88bfbb5286f70b5f3b",
            CanonicalJson.sha256(bytes),
        )
        assertFailsWith<IllegalArgumentException> {
            CanonicalJson.encode(JsonPrimitive(1e3))
        }
        assertFailsWith<IllegalArgumentException> {
            CanonicalJson.encode(JsonPrimitive(1.5))
        }
        assertFailsWith<IllegalArgumentException> {
            CanonicalJson.encode(CanonicalJson.parser.parseToJsonElement("""{"value":1e3}"""))
        }
    }

    @Test
    fun `reproduces exact transfer offer and accept hashes`() {
        val offer = EventWireCodecV1.offerPayload(
            transferId = "TR-1",
            fromActorId = "ACT-1",
            toActorId = "ACT-2",
            sackIds = listOf("SACK-2", "SACK-1"),
        )
        assertEquals(
            """{"fromActorId":"ACT-1","sackIds":["SACK-1","SACK-2"],"toActorId":"ACT-2","transferId":"TR-1"}""",
            CanonicalJson.encode(offer).decodeToString(),
        )
        val offerHash = CanonicalJson.hash(offer)
        assertEquals("7c21ee171ccb1acde534350f0f4905ab17abd0860aae3012bc681e572f75a590", offerHash)
        val accept = EventWireCodecV1.decisionPayload("TR-1", "ACCEPT", offerHash)
        assertEquals(
            """{"decision":"ACCEPT","offerHash":"$offerHash","transferId":"TR-1"}""",
            CanonicalJson.encode(accept).decodeToString(),
        )
        assertEquals(
            "88cf4afa9062dffed0bc350acbb039e7c735c9569f6a622f7715beba516d64f5",
            CanonicalJson.hash(accept),
        )
    }

    @Test
    fun `verifies P1363 low-S signatures and rejects tampering and replay collisions`() {
        val keyPair = KeyPairGenerator.getInstance("EC").run {
            initialize(ECGenParameterSpec("secp256r1"))
            generateKeyPair()
        }
        val unsigned = fixtureEnvelope(signature = null)
        val der = Signature.getInstance("SHA256withECDSA").run {
            initSign(keyPair.private)
            update(EventWireCodecV1.signingBytes(unsigned))
            sign()
        }
        val p1363 = P256SignatureV1.derToCanonicalP1363(der)
        val envelope = unsigned.copy(signature = Base64.getEncoder().encodeToString(p1363))
        val event = WireEventV1(envelope, payload)
        val verifier = WireSignatureVerifierV1 { _, bytes, signature ->
            Signature.getInstance("SHA256withECDSA").run {
                initVerify(keyPair.public)
                update(bytes)
                verify(P256SignatureV1.p1363ToDer(signature))
            }
        }

        assertTrue(EventWireCodecV1.validate(event, verifier))
        val order = BigInteger(
            "FFFFFFFF00000000FFFFFFFFFFFFFFFFBCE6FAADA7179E84F3B9CAC2FC632551",
            16,
        )
        val highS = order.subtract(BigInteger(1, p1363.copyOfRange(32, 64)))
        val highSBytes = highS.toByteArray().let { bytes ->
            val unsigned = if (bytes.size == 33 && bytes[0] == 0.toByte()) bytes.copyOfRange(1, 33) else bytes
            ByteArray(32 - unsigned.size) + unsigned
        }
        val highSignature = p1363.copyOfRange(0, 32) + highSBytes
        assertFalse(
            EventWireCodecV1.validate(
                event.copy(
                    envelope = envelope.copy(
                        signature = Base64.getEncoder().encodeToString(highSignature),
                    ),
                ),
                verifier,
            ),
        )
        assertFalse(
            EventWireCodecV1.validate(
                event.copy(payload = buildJsonObject { put("state", "VOID") }),
                verifier,
            ),
        )

        val replayGuard = WireReplayGuardV1()
        assertTrue(replayGuard.admit(event))
        assertFalse(replayGuard.admit(event))
        assertFailsWith<DomainException> {
            replayGuard.admit(event.copy(envelope = envelope.copy(actorId = "ACT-OTHER")))
        }
    }

    private fun fixtureEnvelope(signature: String?) = WireEventEnvelopeV1(
        eventId = "EV-1",
        eventType = "SACK_ISSUED",
        aggregateId = "SACK-1",
        sequence = 1,
        prevHash = EventWireCodecV1.GENESIS_HASH,
        createdMonotonic = 123456789,
        reportedUtc = "2026-09-13T16:00:00.000Z",
        deviceId = "DEV-1",
        actorId = "ACT-1",
        payloadHash = payloadHash,
        keyId = "KEY-1",
        signature = signature,
    )
}
