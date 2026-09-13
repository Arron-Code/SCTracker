import Combine
import Foundation

protocol SnapshotRepository {
    func load() throws -> AppSnapshot?
    func save(_ snapshot: AppSnapshot) throws
}

struct FileSnapshotRepository: SnapshotRepository {
    let fileURL: URL

    init(fileManager: FileManager = .default) throws {
        let directory = try fileManager.url(
            for: .applicationSupportDirectory,
            in: .userDomainMask,
            appropriateFor: nil,
            create: true
        ).appendingPathComponent("SCTrackerNative", isDirectory: true)
        try fileManager.createDirectory(at: directory, withIntermediateDirectories: true)
        fileURL = directory.appendingPathComponent("offline-snapshot.json")
    }

    func load() throws -> AppSnapshot? {
        guard FileManager.default.fileExists(atPath: fileURL.path) else { return nil }
        do {
            return try JSONDecoder.protocolDecoder.decode(AppSnapshot.self, from: Data(contentsOf: fileURL))
        } catch {
            throw SCTrackerFailure(code: .persistenceFailure, detail: "Offline snapshot cannot be decoded")
        }
    }

    func save(_ snapshot: AppSnapshot) throws {
        do {
            let data = try JSONEncoder.protocolEncoder.encode(snapshot)
            try data.write(to: fileURL, options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
        } catch {
            throw SCTrackerFailure(code: .persistenceFailure, detail: "Offline snapshot cannot be saved")
        }
    }
}

extension JSONEncoder {
    static var protocolEncoder: JSONEncoder {
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .custom { date, encoder in
            var container = encoder.singleValueContainer()
            try container.encode(ISO8601.milliseconds.string(from: date))
        }
        encoder.outputFormatting = [.sortedKeys]
        return encoder
    }
}

extension JSONDecoder {
    static var protocolDecoder: JSONDecoder {
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .custom { decoder in
            let container = try decoder.singleValueContainer()
            let value = try container.decode(String.self)
            guard let date = ISO8601.milliseconds.date(from: value)
                    ?? ISO8601DateFormatter().date(from: value) else {
                throw DecodingError.dataCorruptedError(
                    in: container,
                    debugDescription: "Date is not RFC 3339"
                )
            }
            return date
        }
        return decoder
    }
}

@MainActor
final class AppModel: ObservableObject {
    @Published private(set) var snapshot: AppSnapshot
    @Published var lastError: SCTrackerFailure?
    @Published var lastPackage: TransferPackage?
    @Published var language: AppLanguage {
        didSet { UserDefaults.standard.set(language.rawValue, forKey: "app.language") }
    }

    let actorID: UUID
    let deviceID: UUID
    let signer: any EventSigner
    let chipProfile = ChipProfile.disabled
    private let repository: any SnapshotRepository

    static func live() -> AppModel {
        do {
            let repository = try FileSnapshotRepository()
            let signer = try SignerFactory.make()
            return try AppModel(repository: repository, signer: signer)
        } catch {
            preconditionFailure("SCTracker initialization failed: \(error.localizedDescription)")
        }
    }

    init(repository: any SnapshotRepository, signer: any EventSigner) throws {
        self.repository = repository
        self.signer = signer
        if let stored = try repository.load(),
           let actor = stored.actors.first,
           let device = stored.devices.first {
            snapshot = stored
            actorID = actor.id
            deviceID = device.id
        } else {
            let actor = Actor(
                id: UUID(),
                displayName: "Field operator",
                roles: [.fieldOperator, .custodian],
                trustState: .unverified
            )
            let receiver = Actor(
                id: UUID(),
                displayName: "Receiving partner",
                roles: [.receiver],
                trustState: .unverified
            )
            let device = Device(
                id: UUID(),
                displayName: "This iPhone",
                publicKeyBase64: nil,
                trustState: .locallyTrusted
            )
            snapshot = AppSnapshot(
                actors: [actor, receiver],
                devices: [device],
                batches: [],
                sacks: [],
                seals: [],
                events: [],
                media: [],
                transfers: [],
                conflicts: []
            )
            actorID = actor.id
            deviceID = device.id
            try repository.save(snapshot)
        }
        let storedLanguage = UserDefaults.standard.string(forKey: "app.language")
        language = AppLanguage(rawValue: storedLanguage ?? "") ?? .german
    }

    func createGenesis(reference: String, sackCount: Int, origin: String) {
        perform {
            let trimmed = reference.trimmingCharacters(in: .whitespacesAndNewlines)
            guard !trimmed.isEmpty, (1...100).contains(sackCount) else {
                throw SCTrackerFailure(
                    code: .invalidInput,
                    detail: "Reference is required and sack count must be between 1 and 100"
                )
            }

            let batchID = UUID()
            let sacks = (1...sackCount).map {
                Sack(
                    id: UUID(),
                    batchID: batchID,
                    ordinal: $0,
                    reference: "\(trimmed)-S\(String(format: "%03d", $0))",
                    weightKg: nil
                )
            }
            let draft = EventDraft(
                id: UUID(),
                entityType: .batch,
                entityID: batchID,
                eventType: "BATCH_GENESIS",
                recordedAt: Date(),
                actorID: actorID,
                deviceID: deviceID,
                gps: nil,
                mediaIDs: [],
                payload: .object([
                    "origin": .string(origin),
                    "reference": .string(trimmed),
                    "sackCount": .integer(Int64(sackCount)),
                    "sacks": .array(sacks.map {
                        .object([
                            "id": .string($0.id.uuidString.lowercased()),
                            "ordinal": .integer(Int64($0.ordinal)),
                            "reference": .string($0.reference)
                        ])
                    })
                ])
            )
            let event = try EventLedger.append(draft: draft, to: snapshot.events, signer: signer)
            var updated = snapshot
            updated.batches.append(Batch(
                id: batchID,
                reference: trimmed,
                product: "Coffee",
                origin: origin,
                state: .unissued,
                sackIDs: sacks.map(\.id),
                activeSealID: nil,
                quarantined: false,
                lastSequence: event.sequence
            ))
            updated.sacks.append(contentsOf: sacks)
            updated.events.append(event)
            try persist(updated)
        }
    }

    func apply(_ action: BatchAction, to batchID: UUID) {
        perform {
            guard let index = snapshot.batches.firstIndex(where: { $0.id == batchID }) else {
                throw SCTrackerFailure(code: .invalidInput, detail: "Batch was not found")
            }
            let batch = snapshot.batches[index]
            guard !batch.quarantined else {
                throw SCTrackerFailure(code: .conflictDetected, detail: "Resolve quarantine before continuing")
            }
            let nextState = try BatchStateMachine.nextState(from: batch.state, action: action)
            let newSeal: Seal?
            if action == .seal {
                let sealID = UUID()
                newSeal = Seal(
                    id: sealID,
                    batchID: batch.id,
                    printedCode: "SEAL-\(sealID.uuidString.prefix(8))",
                    chipUID: nil,
                    trustState: .unverified
                )
            } else {
                newSeal = nil
            }
            var payload: [String: CanonicalValue] = [
                "fromState": .string(batch.state.rawValue),
                "toState": .string(nextState.rawValue)
            ]
            if let newSeal {
                payload["sealId"] = .string(newSeal.id.uuidString.lowercased())
                payload["printedCode"] = .string(newSeal.printedCode)
            }
            let draft = EventDraft(
                id: UUID(),
                entityType: .batch,
                entityID: batch.id,
                eventType: action.rawValue,
                recordedAt: Date(),
                actorID: actorID,
                deviceID: deviceID,
                gps: nil,
                mediaIDs: [],
                payload: .object(payload)
            )
            let event = try EventLedger.append(draft: draft, to: snapshot.events, signer: signer)
            var updated = snapshot
            updated.batches[index].state = nextState
            updated.batches[index].lastSequence = event.sequence
            if let newSeal {
                updated.seals.append(newSeal)
                updated.batches[index].activeSealID = newSeal.id
            }
            updated.events.append(event)
            try persist(updated)
        }
    }

    func offerTransfer(batchID: UUID, to receiverID: UUID) {
        perform {
            guard snapshot.batches.contains(where: { $0.id == batchID }) else {
                throw SCTrackerFailure(code: .invalidInput, detail: "Batch was not found")
            }
            let transferID = UUID()
            let offeredAt = Date()
            let draft = EventDraft(
                id: UUID(),
                entityType: .transfer,
                entityID: transferID,
                eventType: TransferAction.offer.rawValue,
                recordedAt: offeredAt,
                actorID: actorID,
                deviceID: deviceID,
                gps: nil,
                mediaIDs: [],
                payload: .object([
                    "batchId": .string(batchID.uuidString.lowercased()),
                    "fromActorId": .string(actorID.uuidString.lowercased()),
                    "toActorId": .string(receiverID.uuidString.lowercased())
                ])
            )
            let event = try EventLedger.append(draft: draft, to: snapshot.events, signer: signer)
            var updated = snapshot
            updated.events.append(event)
            updated.transfers.append(Transfer(
                id: transferID,
                batchID: batchID,
                fromActorID: actorID,
                toActorID: receiverID,
                offerEventHash: event.eventHash,
                status: .pending,
                offeredAt: offeredAt,
                resolvedAt: nil
            ))
            try persist(updated)
        }
    }

    func resolveTransfer(_ transferID: UUID, action: TransferAction, offerHash: String) {
        perform {
            guard action == .accept || action == .reject,
                  let index = snapshot.transfers.firstIndex(where: { $0.id == transferID }) else {
                throw SCTrackerFailure(code: .invalidInput, detail: "Transfer resolution is invalid")
            }
            let transfer = snapshot.transfers[index]
            guard transfer.status == .pending, transfer.offerEventHash == offerHash else {
                throw SCTrackerFailure(
                    code: .invalidInput,
                    detail: "Resolution must reference the exact pending offer hash"
                )
            }
            let draft = EventDraft(
                id: UUID(),
                entityType: .transfer,
                entityID: transferID,
                eventType: action.rawValue,
                recordedAt: Date(),
                actorID: actorID,
                deviceID: deviceID,
                gps: nil,
                mediaIDs: [],
                payload: .object(["offerEventHash": .string(offerHash)])
            )
            let event = try EventLedger.append(draft: draft, to: snapshot.events, signer: signer)
            var updated = snapshot
            updated.events.append(event)
            updated.transfers[index].status = action == .accept ? .accepted : .rejected
            updated.transfers[index].resolvedAt = event.recordedAt
            try persist(updated)
        }
    }

    func exportPackage() {
        perform {
            lastPackage = try PackageService.makePackage(
                events: snapshot.events,
                sourceDeviceID: deviceID,
                packageID: UUID(),
                createdAt: Date(),
                signer: signer
            )
        }
    }

    func importPackage(_ package: TransferPackage) {
        perform {
            try PackageService.verifyBeforeImport(package)
            var updated = snapshot

            let orderedIncoming = package.events.sorted {
                if $0.entityType != $1.entityType {
                    return $0.entityType.rawValue < $1.entityType.rawValue
                }
                if $0.entityID != $1.entityID {
                    return $0.entityID.uuidString < $1.entityID.uuidString
                }
                return $0.sequence < $1.sequence
            }
            for incoming in orderedIncoming {
                if let existing = updated.events.first(where: { $0.id == incoming.id }) {
                    guard existing.eventHash == incoming.eventHash else {
                        throw SCTrackerFailure(code: .duplicateEvent, detail: incoming.id.uuidString)
                    }
                    continue
                }

                let head = updated.events
                    .filter { $0.entityType == incoming.entityType && $0.entityID == incoming.entityID }
                    .max(by: { $0.sequence < $1.sequence })
                guard incoming.previousHash == head?.eventHash else {
                    updated.conflicts.append(ConflictRecord(
                        id: UUID(),
                        entityID: incoming.entityID,
                        localHeadHash: head?.eventHash ?? "",
                        incomingPreviousHash: incoming.previousHash,
                        reasonCode: .conflictDetected,
                        detectedAt: Date(),
                        resolved: false
                    ))
                    if let batchIndex = updated.batches.firstIndex(where: { $0.id == incoming.entityID }) {
                        updated.batches[batchIndex].quarantined = true
                    }
                    continue
                }
                updated.events.append(incoming)
            }
            try EventLedger.verify(updated.events, signer: nil)
            let projections = try ProjectionReducer.rebuild(events: updated.events)
            updated.batches = projections.batches
            updated.sacks = projections.sacks
            updated.seals = projections.seals
            updated.transfers = projections.transfers
            for index in updated.batches.indices {
                updated.batches[index].quarantined = updated.conflicts.contains {
                    $0.entityID == updated.batches[index].id && !$0.resolved
                }
            }
            try persist(updated)
            lastPackage = package
        }
    }

    private enum ProjectionReducer {
        struct Projections {
            var batches: [Batch] = []
            var sacks: [Sack] = []
            var seals: [Seal] = []
            var transfers: [Transfer] = []
        }

        static func rebuild(events: [LedgerEvent]) throws -> Projections {
            var result = Projections()
            let ordered = events.sorted {
                if $0.entityType != $1.entityType {
                    return $0.entityType.rawValue < $1.entityType.rawValue
                }
                if $0.entityID != $1.entityID {
                    return $0.entityID.uuidString < $1.entityID.uuidString
                }
                if $0.sequence != $1.sequence {
                    return $0.sequence < $1.sequence
                }
                return $0.id.uuidString < $1.id.uuidString
            }

            for event in ordered {
                switch event.entityType {
                case .batch:
                    try reduceBatch(event, into: &result)
                case .transfer:
                    try reduceTransfer(event, into: &result)
                default:
                    continue
                }
            }
            return result
        }

        private static func reduceBatch(_ event: LedgerEvent, into result: inout Projections) throws {
            if event.eventType == "BATCH_GENESIS" {
                guard result.batches.contains(where: { $0.id == event.entityID }) == false,
                      let payload = event.payload.object,
                      let reference = payload["reference"]?.string,
                      let origin = payload["origin"]?.string,
                      let sackValues = payload["sacks"]?.array,
                      (1...100).contains(sackValues.count) else {
                    throw SCTrackerFailure(code: .packageInvalid, detail: "Batch genesis payload is invalid")
                }
                let sacks: [Sack] = try sackValues.map { value in
                    guard let item = value.object,
                          let id = item["id"]?.uuid,
                          let ordinal = item["ordinal"]?.integer,
                          let sackReference = item["reference"]?.string else {
                        throw SCTrackerFailure(code: .packageInvalid, detail: "Sack payload is invalid")
                    }
                    return Sack(
                        id: id,
                        batchID: event.entityID,
                        ordinal: Int(ordinal),
                        reference: sackReference,
                        weightKg: nil
                    )
                }
                result.sacks.append(contentsOf: sacks)
                result.batches.append(Batch(
                    id: event.entityID,
                    reference: reference,
                    product: "Coffee",
                    origin: origin,
                    state: .unissued,
                    sackIDs: sacks.map(\.id),
                    activeSealID: nil,
                    quarantined: false,
                    lastSequence: event.sequence
                ))
                return
            }

            guard let index = result.batches.firstIndex(where: { $0.id == event.entityID }),
                  let action = BatchAction(rawValue: event.eventType),
                  let payload = event.payload.object,
                  payload["fromState"]?.string == result.batches[index].state.rawValue else {
                throw SCTrackerFailure(code: .packageInvalid, detail: "Batch event projection is invalid")
            }
            let next = try BatchStateMachine.nextState(from: result.batches[index].state, action: action)
            guard payload["toState"]?.string == next.rawValue else {
                throw SCTrackerFailure(code: .packageInvalid, detail: "Batch state payload does not match transition")
            }
            result.batches[index].state = next
            result.batches[index].lastSequence = event.sequence
            if action == .seal {
                guard let sealID = payload["sealId"]?.uuid,
                      let printedCode = payload["printedCode"]?.string else {
                    throw SCTrackerFailure(code: .packageInvalid, detail: "Seal payload is invalid")
                }
                result.seals.append(Seal(
                    id: sealID,
                    batchID: event.entityID,
                    printedCode: printedCode,
                    chipUID: nil,
                    trustState: .unverified
                ))
                result.batches[index].activeSealID = sealID
            }
        }

        private static func reduceTransfer(_ event: LedgerEvent, into result: inout Projections) throws {
            guard let payload = event.payload.object,
                  let action = TransferAction(rawValue: event.eventType) else {
                throw SCTrackerFailure(code: .packageInvalid, detail: "Transfer payload is invalid")
            }
            switch action {
            case .offer:
                guard let batchID = payload["batchId"]?.uuid,
                      let fromActorID = payload["fromActorId"]?.uuid,
                      let toActorID = payload["toActorId"]?.uuid,
                      result.transfers.contains(where: { $0.id == event.entityID }) == false else {
                    throw SCTrackerFailure(code: .packageInvalid, detail: "Transfer offer is invalid")
                }
                result.transfers.append(Transfer(
                    id: event.entityID,
                    batchID: batchID,
                    fromActorID: fromActorID,
                    toActorID: toActorID,
                    offerEventHash: event.eventHash,
                    status: .pending,
                    offeredAt: event.recordedAt,
                    resolvedAt: nil
                ))
            case .accept, .reject:
                guard let index = result.transfers.firstIndex(where: { $0.id == event.entityID }),
                      result.transfers[index].status == .pending,
                      payload["offerEventHash"]?.string == result.transfers[index].offerEventHash else {
                    throw SCTrackerFailure(code: .packageInvalid, detail: "Transfer response does not reference its pending offer")
                }
                result.transfers[index].status = action == .accept ? .accepted : .rejected
                result.transfers[index].resolvedAt = event.recordedAt
            }
        }
    }

    func resolveConflict(_ conflictID: UUID) {
        perform {
            guard let index = snapshot.conflicts.firstIndex(where: { $0.id == conflictID }) else {
                throw SCTrackerFailure(code: .invalidInput, detail: "Conflict was not found")
            }
            var updated = snapshot
            updated.conflicts[index].resolved = true
            if !updated.conflicts.contains(where: {
                $0.entityID == updated.conflicts[index].entityID && !$0.resolved
            }), let batchIndex = updated.batches.firstIndex(where: {
                $0.id == updated.conflicts[index].entityID
            }) {
                updated.batches[batchIndex].quarantined = false
            }
            try persist(updated)
        }
    }

    private extension CanonicalValue {
        var object: [String: CanonicalValue]? {
            guard case let .object(value) = self else { return nil }
            return value
        }

        var array: [CanonicalValue]? {
            guard case let .array(value) = self else { return nil }
            return value
        }

        var string: String? {
            guard case let .string(value) = self else { return nil }
            return value
        }

        var integer: Int64? {
            guard case let .integer(value) = self else { return nil }
            return value
        }

        var uuid: UUID? {
            string.flatMap(UUID.init(uuidString:))
        }
    }

    private func persist(_ updated: AppSnapshot) throws {
        try repository.save(updated)
        snapshot = updated
    }

    private func perform(_ operation: () throws -> Void) {
        do {
            try operation()
            lastError = nil
        } catch let failure as SCTrackerFailure {
            lastError = failure
        } catch {
            lastError = SCTrackerFailure(code: .invalidInput, detail: error.localizedDescription)
        }
    }
}
