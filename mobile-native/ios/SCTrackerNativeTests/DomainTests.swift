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

    func testWireProtocolGenesisAndUnicodeVectors() throws {
        let envelope = wireEnvelope(signature: String(repeating: "A", count: 86) + "==")
        let payload: CanonicalValue = .object(["state": .string("ISSUED")])
        XCTAssertEqual(
            String(decoding: EventWireCodecV1.payloadBytes(payload), as: UTF8.self),
            #"{"state":"ISSUED"}"#
        )
        XCTAssertEqual(
            CanonicalJSON.sha256(EventWireCodecV1.payloadBytes(payload)),
            "28ec7bccebeef254cf6d88315dd1999f7306d86721e07e021f9cf55a8793771e"
        )
        XCTAssertEqual(
            String(decoding: EventWireCodecV1.signingBytes(envelope), as: UTF8.self),
            #"{"actorId":"ACT-1","aggregateId":"SACK-1","createdMonotonic":123456789,"deviceId":"DEV-1","eventId":"EV-1","eventType":"SACK_ISSUED","keyId":"KEY-1","payloadHash":"28ec7bccebeef254cf6d88315dd1999f7306d86721e07e021f9cf55a8793771e","prevHash":"0000000000000000000000000000000000000000000000000000000000000000","reportedUtc":"2026-09-13T16:00:00.000Z","schema":1,"sequence":1}"#
        )
        XCTAssertEqual(
            EventWireCodecV1.eventHash(envelope),
            "0a48be7c8f9aab2f6c2a3066d45c4371d2eec94fd307c59ecd60a2243d348773"
        )
        let envelopeData = try EventWireCodecV1.envelopeBytes(envelope)
        XCTAssertEqual(
            CanonicalJSON.sha256(envelopeData),
            "8a9703d8cd5eac9ae00cf1e8943ad206c6d4ab5f5d4a6e081c796b8a2b61348e"
        )
        XCTAssertEqual(try EventWireCodecV1.decodeEnvelope(envelopeData), envelope)
        XCTAssertThrowsError(try EventWireCodecV1.decodeEnvelope(Data(" \(String(decoding: envelopeData, as: UTF8.self))".utf8)))

        let unicode: CanonicalValue = .object([
            "\u{10000}": .string("supplementary"),
            "\u{E000}": .string("private"),
            "control": .string("A\nB\t\"\\")
        ])
        let unicodeBytes = CanonicalJSON.data(unicode)
        XCTAssertEqual(
            String(decoding: unicodeBytes, as: UTF8.self),
            "{\"control\":\"A\\nB\\t\\\"\\\\\",\"\u{E000}\":\"private\",\"\u{10000}\":\"supplementary\"}"
        )
        XCTAssertEqual(
            CanonicalJSON.sha256(unicodeBytes),
            "2e28d5f76e9c174abc2af77b68ff4b9160fb36c83f7c0b88bfbb5286f70b5f3b"
        )
    }

    func testWireTransferOfferAndAcceptVectors() {
        let offer = EventWireCodecV1.offerPayload(
            transferId: "TR-1",
            fromActorId: "ACT-1",
            toActorId: "ACT-2",
            sackIds: ["SACK-2", "SACK-1"]
        )
        XCTAssertEqual(
            String(decoding: CanonicalJSON.data(offer), as: UTF8.self),
            #"{"fromActorId":"ACT-1","sackIds":["SACK-1","SACK-2"],"toActorId":"ACT-2","transferId":"TR-1"}"#
        )
        let offerHash = CanonicalJSON.sha256(CanonicalJSON.data(offer))
        XCTAssertEqual(offerHash, "7c21ee171ccb1acde534350f0f4905ab17abd0860aae3012bc681e572f75a590")
        let accept = EventWireCodecV1.decisionPayload(
            transferId: "TR-1",
            decision: "ACCEPT",
            offerHash: offerHash
        )
        XCTAssertEqual(
            String(decoding: CanonicalJSON.data(accept), as: UTF8.self),
            #"{"decision":"ACCEPT","offerHash":"7c21ee171ccb1acde534350f0f4905ab17abd0860aae3012bc681e572f75a590","transferId":"TR-1"}"#
        )
        XCTAssertEqual(
            CanonicalJSON.sha256(CanonicalJSON.data(accept)),
            "88cf4afa9062dffed0bc350acbb039e7c735c9569f6a622f7715beba516d64f5"
        )
    }

    func testWireSignatureTamperAndReplayRules() throws {
        let signer = TestSigner()
        let unsigned = wireEnvelope(signature: nil)
        let signingBytes = EventWireCodecV1.signingBytes(unsigned)
        let internalSignature = try signer.sign(signingBytes)
        let der = try XCTUnwrap(Data(base64Encoded: internalSignature.signatureBase64))
        let p1363 = try P256SignatureV1.canonicalP1363(derRepresentation: der)
        let signed = wireEnvelope(signature: p1363.base64EncodedString())
        let event = WireEventV1(
            envelope: signed,
            payload: .object(["state": .string("ISSUED")])
        )
        let publicKeyData = try XCTUnwrap(Data(base64Encoded: internalSignature.publicKeyBase64))
        let publicKey = try P256.Signing.PublicKey(rawRepresentation: publicKeyData)
        let verifier: (String, Data, Data) -> Bool = { keyId, bytes, signatureData in
            guard keyId == "KEY-1",
                  let signature = try? P256.Signing.ECDSASignature(
                    rawRepresentation: signatureData
                  ) else {
                return false
            }
            return publicKey.isValidSignature(signature, for: bytes)
        }

        XCTAssertTrue(EventWireCodecV1.validate(event, verifier: verifier))
        var tampered = event
        tampered.payload = .object(["state": .string("VOID")])
        XCTAssertFalse(EventWireCodecV1.validate(tampered, verifier: verifier))

        let replayGuard = WireReplayGuardV1()
        XCTAssertTrue(try replayGuard.admit(event))
        XCTAssertFalse(try replayGuard.admit(event))
        var collision = event
        collision.envelope.actorId = "ACT-OTHER"
        XCTAssertThrowsError(try replayGuard.admit(collision))
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

    private func wireEnvelope(signature: String?) -> WireEventEnvelopeV1 {
        WireEventEnvelopeV1(
            eventId: "EV-1",
            eventType: "SACK_ISSUED",
            aggregateId: "SACK-1",
            sequence: 1,
            prevHash: EventWireCodecV1.genesisHash,
            createdMonotonic: 123_456_789,
            reportedUtc: "2026-09-13T16:00:00.000Z",
            deviceId: "DEV-1",
            actorId: "ACT-1",
            payloadHash: "28ec7bccebeef254cf6d88315dd1999f7306d86721e07e021f9cf55a8793771e",
            keyId: "KEY-1",
            signature: signature
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
