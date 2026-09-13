package com.sctracker.reference.domain

import kotlin.test.assertEquals
import kotlin.test.assertIs
import org.junit.Test
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put

class EventChainTest {
    private fun event(previous: Event? = null, id: String = "EV-1", state: String = "ISSUED") =
        EventChain.create(
            eventId = id,
            aggregateType = "Sack",
            aggregateId = "SACK-1",
            eventType = "SACK_$state",
            sequence = (previous?.sequence ?: 0) + 1,
            previous = previous,
            occurredAtEpochMillis = 1_700_000_000_000,
            actorId = "ACT-1",
            deviceId = "DEV-1",
            payload = buildJsonObject { put("state", state) },
        )

    @Test
    fun `creates deterministic compatible genesis vector`() {
        val genesis = event()
        assertEquals("28ec7bccebeef254cf6d88315dd1999f7306d86721e07e021f9cf55a8793771e", genesis.payloadHash)
        assertEquals("0543ade20a40ec5825515a818d9d112c02a733becfa009ba1fb39671ee2fed49", genesis.eventHash)
        assertIs<VerificationResult.Valid>(EventChain.verify(listOf(genesis)))
    }

    @Test
    fun `detects payload and chain tampering`() {
        val first = event()
        val second = event(first, "EV-2", "SEALED")
        val tamperedPayload = first.copy(payload = buildJsonObject { put("state", "VOID") })
        assertEquals(
            ErrorCode.EVENT_PAYLOAD_HASH_MISMATCH,
            (EventChain.verify(listOf(tamperedPayload)) as VerificationResult.Invalid).code,
        )
        val tamperedLink = second.copy(prevHash = EventChain.GENESIS_HASH)
        assertEquals(
            ErrorCode.EVENT_PREV_HASH_MISMATCH,
            (EventChain.verify(listOf(first, tamperedLink)) as VerificationResult.Invalid).code,
        )
    }

    @Test
    fun `replay is idempotent and collisions are rejected`() {
        val store = InMemoryEventStore()
        val first = event()
        assertIs<AppendResult.Appended>(store.append(first))
        assertIs<AppendResult.AlreadyPresent>(store.append(first))
        try {
            store.append(first.copy(actorId = "ACT-OTHER"))
            throw AssertionError("Expected event ID collision")
        } catch (error: DomainException) {
            assertEquals(ErrorCode.EVENT_ID_COLLISION, error.code)
        }
        assertEquals(1, store.all().size)
    }
}
