import CryptoKit
import Foundation
import Security

protocol EventSigner {
    var keyID: String { get }
    var isDevelopmentFallback: Bool { get }
    func sign(_ data: Data) throws -> SignatureEnvelope
    func verify(_ data: Data, envelope: SignatureEnvelope) -> Bool
}

enum SignerFactory {
    static func make() throws -> any EventSigner {
#if targetEnvironment(simulator)
        return SimulatorSoftwareSigner()
#else
        guard SecureEnclave.isAvailable else {
            throw SCTrackerFailure(
                code: .signatureInvalid,
                detail: "Secure Enclave is unavailable; software fallback is restricted to the simulator"
            )
        }
        return try SecureEnclaveSigner()
#endif
    }
}

final class SecureEnclaveSigner: EventSigner {
    private let privateKey: SecureEnclave.P256.Signing.PrivateKey
    let keyID: String
    let isDevelopmentFallback = false

    init() throws {
        let account = "sctracker.secure-enclave.signing-key"
        if let stored = try KeychainBlob.read(account: account) {
            privateKey = try SecureEnclave.P256.Signing.PrivateKey(dataRepresentation: stored)
        } else {
            let key = try SecureEnclave.P256.Signing.PrivateKey()
            try KeychainBlob.write(key.dataRepresentation, account: account)
            privateKey = key
        }
        keyID = CanonicalJSON.sha256(privateKey.publicKey.rawRepresentation).prefix(24).description
    }

    func sign(_ data: Data) throws -> SignatureEnvelope {
        let signature = try privateKey.signature(for: data)
        return SignatureEnvelope(
            algorithm: "P256-SHA256",
            keyID: keyID,
            publicKeyBase64: privateKey.publicKey.rawRepresentation.base64EncodedString(),
            signatureBase64: signature.derRepresentation.base64EncodedString(),
            developmentFallback: false
        )
    }

    func verify(_ data: Data, envelope: SignatureEnvelope) -> Bool {
        SignatureVerifier.verify(data, envelope: envelope)
    }
}

final class SimulatorSoftwareSigner: EventSigner {
    private let privateKey = P256.Signing.PrivateKey()
    let isDevelopmentFallback = true
    lazy var keyID = CanonicalJSON.sha256(privateKey.publicKey.rawRepresentation).prefix(24).description

    func sign(_ data: Data) throws -> SignatureEnvelope {
        let signature = try privateKey.signature(for: data)
        return SignatureEnvelope(
            algorithm: "P256-SHA256",
            keyID: keyID,
            publicKeyBase64: privateKey.publicKey.rawRepresentation.base64EncodedString(),
            signatureBase64: signature.derRepresentation.base64EncodedString(),
            developmentFallback: true
        )
    }

    func verify(_ data: Data, envelope: SignatureEnvelope) -> Bool {
        SignatureVerifier.verify(data, envelope: envelope)
    }
}

enum SignatureVerifier {
    static func verify(_ data: Data, envelope: SignatureEnvelope) -> Bool {
        guard envelope.algorithm == "P256-SHA256",
              let publicKeyData = Data(base64Encoded: envelope.publicKeyBase64),
              let signatureData = Data(base64Encoded: envelope.signatureBase64),
              envelope.keyID == CanonicalJSON.sha256(publicKeyData).prefix(24).description,
              let publicKey = try? P256.Signing.PublicKey(rawRepresentation: publicKeyData),
              let signature = try? P256.Signing.ECDSASignature(derRepresentation: signatureData) else {
            return false
        }
        return publicKey.isValidSignature(signature, for: data)
    }
}

private enum KeychainBlob {
    static let service = "org.sctracker.native"

    static func read(account: String) throws -> Data? {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne
        ]
        var result: CFTypeRef?
        let status = SecItemCopyMatching(query as CFDictionary, &result)
        if status == errSecItemNotFound { return nil }
        guard status == errSecSuccess, let data = result as? Data else {
            throw SCTrackerFailure(code: .signatureInvalid, detail: "Unable to read signing-key handle")
        }
        return data
    }

    static func write(_ data: Data, account: String) throws {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
            kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly,
            kSecValueData as String: data
        ]
        let status = SecItemAdd(query as CFDictionary, nil)
        guard status == errSecSuccess else {
            throw SCTrackerFailure(code: .signatureInvalid, detail: "Unable to persist signing-key handle")
        }
    }
}
