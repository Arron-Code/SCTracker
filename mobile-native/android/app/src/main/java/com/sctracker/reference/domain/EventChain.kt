package com.sctracker.reference.domain

import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put

object EventChain {
    val GENESIS_HASH = "0".repeat(64)

    fun create(
        eventId: String,
        aggregateType: String,
        aggregateId: String,
        eventType: String,
        sequence: Long,
        previous: Event?,
        occurredAtEpochMillis: Long,
        actorId: String,
        deviceId: String,
        payload: JsonObject,
    ): Event {
        val prevHash = previous?.eventHash ?: GENESIS_HASH
        val payloadHash = CanonicalJson.hash(payload)
        val envelope = envelope(
            eventId, aggregateType, aggregateId, eventType, sequence, prevHash, payloadHash,
            occurredAtEpochMillis, actorId, deviceId,
        )
        return Event(
            eventId = eventId,
            aggregateType = aggregateType,
            aggregateId = aggregateId,
            eventType = eventType,
            sequence = sequence,
            prevHash = prevHash,
            payloadHash = payloadHash,
            eventHash = CanonicalJson.hash(envelope),
            occurredAtEpochMillis = occurredAtEpochMillis,
            actorId = actorId,
            deviceId = deviceId,
            payload = payload,
        )
    }

    fun verify(events: List<Event>): VerificationResult {
        var previous: Event? = null
        events.forEachIndexed { index, event ->
            val expectedSequence = index.toLong() + 1
            if (event.sequence != expectedSequence) {
                return VerificationResult.Invalid(index, ErrorCode.EVENT_SEQUENCE_INVALID)
            }
            val expectedPrev = previous?.eventHash ?: GENESIS_HASH
            if (event.prevHash != expectedPrev) {
                return VerificationResult.Invalid(index, ErrorCode.EVENT_PREV_HASH_MISMATCH)
            }
            if (CanonicalJson.hash(event.payload) != event.payloadHash) {
                return VerificationResult.Invalid(index, ErrorCode.EVENT_PAYLOAD_HASH_MISMATCH)
            }
            val expectedHash = CanonicalJson.hash(
                envelope(
                    event.eventId, event.aggregateType, event.aggregateId, event.eventType,
                    event.sequence, event.prevHash, event.payloadHash, event.occurredAtEpochMillis,
                    event.actorId, event.deviceId,
                ),
            )
            if (event.eventHash != expectedHash) {
                return VerificationResult.Invalid(index, ErrorCode.EVENT_HASH_MISMATCH)
            }
            previous = event
        }
        return VerificationResult.Valid(events.size, previous?.eventHash ?: GENESIS_HASH)
    }

    fun serializedLine(event: Event): String = CanonicalJson.parser.encodeToString(event)

    private fun envelope(
        eventId: String,
        aggregateType: String,
        aggregateId: String,
        eventType: String,
        sequence: Long,
        prevHash: String,
        payloadHash: String,
        occurredAtEpochMillis: Long,
        actorId: String,
        deviceId: String,
    ) = buildJsonObject {
        put("actorId", actorId)
        put("aggregateId", aggregateId)
        put("aggregateType", aggregateType)
        put("deviceId", deviceId)
        put("eventId", eventId)
        put("eventType", eventType)
        put("occurredAtEpochMillis", occurredAtEpochMillis)
        put("payloadHash", payloadHash)
        put("prevHash", prevHash)
        put("sequence", sequence)
    }
}

sealed interface VerificationResult {
    data class Valid(val eventCount: Int, val headHash: String) : VerificationResult
    data class Invalid(val eventIndex: Int, val code: ErrorCode) : VerificationResult
}

sealed interface AppendResult {
    data class Appended(val event: Event) : AppendResult
    data class AlreadyPresent(val event: Event) : AppendResult
}

class InMemoryEventStore {
    private val events = mutableListOf<Event>()
    private val byId = mutableMapOf<String, Event>()

    @Synchronized
    fun append(event: Event): AppendResult {
        byId[event.eventId]?.let { existing ->
            if (existing == event) return AppendResult.AlreadyPresent(existing)
            throw DomainException(ErrorCode.EVENT_ID_COLLISION, "eventId already has different content")
        }
        val head = events.lastOrNull()
        val expectedSequence = (head?.sequence ?: 0) + 1
        if (event.sequence != expectedSequence) {
            throw DomainException(ErrorCode.EVENT_SEQUENCE_INVALID, "expected $expectedSequence")
        }
        if (event.prevHash != (head?.eventHash ?: EventChain.GENESIS_HASH)) {
            throw DomainException(ErrorCode.EVENT_PREV_HASH_MISMATCH, "event does not extend local head")
        }
        when (val verification = EventChain.verify(events + event)) {
            is VerificationResult.Invalid ->
                throw DomainException(verification.code, "event chain verification failed")
            is VerificationResult.Valid -> Unit
        }
        events += event
        byId[event.eventId] = event
        return AppendResult.Appended(event)
    }

    @Synchronized
    fun all(): List<Event> = events.toList()
}
