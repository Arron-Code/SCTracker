package com.sctracker.reference.domain

import kotlinx.serialization.json.buildJsonArray
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.add
import kotlinx.serialization.json.put

object SackStateMachine {
    private val allowed = mapOf(
        LifecycleState.UNISSUED to setOf(LifecycleState.ISSUED, LifecycleState.VOID),
        LifecycleState.ISSUED to setOf(LifecycleState.SEALED, LifecycleState.VOID, LifecycleState.DAMAGED),
        LifecycleState.SEALED to setOf(LifecycleState.IN_TRANSIT, LifecycleState.OPENED, LifecycleState.DAMAGED),
        LifecycleState.IN_TRANSIT to setOf(LifecycleState.OPENED, LifecycleState.DAMAGED),
        LifecycleState.OPENED to setOf(LifecycleState.VOID),
        LifecycleState.DAMAGED to setOf(LifecycleState.VOID),
        LifecycleState.VOID to emptySet(),
    )

    fun transition(from: LifecycleState, to: LifecycleState): LifecycleState {
        if (to !in allowed.getValue(from)) {
            throw DomainException(ErrorCode.TRANSITION_NOT_ALLOWED, "$from cannot transition to $to")
        }
        return to
    }
}

data class GenesisResult(val batch: Batch, val sacks: List<Sack>, val seals: List<Seal>)

object GenesisWorkflow {
    fun create(batchId: String, product: String, origin: String, quantityKg: Double, sackCount: Int): GenesisResult {
        if (sackCount !in 1..100) {
            throw DomainException(ErrorCode.GENESIS_SACK_COUNT_INVALID, "sack count must be 1..100")
        }
        val sacks = (1..sackCount).map { ordinal ->
            Sack(
                id = "$batchId-S${ordinal.toString().padStart(3, '0')}",
                batchId = batchId,
                ordinal = ordinal,
            )
        }
        return GenesisResult(
            batch = Batch(batchId, product, origin, quantityKg, sacks.map(Sack::id)),
            sacks = sacks,
            seals = emptyList(),
        )
    }
}

object TransferWorkflow {
    fun offer(
        id: String,
        sackIds: List<String>,
        fromActorId: String,
        toActorId: String,
    ): Transfer {
        require(sackIds.isNotEmpty())
        val payload = buildJsonObject {
            put("fromActorId", fromActorId)
            put("id", id)
            put("sackIds", buildJsonArray { sackIds.sorted().forEach(::add) })
            put("toActorId", toActorId)
        }
        return Transfer(id, sackIds.sorted(), fromActorId, toActorId, CanonicalJson.hash(payload))
    }

    fun decide(
        transfer: Transfer,
        exactOfferHash: String,
        decision: TransferDecision,
        decisionEventId: String,
    ): Transfer {
        require(decision != TransferDecision.PENDING)
        if (transfer.decision != TransferDecision.PENDING) {
            throw DomainException(ErrorCode.TRANSFER_ALREADY_DECIDED, "transfer already decided")
        }
        if (transfer.offerHash != exactOfferHash) {
            throw DomainException(
                ErrorCode.TRANSFER_OFFER_HASH_MISMATCH,
                "decision must reference the exact offer hash",
            )
        }
        return transfer.copy(decision = decision, decisionEventId = decisionEventId)
    }
}
