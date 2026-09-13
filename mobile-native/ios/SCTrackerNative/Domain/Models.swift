import Foundation

enum EntityType: String, Codable, CaseIterable, Hashable {
    case actor, device, batch, sack, seal, event, media, transfer
}

enum BatchState: String, Codable, CaseIterable, Hashable {
    case unissued = "UNISSUED"
    case issued = "ISSUED"
    case sealed = "SEALED"
    case inTransit = "IN_TRANSIT"
    case opened = "OPENED"
    case void = "VOID"
    case damaged = "DAMAGED"
}

enum TransferStatus: String, Codable, CaseIterable, Hashable {
    case pending = "PENDING"
    case accepted = "ACCEPTED"
    case rejected = "REJECTED"
}

enum TransferAction: String, Codable, Hashable {
    case offer = "OFFER"
    case accept = "ACCEPT"
    case reject = "REJECT"
}

enum TrustState: String, Codable, CaseIterable, Hashable {
    case unverified = "UNVERIFIED"
    case locallyTrusted = "LOCALLY_TRUSTED"
    case organizationVerified = "ORGANIZATION_VERIFIED"
    case revoked = "REVOKED"
}

enum ActorRole: String, Codable, CaseIterable, Hashable {
    case fieldOperator = "FIELD_OPERATOR"
    case custodian = "CUSTODIAN"
    case receiver = "RECEIVER"
    case supervisor = "SUPERVISOR"
    case auditor = "AUDITOR"
}

struct Actor: Codable, Identifiable, Hashable {
    let id: UUID
    var displayName: String
    var roles: Set<ActorRole>
    var trustState: TrustState
}

struct Device: Codable, Identifiable, Hashable {
    let id: UUID
    var displayName: String
    var publicKeyBase64: String?
    var trustState: TrustState
}

struct Batch: Codable, Identifiable, Hashable {
    let id: UUID
    var reference: String
    var product: String
    var origin: String
    var state: BatchState
    var sackIDs: [UUID]
    var activeSealID: UUID?
    var quarantined: Bool
    var lastSequence: Int
}

struct Sack: Codable, Identifiable, Hashable {
    let id: UUID
    let batchID: UUID
    var ordinal: Int
    var reference: String
    var weightKg: Decimal?
}

struct Seal: Codable, Identifiable, Hashable {
    let id: UUID
    let batchID: UUID
    var printedCode: String
    var chipUID: String?
    var trustState: TrustState
}

struct GPSQuality: Codable, Hashable {
    var latitude: Double
    var longitude: Double
    var horizontalAccuracyMeters: Double
    var altitudeMeters: Double?
    var verticalAccuracyMeters: Double?
    var capturedAt: Date
    var source: String

    var isAcceptable: Bool {
        horizontalAccuracyMeters > 0 && horizontalAccuracyMeters <= 25
    }
}

struct Media: Codable, Identifiable, Hashable {
    let id: UUID
    var kind: String
    var filename: String
    var mimeType: String
    var byteCount: Int
    var sha256: String
    var capturedAt: Date
    var gps: GPSQuality?
}

struct Transfer: Codable, Identifiable, Hashable {
    let id: UUID
    let batchID: UUID
    var fromActorID: UUID
    var toActorID: UUID
    var offerEventHash: String
    var status: TransferStatus
    var offeredAt: Date
    var resolvedAt: Date?
}

struct LedgerEvent: Codable, Identifiable, Hashable {
    let id: UUID
    let entityType: EntityType
    let entityID: UUID
    let eventType: String
    let sequence: Int
    let recordedAt: Date
    let actorID: UUID
    let deviceID: UUID
    let gps: GPSQuality?
    let mediaIDs: [UUID]
    let previousHash: String?
    let payload: CanonicalValue
    let payloadHash: String
    let eventHash: String
    let signature: SignatureEnvelope?
}

struct SignatureEnvelope: Codable, Hashable {
    var algorithm: String
    var keyID: String
    var publicKeyBase64: String
    var signatureBase64: String
    var developmentFallback: Bool
}

struct ConflictRecord: Codable, Identifiable, Hashable {
    let id: UUID
    let entityID: UUID
    var localHeadHash: String
    var incomingPreviousHash: String?
    var reasonCode: ErrorCode
    var detectedAt: Date
    var resolved: Bool
}

struct AppSnapshot: Codable {
    var actors: [Actor]
    var devices: [Device]
    var batches: [Batch]
    var sacks: [Sack]
    var seals: [Seal]
    var events: [LedgerEvent]
    var media: [Media]
    var transfers: [Transfer]
    var conflicts: [ConflictRecord]
}

enum ErrorCode: String, Codable, Error, CaseIterable, Hashable {
    case invalidInput = "SCT-INPUT-001"
    case invalidTransition = "SCT-STATE-001"
    case duplicateEvent = "SCT-EVENT-001"
    case chainMismatch = "SCT-EVENT-002"
    case payloadHashMismatch = "SCT-EVENT-003"
    case eventHashMismatch = "SCT-EVENT-004"
    case signatureInvalid = "SCT-SIGN-001"
    case packageInvalid = "SCT-PACKAGE-001"
    case packageFileHashMismatch = "SCT-PACKAGE-002"
    case chipUnconfigured = "SCT-CHIP-001"
    case chipUnsupported = "SCT-CHIP-002"
    case nfcUnavailable = "SCT-NFC-001"
    case persistenceFailure = "SCT-STORAGE-001"
    case conflictDetected = "SCT-CONFLICT-001"
}

struct SCTrackerFailure: LocalizedError {
    let code: ErrorCode
    let detail: String

    var errorDescription: String? { "\(code.rawValue): \(detail)" }
}
