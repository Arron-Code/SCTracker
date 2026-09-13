package com.sctracker.reference.domain

import java.math.BigInteger
import java.util.Base64
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonArray
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.longOrNull
import kotlinx.serialization.json.put

data class WireEventEnvelopeV1(
    val schema: Long = 1,
    val eventId: String,
    val eventType: String,
    val aggregateId: String,
    val sequence: Long,
    val prevHash: String,
    val createdMonotonic: Long,
    val reportedUtc: String?,
    val deviceId: String,
    val actorId: String,
    val payloadHash: String,
    val keyId: String,
    val signature: String?,
)

data class WireEventV1(val envelope: WireEventEnvelopeV1, val payload: JsonObject)

fun interface WireSignatureVerifierV1 {
    fun verify(keyId: String, signingBytes: ByteArray, signatureP1363: ByteArray): Boolean
}

object EventWireCodecV1 {
    const val SCHEMA = 1L
    val GENESIS_HASH = "0".repeat(64)
    private val hashPattern = Regex("[0-9a-f]{64}")
    private val utcPattern = Regex(
        """\d{4}-(0[1-9]|1[0-2])-([0-2]\d|3[01])T([01]\d|2[0-3]):[0-5]\d:[0-5]\d\.\d{3}Z""",
    )

    fun payloadBytes(payload: JsonObject): ByteArray = CanonicalJson.encode(payload)

    fun signingBytes(envelope: WireEventEnvelopeV1): ByteArray =
        CanonicalJson.encode(envelopeValue(envelope, includeSignature = false))

    fun envelopeBytes(envelope: WireEventEnvelopeV1): ByteArray {
        require(envelope.signature != null) { "signature is required on a wire envelope" }
        return CanonicalJson.encode(envelopeValue(envelope, includeSignature = true))
    }

    fun decodeEnvelope(bytes: ByteArray): WireEventEnvelopeV1 {
        val value = CanonicalJson.parser.parseToJsonElement(bytes.decodeToString()) as? JsonObject
            ?: throw IllegalArgumentException("wire envelope must be an object")
        val required = setOf(
            "schema", "eventId", "eventType", "aggregateId", "sequence", "prevHash",
            "createdMonotonic", "deviceId", "actorId", "payloadHash", "keyId", "signature",
        )
        require(value.keys.containsAll(required) && value.keys.all { it in required || it == "reportedUtc" }) {
            "wire envelope fields do not match schema 1"
        }
        fun string(name: String): String {
            val primitive = value[name]?.jsonPrimitive
                ?: throw IllegalArgumentException("$name is required")
            require(primitive.isString) { "$name must be a string" }
            return primitive.content
        }
        fun integer(name: String): Long =
            value[name]?.jsonPrimitive?.longOrNull
                ?: throw IllegalArgumentException("$name must be an integer")
        val envelope = WireEventEnvelopeV1(
            schema = integer("schema"),
            eventId = string("eventId"),
            eventType = string("eventType"),
            aggregateId = string("aggregateId"),
            sequence = integer("sequence"),
            prevHash = string("prevHash"),
            createdMonotonic = integer("createdMonotonic"),
            reportedUtc = value["reportedUtc"]?.let { string("reportedUtc") },
            deviceId = string("deviceId"),
            actorId = string("actorId"),
            payloadHash = string("payloadHash"),
            keyId = string("keyId"),
            signature = string("signature"),
        )
        require(envelopeBytes(envelope).contentEquals(bytes)) { "wire envelope is not canonical" }
        return envelope
    }

    fun eventHash(envelope: WireEventEnvelopeV1): String =
        CanonicalJson.sha256(signingBytes(envelope))

    fun validate(event: WireEventV1, verifier: WireSignatureVerifierV1): Boolean {
        val envelope = event.envelope
        val canonicalPayload = runCatching { payloadBytes(event.payload) }.getOrNull() ?: return false
        if (envelope.schema != SCHEMA ||
            envelope.eventId.isEmpty() ||
            envelope.eventType.isEmpty() ||
            envelope.aggregateId.isEmpty() ||
            envelope.sequence < 1 ||
            envelope.createdMonotonic < 0 ||
            envelope.deviceId.isEmpty() ||
            envelope.actorId.isEmpty() ||
            envelope.keyId.isEmpty() ||
            !hashPattern.matches(envelope.prevHash) ||
            !hashPattern.matches(envelope.payloadHash) ||
            (envelope.reportedUtc != null && !utcPattern.matches(envelope.reportedUtc)) ||
            CanonicalJson.sha256(canonicalPayload) != envelope.payloadHash
        ) {
            return false
        }
        val signatureText = envelope.signature ?: return false
        val signature = try {
            Base64.getDecoder().decode(signatureText)
        } catch (_: IllegalArgumentException) {
            return false
        }
        if (Base64.getEncoder().encodeToString(signature) != signatureText ||
            !P256SignatureV1.isCanonicalLowS(signature)
        ) {
            return false
        }
        return verifier.verify(envelope.keyId, signingBytes(envelope), signature)
    }

    fun offerPayload(
        transferId: String,
        fromActorId: String,
        toActorId: String,
        sackIds: List<String>,
    ): JsonObject {
        require(sackIds.isNotEmpty() && sackIds.distinct().size == sackIds.size)
        return buildJsonObject {
            put("fromActorId", fromActorId)
            put("sackIds", buildJsonArray {
                sackIds.sortedWith(Comparator(CanonicalJson::compareUtf8))
                    .forEach { add(JsonPrimitive(it)) }
            })
            put("toActorId", toActorId)
            put("transferId", transferId)
        }
    }

    fun decisionPayload(transferId: String, decision: String, offerHash: String): JsonObject {
        require(decision == "ACCEPT" || decision == "REJECT")
        require(hashPattern.matches(offerHash))
        return buildJsonObject {
            put("decision", decision)
            put("offerHash", offerHash)
            put("transferId", transferId)
        }
    }

    private fun envelopeValue(envelope: WireEventEnvelopeV1, includeSignature: Boolean) =
        buildJsonObject {
            put("actorId", envelope.actorId)
            put("aggregateId", envelope.aggregateId)
            put("createdMonotonic", envelope.createdMonotonic)
            put("deviceId", envelope.deviceId)
            put("eventId", envelope.eventId)
            put("eventType", envelope.eventType)
            put("keyId", envelope.keyId)
            put("payloadHash", envelope.payloadHash)
            put("prevHash", envelope.prevHash)
            envelope.reportedUtc?.let { put("reportedUtc", it) }
            put("schema", envelope.schema)
            put("sequence", envelope.sequence)
            if (includeSignature) put("signature", requireNotNull(envelope.signature))
        }
}

class WireReplayGuardV1 {
    private val admitted = mutableMapOf<String, ByteArray>()

    @Synchronized
    fun admit(event: WireEventV1): Boolean {
        val canonical = EventWireCodecV1.payloadBytes(event.payload) +
            EventWireCodecV1.envelopeBytes(event.envelope)
        val existing = admitted[event.envelope.eventId]
        if (existing != null) {
            if (!existing.contentEquals(canonical)) {
                throw DomainException(
                    ErrorCode.EVENT_ID_COLLISION,
                    "eventId already has different wire bytes",
                )
            }
            return false
        }
        admitted[event.envelope.eventId] = canonical
        return true
    }
}

object P256SignatureV1 {
    private val order = BigInteger(
        "FFFFFFFF00000000FFFFFFFFFFFFFFFFBCE6FAADA7179E84F3B9CAC2FC632551",
        16,
    )
    private val halfOrder = order.shiftRight(1)

    fun derToCanonicalP1363(der: ByteArray): ByteArray {
        var offset = 0
        require(readByte(der, offset++) == 0x30)
        val (sequenceLength, sequenceOffset) = readLength(der, offset)
        offset = sequenceOffset
        require(offset + sequenceLength == der.size)
        val (r, afterR) = readInteger(der, offset)
        val (sInput, afterS) = readInteger(der, afterR)
        require(afterS == der.size)
        val s = if (sInput > halfOrder) order.subtract(sInput) else sInput
        return fixed32(r) + fixed32(s)
    }

    fun p1363ToDer(signature: ByteArray): ByteArray {
        require(isCanonicalLowS(signature))
        val r = derInteger(signature.copyOfRange(0, 32))
        val s = derInteger(signature.copyOfRange(32, 64))
        val body = byteArrayOf(0x02) + length(r.size) + r + byteArrayOf(0x02) + length(s.size) + s
        return byteArrayOf(0x30) + length(body.size) + body
    }

    fun isCanonicalLowS(signature: ByteArray): Boolean {
        if (signature.size != 64) return false
        val r = BigInteger(1, signature.copyOfRange(0, 32))
        val s = BigInteger(1, signature.copyOfRange(32, 64))
        return r > BigInteger.ZERO && r < order && s > BigInteger.ZERO && s <= halfOrder
    }

    private fun readInteger(bytes: ByteArray, start: Int): Pair<BigInteger, Int> {
        var offset = start
        require(readByte(bytes, offset++) == 0x02)
        val (size, contentOffset) = readLength(bytes, offset)
        require(size in 1..33 && contentOffset + size <= bytes.size)
        val value = bytes.copyOfRange(contentOffset, contentOffset + size)
        require(value[0].toInt() and 0x80 == 0)
        return BigInteger(1, value) to (contentOffset + size)
    }

    private fun readLength(bytes: ByteArray, start: Int): Pair<Int, Int> {
        val first = readByte(bytes, start)
        if (first < 0x80) return first to (start + 1)
        val count = first and 0x7f
        require(count in 1..2 && start + count < bytes.size)
        var value = 0
        repeat(count) { value = (value shl 8) or readByte(bytes, start + 1 + it) }
        return value to (start + 1 + count)
    }

    private fun readByte(bytes: ByteArray, offset: Int): Int {
        require(offset in bytes.indices)
        return bytes[offset].toInt() and 0xff
    }

    private fun fixed32(value: BigInteger): ByteArray {
        val raw = value.toByteArray().dropWhile { it == 0.toByte() }.toByteArray()
        require(raw.size <= 32)
        return ByteArray(32 - raw.size) + raw
    }

    private fun derInteger(raw: ByteArray): ByteArray {
        val withoutLeadingZeroes = raw.dropWhile { it == 0.toByte() }.toByteArray()
        val stripped = if (withoutLeadingZeroes.isEmpty()) byteArrayOf(0) else withoutLeadingZeroes
        return if (stripped[0].toInt() and 0x80 != 0) byteArrayOf(0) + stripped else stripped
    }

    private fun length(value: Int): ByteArray {
        require(value < 128)
        return byteArrayOf(value.toByte())
    }
}
