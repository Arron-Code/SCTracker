package com.sctracker.reference.domain

import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonObject

@Serializable
enum class ActorRole { PRODUCER, COOPERATIVE, TRANSPORTER, RECEIVER, INSPECTOR, ADMIN }

@Serializable
enum class TrustState { UNVERIFIED, LOCAL_ATTESTED, ORGANIZATION_VERIFIED, REVOKED }

@Serializable
data class Actor(
    val id: String,
    val displayLabel: String,
    val roles: Set<ActorRole>,
    val trustState: TrustState = TrustState.UNVERIFIED,
)

@Serializable
data class Device(
    val id: String,
    val actorId: String,
    val publicKeySpkiBase64: String?,
    val trustState: TrustState,
    val keyProtection: String?,
)

@Serializable
enum class LifecycleState { UNISSUED, ISSUED, SEALED, IN_TRANSIT, OPENED, VOID, DAMAGED }

@Serializable
data class Batch(
    val id: String,
    val product: String,
    val origin: String,
    val quantityKg: Double,
    val sackIds: List<String>,
)

@Serializable
data class Sack(
    val id: String,
    val batchId: String,
    val ordinal: Int,
    val state: LifecycleState = LifecycleState.UNISSUED,
    val sealId: String? = null,
)

@Serializable
data class Seal(
    val id: String,
    val sackId: String,
    val state: LifecycleState,
    val chipUidLookup: String? = null,
)

@Serializable
data class GpsQuality(
    val latitude: Double,
    val longitude: Double,
    val horizontalAccuracyMeters: Double,
    val altitudeMeters: Double? = null,
    val speedMetersPerSecond: Double? = null,
    val bearingDegrees: Double? = null,
    val provider: String,
    val capturedAtEpochMillis: Long,
    val isMock: Boolean,
)

@Serializable
enum class MediaKind { PHOTO, DOCUMENT }

@Serializable
data class Media(
    val id: String,
    val kind: MediaKind,
    val mimeType: String,
    val byteSize: Long,
    val sha256: String,
    val capturedAtEpochMillis: Long,
    val gps: GpsQuality? = null,
    val localUri: String? = null,
)

@Serializable
enum class TransferDecision { PENDING, ACCEPTED, REJECTED }

@Serializable
data class Transfer(
    val id: String,
    val sackIds: List<String>,
    val fromActorId: String,
    val toActorId: String,
    val offerHash: String,
    val decision: TransferDecision = TransferDecision.PENDING,
    val decisionEventId: String? = null,
)

@Serializable
data class Event(
    val eventId: String,
    val aggregateType: String,
    val aggregateId: String,
    val eventType: String,
    val sequence: Long,
    val prevHash: String,
    val payloadHash: String,
    val eventHash: String,
    val occurredAtEpochMillis: Long,
    val actorId: String,
    val deviceId: String,
    val payload: JsonObject,
)

@Serializable
data class ConflictRecord(
    val id: String,
    val aggregateId: String,
    val localHeadHash: String,
    val incomingPrevHash: String,
    val reasonCode: ErrorCode,
    val quarantinedEventIds: List<String>,
)
