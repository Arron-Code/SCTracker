import CoreNFC
import Foundation

struct APDUCommand: Hashable {
    let bytes: Data

    func makeAPDU() throws -> NFCISO7816APDU {
        guard let apdu = NFCISO7816APDU(data: bytes) else {
            throw SCTrackerFailure(code: .chipUnconfigured, detail: "Configured APDU is malformed")
        }
        return apdu
    }
}

struct ChipProfile {
    let enabled: Bool
    let manufacturer: String?
    let model: String?
    let documentationRevision: String?
    let keyProvisioningReference: String?
    let iPhoneCompatibilityEvidence: String?
    let select: APDUCommand?
    let authenticate: [APDUCommand]

    static let disabled = ChipProfile(
        enabled: false,
        manufacturer: nil,
        model: nil,
        documentationRevision: nil,
        keyProvisioningReference: nil,
        iPhoneCompatibilityEvidence: nil,
        select: nil,
        authenticate: []
    )

    var isConfigured: Bool {
        enabled
            && !(manufacturer?.isEmpty ?? true)
            && !(model?.isEmpty ?? true)
            && !(documentationRevision?.isEmpty ?? true)
            && !(keyProvisioningReference?.isEmpty ?? true)
            && !(iPhoneCompatibilityEvidence?.isEmpty ?? true)
            && select != nil
    }

    func requireConfigured() throws {
        guard isConfigured else {
            throw SCTrackerFailure(
                code: .chipUnconfigured,
                detail: "Chip operations are disabled until manufacturer, model, APDU documentation, key provisioning, and iPhone compatibility are configured"
            )
        }
    }
}

enum ChipOperation {
    case read(command: APDUCommand)
    case writeAndReadBack(write: APDUCommand, readBack: APDUCommand)
}

struct ChipOperationResult {
    let uidLookupValue: String
    let response: Data
    let readBack: Data?
}

protocol ISO7816ChipAdapter {
    func perform(profile: ChipProfile, operation: ChipOperation) async throws -> ChipOperationResult
}

final class CoreNFCISO7816Adapter: NSObject, ISO7816ChipAdapter, NFCTagReaderSessionDelegate {
    private var session: NFCTagReaderSession?
    private var profile: ChipProfile?
    private var operation: ChipOperation?
    private var continuation: CheckedContinuation<ChipOperationResult, Error>?

    func perform(profile: ChipProfile, operation: ChipOperation) async throws -> ChipOperationResult {
        try profile.requireConfigured()
        guard NFCTagReaderSession.readingAvailable else {
            throw SCTrackerFailure(code: .nfcUnavailable, detail: "Core NFC tag reading is unavailable")
        }
        guard continuation == nil else {
            throw SCTrackerFailure(code: .nfcUnavailable, detail: "Another NFC operation is active")
        }

        return try await withCheckedThrowingContinuation { continuation in
            self.profile = profile
            self.operation = operation
            self.continuation = continuation
            let session = NFCTagReaderSession(pollingOption: .iso14443, delegate: self)
            self.session = session
            session.alertMessage = "Hold the iPhone near the configured SCTracker seal."
            session.begin()
        }
    }

    func tagReaderSessionDidBecomeActive(_ session: NFCTagReaderSession) {}

    func tagReaderSession(_ session: NFCTagReaderSession, didInvalidateWithError error: Error) {
        guard let continuation else { return }
        self.continuation = nil
        continuation.resume(throwing: error)
        clear()
    }

    func tagReaderSession(_ session: NFCTagReaderSession, didDetect tags: [NFCTag]) {
        guard tags.count == 1 else {
            session.alertMessage = "More than one tag was detected. Present one seal."
            session.restartPolling()
            return
        }
        guard case let .iso7816(tag) = tags[0] else {
            finish(.failure(SCTrackerFailure(code: .chipUnsupported, detail: "Tag is not ISO 7816 compatible")))
            return
        }

        Task {
            do {
                try await session.connect(to: tags[0])
                let result = try await execute(on: tag)
                session.alertMessage = "Seal operation completed and verified."
                session.invalidate()
                finish(.success(result))
            } catch {
                session.invalidate(errorMessage: "Seal operation failed.")
                finish(.failure(error))
            }
        }
    }

    private func execute(on tag: NFCISO7816Tag) async throws -> ChipOperationResult {
        guard let profile, let select = profile.select, let operation else {
            throw SCTrackerFailure(code: .chipUnconfigured, detail: "No active chip profile")
        }
        try await send(select, to: tag)
        for command in profile.authenticate {
            try await send(command, to: tag)
        }

        let uid = tag.identifier.map { String(format: "%02x", $0) }.joined()
        switch operation {
        case let .read(command):
            return ChipOperationResult(
                uidLookupValue: uid,
                response: try await send(command, to: tag),
                readBack: nil
            )
        case let .writeAndReadBack(write, readBack):
            let writeResponse = try await send(write, to: tag)
            let readBackResponse = try await send(readBack, to: tag)
            return ChipOperationResult(
                uidLookupValue: uid,
                response: writeResponse,
                readBack: readBackResponse
            )
        }
    }

    private func send(_ command: APDUCommand, to tag: NFCISO7816Tag) async throws -> Data {
        let (data, sw1, sw2) = try await tag.sendCommand(apdu: command.makeAPDU())
        guard sw1 == 0x90, sw2 == 0x00 else {
            throw SCTrackerFailure(
                code: .chipUnsupported,
                detail: String(format: "Chip returned status %02X%02X", sw1, sw2)
            )
        }
        return data
    }

    private func finish(_ result: Result<ChipOperationResult, Error>) {
        guard let continuation else { return }
        self.continuation = nil
        continuation.resume(with: result)
        clear()
    }

    private func clear() {
        session = nil
        profile = nil
        operation = nil
    }
}
