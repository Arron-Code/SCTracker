import CryptoKit
import XCTest
@testable import SCTrackerNative

final class DomainTests: XCTestCase {
    private let entityID = UUID(uuidString: "11111111-1111-1111-1111-111111111111")!
    private let actorID = UUID(uuidString: "22222222-2222-2222-2222-222222222222")!
    private let deviceID = UUID(uuidString: "33333333-3333-3333-3333-333333333333")!
    private let timestamp = ISO8601.milliseconds.date(from: "2026-09-13T16:00:00.000Z")!

    func testEventChainAndTamperDetection() throws {
        let signer = TestSigner()
        let first = try EventLedger.append(draft: draft(id: UUID(), type: "BATCH_GENESIS"), to: [], signer: signer)
        let second = try EventLedger.append(draft: draft(id: UUID(), type: "ISSUE"), to: [first], signer: signer)

        XCTAssertEqual(first.sequence, 1)
        XCTAssertEqual(second.sequence, 2)
        XCTAssertEqual(second.previousHash, first.eventHash)
        XCTAssertNoThrow(try EventLedger.verify([first, second], signer: signer))

        let tampered = replacingPayload(second, with: .object(["state": .string("VOID")]))
        XCTAssertThrowsError(try EventLedger.verify([first, tampered], signer: signer)) {
            XCTAssertEqual(($0 as? SCTrackerFailure)?.code, .payloadHashMismatch)
        }
    }

    func testStateTransitionsAllowOnlyDefinedWorkflow() throws {
        XCTAssertEqual(try BatchStateMachine.nextState(from: .unissued, action: .issue), .issued)
        XCTAssertEqual(try BatchStateMachine.nextState(from: .issued, action: .seal), .sealed)
        XCTAssertEqual(try BatchStateMachine.nextState(from: .sealed, action: .dispatch), .inTransit)
        XCTAssertEqual(try BatchStateMachine.nextState(from: .inTransit, action: .open), .opened)
        XCTAssertThrowsError(try BatchStateMachine.nextState(from: .unissued, action: .dispatch))
        XCTAssertThrowsError(try BatchStateMachine.nextState(from: .opened, action: .seal))
    }

    func testReplayIsIdempotentButChangedReplayIsRejected() throws {
        let eventID = UUID()
        let signer = TestSigner()
        let originalDraft = draft(id: eventID, type: "BATCH_GENESIS")
        let event = try EventLedger.append(draft: originalDraft, to: [], signer: signer)
        let replay = try EventLedger.append(draft: originalDraft, to: [event], signer: signer)
        XCTAssertEqual(replay, event)

        let changed = EventDraft(
            id: eventID,
            entityType: .batch,
            entityID: entityID,
            eventType: "VOID",
            recordedAt: timestamp,
            actorID: actorID,
            deviceID: deviceID,
            gps: nil,
            mediaIDs: [],
            payload: .object(["state": .string("VOID")])
        )
        XCTAssertThrowsError(try EventLedger.append(draft: changed, to: [event], signer: signer)) {
            XCTAssertEqual(($0 as? SCTrackerFailure)?.code, .duplicateEvent)
        }
    }

    func testPackageManifestRequiresValidSignatureAndFileHash() throws {
        let signer = TestSigner()
        let event = try EventLedger.append(draft: draft(id: UUID(), type: "BATCH_GENESIS"), to: [], signer: signer)
        let package = try PackageService.makePackage(
            events: [event],
            sourceDeviceID: deviceID,
            packageID: UUID(uuidString: "44444444-4444-4444-4444-444444444444")!,
            createdAt: timestamp,
            signer: signer
        )
        XCTAssertNoThrow(try PackageService.verifyBeforeImport(package))
        let encoded = try JSONEncoder.protocolEncoder.encode(package)
        let decoded = try JSONDecoder.protocolDecoder.decode(TransferPackage.self, from: encoded)
        XCTAssertNoThrow(try PackageService.verifyBeforeImport(decoded))

        var fileTamper = package
        fileTamper.manifest.files[0].sha256 = String(repeating: "0", count: 64)
        XCTAssertThrowsError(try PackageService.verifyBeforeImport(fileTamper)) {
            XCTAssertEqual(($0 as? SCTrackerFailure)?.code, .packageFileHashMismatch)
        }

        var signatureTamper = package
        signatureTamper.manifest.signature?.signatureBase64 = Data("invalid".utf8).base64EncodedString()
        XCTAssertThrowsError(try PackageService.verifyBeforeImport(signatureTamper)) {
            XCTAssertEqual(($0 as? SCTrackerFailure)?.code, .signatureInvalid)
        }

        let unsigned = replacingSignature(event, with: nil)
        XCTAssertThrowsError(try PackageService.makePackage(
            events: [unsigned],
            sourceDeviceID: deviceID,
            packageID: UUID(),
            createdAt: timestamp,
            signer: signer
        )) {
            XCTAssertEqual(($0 as? SCTrackerFailure)?.code, .signatureInvalid)
        }
    }

    func testCanonicalVector() {
        let value: CanonicalValue = .object([
            "batchId": .string("11111111-1111-1111-1111-111111111111"),
            "count": .integer(3),
            "flags": .array([.bool(true), .bool(false)]),
            "origin": .string("Ethiopia")
        ])
        let data = CanonicalJSON.data(value)
        XCTAssertEqual(
            String(decoding: data, as: UTF8.self),
            #"{"batchId":"11111111-1111-1111-1111-111111111111","count":3,"flags":[true,false],"origin":"Ethiopia"}"#
        )
        XCTAssertEqual(
            CanonicalJSON.sha256(data),
            "8b492336e38d9fc5ddcb1b91b87a4d9b8089f1b33b602fe50916e68ac968441c"
        )
    }

    @MainActor
    func testVerifiedImportReplaysWorkflowProjection() throws {
        let sourceRepository = MemoryRepository()
        let source = try AppModel(repository: sourceRepository, signer: TestSigner())
        source.createGenesis(reference: "IMP-2026-0142", sackCount: 3, origin: "Ethiopia")
        source.apply(.issue, to: try XCTUnwrap(source.snapshot.batches.first?.id))
        source.exportPackage()

        let destination = try AppModel(repository: MemoryRepository(), signer: TestSigner())
        destination.importPackage(try XCTUnwrap(source.lastPackage))

        XCTAssertNil(destination.lastError)
        XCTAssertEqual(destination.snapshot.batches.count, 1)
        XCTAssertEqual(destination.snapshot.batches[0].state, .issued)
        XCTAssertEqual(destination.snapshot.sacks.count, 3)
    }

    @MainActor
    func testTransferResolutionRequiresExactOfferHash() throws {
        let model = try AppModel(repository: MemoryRepository(), signer: TestSigner())
        model.createGenesis(reference: "IMP-2026-0142", sackCount: 1, origin: "Ethiopia")
        let batchID = try XCTUnwrap(model.snapshot.batches.first?.id)
        let receiverID = try XCTUnwrap(model.snapshot.actors.first(where: { $0.id != model.actorID })?.id)
        model.offerTransfer(batchID: batchID, to: receiverID)
        let transfer = try XCTUnwrap(model.snapshot.transfers.first)

        model.resolveTransfer(transfer.id, action: .accept, offerHash: "wrong")
        XCTAssertEqual(model.lastError?.code, .invalidInput)
        XCTAssertEqual(model.snapshot.transfers[0].status, .pending)

        model.resolveTransfer(transfer.id, action: .accept, offerHash: transfer.offerEventHash)
        XCTAssertNil(model.lastError)
        XCTAssertEqual(model.snapshot.transfers[0].status, .accepted)
    }

    private func draft(id: UUID, type: String) -> EventDraft {
        EventDraft(
            id: id,
            entityType: .batch,
            entityID: entityID,
            eventType: type,
            recordedAt: timestamp,
            actorID: actorID,
            deviceID: deviceID,
            gps: nil,
            mediaIDs: [],
            payload: .object(["state": .string(type)])
        )
    }

    private final class MemoryRepository: SnapshotRepository {
        private var snapshot: AppSnapshot?

        func load() throws -> AppSnapshot? { snapshot }
        func save(_ snapshot: AppSnapshot) throws { self.snapshot = snapshot }
    }

    private func replacingPayload(_ event: LedgerEvent, with payload: CanonicalValue) -> LedgerEvent {
        LedgerEvent(
            id: event.id,
            entityType: event.entityType,
            entityID: event.entityID,
            eventType: event.eventType,
            sequence: event.sequence,
            recordedAt: event.recordedAt,
            actorID: event.actorID,
            deviceID: event.deviceID,
            gps: event.gps,
            mediaIDs: event.mediaIDs,
            previousHash: event.previousHash,
            payload: payload,
            payloadHash: event.payloadHash,
            eventHash: event.eventHash,
            signature: event.signature
        )
    }

    private func replacingSignature(
        _ event: LedgerEvent,
        with signature: SignatureEnvelope?
    ) -> LedgerEvent {
        LedgerEvent(
            id: event.id,
            entityType: event.entityType,
            entityID: event.entityID,
            eventType: event.eventType,
            sequence: event.sequence,
            recordedAt: event.recordedAt,
            actorID: event.actorID,
            deviceID: event.deviceID,
            gps: event.gps,
            mediaIDs: event.mediaIDs,
            previousHash: event.previousHash,
            payload: event.payload,
            payloadHash: event.payloadHash,
            eventHash: event.eventHash,
            signature: signature
        )
    }
}

private final class TestSigner: EventSigner {
    private let key = P256.Signing.PrivateKey()
    let isDevelopmentFallback = true
    lazy var keyID = CanonicalJSON.sha256(key.publicKey.rawRepresentation).prefix(24).description

    func sign(_ data: Data) throws -> SignatureEnvelope {
        SignatureEnvelope(
            algorithm: "P256-SHA256",
            keyID: keyID,
            publicKeyBase64: key.publicKey.rawRepresentation.base64EncodedString(),
            signatureBase64: try key.signature(for: data).derRepresentation.base64EncodedString(),
            developmentFallback: true
        )
    }

    func verify(_ data: Data, envelope: SignatureEnvelope) -> Bool {
        SignatureVerifier.verify(data, envelope: envelope)
    }
}
