package com.sctracker.reference.domain

import kotlin.test.assertEquals
import org.junit.Test

class WorkflowTest {
    @Test
    fun `genesis creates at most one hundred sacks`() {
        val result = GenesisWorkflow.create("B-1", "Coffee", "Jimma", 600.0, 100)
        assertEquals(100, result.sacks.size)
        assertEquals("B-1-S001", result.sacks.first().id)
        assertEquals("B-1-S100", result.sacks.last().id)

        try {
            GenesisWorkflow.create("B-2", "Coffee", "Jimma", 606.0, 101)
            throw AssertionError("Expected count validation")
        } catch (error: DomainException) {
            assertEquals(ErrorCode.GENESIS_SACK_COUNT_INVALID, error.code)
        }
    }

    @Test
    fun `lifecycle permits documented path and blocks shortcuts`() {
        assertEquals(
            LifecycleState.ISSUED,
            SackStateMachine.transition(LifecycleState.UNISSUED, LifecycleState.ISSUED),
        )
        assertEquals(
            LifecycleState.SEALED,
            SackStateMachine.transition(LifecycleState.ISSUED, LifecycleState.SEALED),
        )
        try {
            SackStateMachine.transition(LifecycleState.UNISSUED, LifecycleState.IN_TRANSIT)
            throw AssertionError("Expected invalid transition")
        } catch (error: DomainException) {
            assertEquals(ErrorCode.TRANSITION_NOT_ALLOWED, error.code)
        }
    }

    @Test
    fun `transfer decision requires exact offer hash and starts pending`() {
        val offer = TransferWorkflow.offer("T-1", listOf("S-2", "S-1"), "A-1", "A-2")
        assertEquals(TransferDecision.PENDING, offer.decision)
        val accepted = TransferWorkflow.decide(
            offer,
            offer.offerHash,
            TransferDecision.ACCEPTED,
            "EV-ACCEPT",
        )
        assertEquals(TransferDecision.ACCEPTED, accepted.decision)

        try {
            TransferWorkflow.decide(offer, "0".repeat(64), TransferDecision.REJECTED, "EV-REJECT")
            throw AssertionError("Expected exact offer hash validation")
        } catch (error: DomainException) {
            assertEquals(ErrorCode.TRANSFER_OFFER_HASH_MISMATCH, error.code)
        }
    }
}
