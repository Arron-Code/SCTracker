import Foundation

struct EventDraft {
    let id: UUID
    let entityType: EntityType
    let entityID: UUID
    let eventType: String
    let recordedAt: Date
    let actorID: UUID
    let deviceID: UUID
    let gps: GPSQuality?
    let mediaIDs: [UUID]
    let payload: CanonicalValue
}

enum EventLedger {
    static func append(
        draft: EventDraft,
        to events: [LedgerEvent],
        signer: EventSigner?
    ) throws -> LedgerEvent {
        let draft = normalized(draft)
        if let gps = draft.gps {
            guard gps.latitude.isFinite, (-90...90).contains(gps.latitude),
                  gps.longitude.isFinite, (-180...180).contains(gps.longitude),
                  gps.horizontalAccuracyMeters.isFinite, gps.horizontalAccuracyMeters > 0,
                  gps.altitudeMeters?.isFinite ?? true,
                  gps.verticalAccuracyMeters?.isFinite ?? true else {
                throw SCTrackerFailure(code: .invalidInput, detail: "GPS quality fields are invalid")
            }
        }
        let entityEvents = events
            .filter { $0.entityType == draft.entityType && $0.entityID == draft.entityID }
            .sorted { $0.sequence < $1.sequence }
        try verify(entityEvents, signer: nil)

        if let existing = events.first(where: { $0.id == draft.id }) {
            guard existing.entityType == draft.entityType,
                  existing.entityID == draft.entityID,
                  existing.eventType == draft.eventType,
                  existing.recordedAt == draft.recordedAt,
                  existing.actorID == draft.actorID,
                  existing.deviceID == draft.deviceID,
                  existing.gps == draft.gps,
                  existing.mediaIDs == draft.mediaIDs,
                  existing.payload == draft.payload else {
                throw SCTrackerFailure(
                    code: .duplicateEvent,
                    detail: "Event identifier was replayed with different content"
                )
            }
            return existing
        }

        let sequence = (entityEvents.last?.sequence ?? 0) + 1
        let previousHash = entityEvents.last?.eventHash
        let payloadHash = CanonicalJSON.sha256(CanonicalJSON.data(draft.payload))
        let eventHash = CanonicalJSON.sha256(CanonicalJSON.data(hashMaterial(
            draft: draft,
            sequence: sequence,
            previousHash: previousHash,
            payloadHash: payloadHash
        )))
        let signature = try signer?.sign(Data(eventHash.utf8))

        return LedgerEvent(
            id: draft.id,
            entityType: draft.entityType,
            entityID: draft.entityID,
            eventType: draft.eventType,
            sequence: sequence,
            recordedAt: draft.recordedAt,
            actorID: draft.actorID,
            deviceID: draft.deviceID,
            gps: draft.gps,
            mediaIDs: draft.mediaIDs,
            previousHash: previousHash,
            payload: draft.payload,
            payloadHash: payloadHash,
            eventHash: eventHash,
            signature: signature
        )
    }

    static func verify(_ events: [LedgerEvent], signer: EventSigner?) throws {
        let grouped = Dictionary(grouping: events) { "\($0.entityType.rawValue):\($0.entityID.uuidString)" }
        for group in grouped.values {
            let ordered = group.sorted { $0.sequence < $1.sequence }
            var prior: LedgerEvent?
            var seen = Set<UUID>()

            for event in ordered {
                guard seen.insert(event.id).inserted else {
                    throw SCTrackerFailure(code: .duplicateEvent, detail: event.id.uuidString)
                }
                guard event.sequence == (prior?.sequence ?? 0) + 1,
                      event.previousHash == prior?.eventHash else {
                    throw SCTrackerFailure(code: .chainMismatch, detail: event.id.uuidString)
                }

                let payloadHash = CanonicalJSON.sha256(CanonicalJSON.data(event.payload))
                guard payloadHash == event.payloadHash else {
                    throw SCTrackerFailure(code: .payloadHashMismatch, detail: event.id.uuidString)
                }

                let draft = EventDraft(
                    id: event.id,
                    entityType: event.entityType,
                    entityID: event.entityID,
                    eventType: event.eventType,
                    recordedAt: event.recordedAt,
                    actorID: event.actorID,
                    deviceID: event.deviceID,
                    gps: event.gps,
                    mediaIDs: event.mediaIDs,
                    payload: event.payload
                )
                let expected = CanonicalJSON.sha256(CanonicalJSON.data(hashMaterial(
                    draft: draft,
                    sequence: event.sequence,
                    previousHash: event.previousHash,
                    payloadHash: event.payloadHash
                )))
                guard expected == event.eventHash else {
                    throw SCTrackerFailure(code: .eventHashMismatch, detail: event.id.uuidString)
                }

                if let signer {
                    guard let signature = event.signature,
                          signer.verify(Data(event.eventHash.utf8), envelope: signature) else {
                        throw SCTrackerFailure(code: .signatureInvalid, detail: event.id.uuidString)
                    }
                }
                prior = event
            }
        }
    }

    static func hashMaterial(
        draft: EventDraft,
        sequence: Int,
        previousHash: String?,
        payloadHash: String
    ) -> CanonicalValue {
        .object([
            "actorId": .string(draft.actorID.uuidString.lowercased()),
            "deviceId": .string(draft.deviceID.uuidString.lowercased()),
            "entityId": .string(draft.entityID.uuidString.lowercased()),
            "entityType": .string(draft.entityType.rawValue),
            "eventId": .string(draft.id.uuidString.lowercased()),
            "eventType": .string(draft.eventType),
            "gps": gpsValue(draft.gps),
            "mediaIds": .array(draft.mediaIDs.map { .string($0.uuidString.lowercased()) }),
            "payloadHash": .string(payloadHash),
            "prevHash": previousHash.map(CanonicalValue.string) ?? .null,
            "recordedAt": .string(ISO8601.milliseconds.string(from: draft.recordedAt)),
            "sequence": .integer(Int64(sequence))
        ])
    }

    private static func normalized(_ draft: EventDraft) -> EventDraft {
        EventDraft(
            id: draft.id,
            entityType: draft.entityType,
            entityID: draft.entityID,
            eventType: draft.eventType,
            recordedAt: draft.recordedAt.millisecondsPrecision,
            actorID: draft.actorID,
            deviceID: draft.deviceID,
            gps: draft.gps.map {
                GPSQuality(
                    latitude: $0.latitude,
                    longitude: $0.longitude,
                    horizontalAccuracyMeters: $0.horizontalAccuracyMeters,
                    altitudeMeters: $0.altitudeMeters,
                    verticalAccuracyMeters: $0.verticalAccuracyMeters,
                    capturedAt: $0.capturedAt.millisecondsPrecision,
                    source: $0.source
                )
            },
            mediaIDs: draft.mediaIDs,
            payload: draft.payload
        )
    }

    private static func gpsValue(_ gps: GPSQuality?) -> CanonicalValue {
        guard let gps else { return .null }
        var fields: [String: CanonicalValue] = [
            "capturedAt": .string(ISO8601.milliseconds.string(from: gps.capturedAt)),
            "horizontalAccuracyMeters": .decimal(canonicalDecimal(gps.horizontalAccuracyMeters)),
            "latitude": .decimal(canonicalDecimal(gps.latitude)),
            "longitude": .decimal(canonicalDecimal(gps.longitude)),
            "source": .string(gps.source)
        ]
        fields["altitudeMeters"] = gps.altitudeMeters.map {
            .decimal(canonicalDecimal($0))
        } ?? .null
        fields["verticalAccuracyMeters"] = gps.verticalAccuracyMeters.map {
            .decimal(canonicalDecimal($0))
        } ?? .null
        return .object(fields)
    }

    private static func canonicalDecimal(_ value: Double) -> String {
        var rendered = String(format: "%.8f", locale: Locale(identifier: "en_US_POSIX"), value)
        while rendered.last == "0" { rendered.removeLast() }
        if rendered.last == "." { rendered.removeLast() }
        return rendered == "-0" ? "0" : rendered
    }
}

extension ISO8601DateFormatter {
    static let milliseconds: ISO8601DateFormatter = {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        formatter.timeZone = TimeZone(secondsFromGMT: 0)
        return formatter
    }()
}

private extension Date {
    var millisecondsPrecision: Date {
        Date(timeIntervalSince1970: (timeIntervalSince1970 * 1_000).rounded(.down) / 1_000)
    }
}
