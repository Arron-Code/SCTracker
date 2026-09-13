import Foundation

struct ManifestFile: Codable, Hashable {
    var path: String
    var byteCount: Int
    var sha256: String
}

struct ExportManifest: Codable, Hashable {
    var schemaVersion: String
    var packageID: UUID
    var createdAt: Date
    var sourceDeviceID: UUID
    var eventCount: Int
    var chainRootHash: String
    var files: [ManifestFile]
    var signature: SignatureEnvelope?
}

struct TransferPackage: Codable {
    var manifest: ExportManifest
    var events: [LedgerEvent]
}

enum PackageService {
    static func makePackage(
        events: [LedgerEvent],
        sourceDeviceID: UUID,
        packageID: UUID,
        createdAt: Date,
        signer: EventSigner
    ) throws -> TransferPackage {
        try EventLedger.verify(events, signer: nil)
        try verifyEventSignatures(events)
        let eventData = canonicalEvents(events)
        let rootHash = chainRoot(events)
        var manifest = ExportManifest(
            schemaVersion: "sctracker.package/1",
            packageID: packageID,
            createdAt: createdAt,
            sourceDeviceID: sourceDeviceID,
            eventCount: events.count,
            chainRootHash: rootHash,
            files: [
                ManifestFile(
                    path: "events.canonical.json",
                    byteCount: eventData.count,
                    sha256: CanonicalJSON.sha256(eventData)
                )
            ],
            signature: nil
        )
        manifest.signature = try signer.sign(CanonicalJSON.data(manifestValue(manifest)))
        return TransferPackage(manifest: manifest, events: events)
    }

    static func verifyBeforeImport(_ package: TransferPackage) throws {
        guard package.manifest.schemaVersion == "sctracker.package/1",
              package.manifest.eventCount == package.events.count,
              package.manifest.files.count == 1,
              package.manifest.files[0].path == "events.canonical.json",
              let signature = package.manifest.signature else {
            throw SCTrackerFailure(code: .packageInvalid, detail: "Manifest structure is invalid")
        }
#if !targetEnvironment(simulator)
        guard !signature.developmentFallback else {
            throw SCTrackerFailure(code: .signatureInvalid, detail: "Development signatures are not accepted on devices")
        }
#endif

        let eventData = canonicalEvents(package.events)
        let file = package.manifest.files[0]
        guard file.byteCount == eventData.count,
              file.sha256 == CanonicalJSON.sha256(eventData) else {
            throw SCTrackerFailure(code: .packageFileHashMismatch, detail: file.path)
        }
        guard package.manifest.chainRootHash == chainRoot(package.events) else {
            throw SCTrackerFailure(code: .chainMismatch, detail: "Package chain root does not match")
        }
        guard SignatureVerifier.verify(
            CanonicalJSON.data(manifestValue(package.manifest)),
            envelope: signature
        ) else {
            throw SCTrackerFailure(code: .signatureInvalid, detail: "Manifest signature is invalid")
        }
        try EventLedger.verify(package.events, signer: nil)
        try verifyEventSignatures(package.events)
    }

    private static func verifyEventSignatures(_ events: [LedgerEvent]) throws {
        for event in events {
            guard let signature = event.signature,
                  SignatureVerifier.verify(Data(event.eventHash.utf8), envelope: signature) else {
                throw SCTrackerFailure(
                    code: .signatureInvalid,
                    detail: "Event \(event.id.uuidString) has no valid signature"
                )
            }
#if !targetEnvironment(simulator)
            guard !signature.developmentFallback else {
                throw SCTrackerFailure(code: .signatureInvalid, detail: "Development event signature is not accepted on devices")
            }
#endif
        }
    }

    static func canonicalEvents(_ events: [LedgerEvent]) -> Data {
        let values = events.sorted {
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
        }.map(eventValue)
        return CanonicalJSON.data(.array(values))
    }

    private static func chainRoot(_ events: [LedgerEvent]) -> String {
        let heads = Dictionary(grouping: events) {
            "\($0.entityType.rawValue):\($0.entityID.uuidString)"
        }.compactMap { _, group in
            group.max(by: { $0.sequence < $1.sequence })?.eventHash
        }.sorted()
        return CanonicalJSON.sha256(CanonicalJSON.data(.array(heads.map(CanonicalValue.string))))
    }

    private static func manifestValue(_ manifest: ExportManifest) -> CanonicalValue {
        return .object([
            "chainRootHash": .string(manifest.chainRootHash),
            "createdAt": .string(ISO8601.milliseconds.string(from: manifest.createdAt)),
            "eventCount": .integer(Int64(manifest.eventCount)),
            "files": .array(manifest.files.sorted(by: { $0.path < $1.path }).map {
                .object([
                    "byteCount": .integer(Int64($0.byteCount)),
                    "path": .string($0.path),
                    "sha256": .string($0.sha256)
                ])
            }),
            "packageId": .string(manifest.packageID.uuidString.lowercased()),
            "schemaVersion": .string(manifest.schemaVersion),
            "sourceDeviceId": .string(manifest.sourceDeviceID.uuidString.lowercased())
        ])
    }

    private static func eventValue(_ event: LedgerEvent) -> CanonicalValue {
        let signature: CanonicalValue
        if let envelope = event.signature {
            signature = .object([
                "algorithm": .string(envelope.algorithm),
                "developmentFallback": .bool(envelope.developmentFallback),
                "keyId": .string(envelope.keyID),
                "publicKeyBase64": .string(envelope.publicKeyBase64),
                "signatureBase64": .string(envelope.signatureBase64)
            ])
        } else {
            signature = .null
        }
        return .object([
            "actorId": .string(event.actorID.uuidString.lowercased()),
            "deviceId": .string(event.deviceID.uuidString.lowercased()),
            "entityId": .string(event.entityID.uuidString.lowercased()),
            "entityType": .string(event.entityType.rawValue),
            "eventHash": .string(event.eventHash),
            "eventId": .string(event.id.uuidString.lowercased()),
            "eventType": .string(event.eventType),
            "payload": event.payload,
            "payloadHash": .string(event.payloadHash),
            "prevHash": event.previousHash.map(CanonicalValue.string) ?? .null,
            "recordedAt": .string(ISO8601.milliseconds.string(from: event.recordedAt)),
            "sequence": .integer(Int64(event.sequence)),
            "signature": signature
        ])
    }
}
