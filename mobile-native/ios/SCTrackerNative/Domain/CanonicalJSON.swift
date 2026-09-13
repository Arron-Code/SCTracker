import CryptoKit
import Foundation

indirect enum CanonicalValue: Codable, Hashable {
    case null
    case bool(Bool)
    case integer(Int64)
    case decimal(String)
    case string(String)
    case array([CanonicalValue])
    case object([String: CanonicalValue])

    private enum CodingKeys: String, CodingKey { case type, value }
    private enum Kind: String, Codable { case null, bool, integer, decimal, string, array, object }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        switch try container.decode(Kind.self, forKey: .type) {
        case .null: self = .null
        case .bool: self = .bool(try container.decode(Bool.self, forKey: .value))
        case .integer: self = .integer(try container.decode(Int64.self, forKey: .value))
        case .decimal:
            let value = try container.decode(String.self, forKey: .value)
            guard CanonicalJSON.isCanonicalDecimal(value) else {
                throw DecodingError.dataCorruptedError(
                    forKey: .value,
                    in: container,
                    debugDescription: "Decimal is not in canonical plain notation"
                )
            }
            self = .decimal(value)
        case .string: self = .string(try container.decode(String.self, forKey: .value))
        case .array: self = .array(try container.decode([CanonicalValue].self, forKey: .value))
        case .object: self = .object(try container.decode([String: CanonicalValue].self, forKey: .value))
        }
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        switch self {
        case .null:
            try container.encode(Kind.null, forKey: .type)
        case let .bool(value):
            try container.encode(Kind.bool, forKey: .type)
            try container.encode(value, forKey: .value)
        case let .integer(value):
            try container.encode(Kind.integer, forKey: .type)
            try container.encode(value, forKey: .value)
        case let .decimal(value):
            try container.encode(Kind.decimal, forKey: .type)
            try container.encode(value, forKey: .value)
        case let .string(value):
            try container.encode(Kind.string, forKey: .type)
            try container.encode(value, forKey: .value)
        case let .array(value):
            try container.encode(Kind.array, forKey: .type)
            try container.encode(value, forKey: .value)
        case let .object(value):
            try container.encode(Kind.object, forKey: .type)
            try container.encode(value, forKey: .value)
        }
    }
}

enum CanonicalJSON {
    static func data(_ value: CanonicalValue) -> Data {
        Data(render(value).utf8)
    }

    static func sha256(_ data: Data) -> String {
        SHA256.hash(data: data).map { String(format: "%02x", $0) }.joined()
    }

    static func render(_ value: CanonicalValue) -> String {
        switch value {
        case .null:
            return "null"
        case let .bool(value):
            return value ? "true" : "false"
        case let .integer(value):
            return String(value)
        case let .decimal(value):
            precondition(isCanonicalDecimal(value), "Decimal strings must use canonical plain notation")
            return value
        case let .string(value):
            return quote(value)
        case let .array(values):
            return "[" + values.map(render).joined(separator: ",") + "]"
        case let .object(values):
            return "{" + values.keys.sorted(by: utf8Less).map {
                quote($0) + ":" + render(values[$0]!)
            }.joined(separator: ",") + "}"
        }
    }

    struct WireEventEnvelopeV1: Codable, Equatable {
        var schema: Int64 = 1
        var eventId: String
        var eventType: String
        var aggregateId: String
        var sequence: Int64
        var prevHash: String
        var createdMonotonic: Int64
        var reportedUtc: String?
        var deviceId: String
        var actorId: String
        var payloadHash: String
        var keyId: String
        var signature: String?
    }

    struct WireEventV1: Equatable {
        var envelope: WireEventEnvelopeV1
        var payload: CanonicalValue
    }

    enum WireProtocolErrorV1: Error {
        case nonCanonicalEnvelope
        case missingSignature
        case eventIdCollision
    }

    enum EventWireCodecV1 {
        static let schema: Int64 = 1
        static let genesisHash = String(repeating: "0", count: 64)
        private static let hashPattern = try! NSRegularExpression(pattern: "^[0-9a-f]{64}$")
        private static let utcPattern = try! NSRegularExpression(
            pattern: #"^\d{4}-(0[1-9]|1[0-2])-([0-2]\d|3[01])T([01]\d|2[0-3]):[0-5]\d:[0-5]\d\.\d{3}Z$"#
        )

        static func payloadBytes(_ payload: CanonicalValue) -> Data {
            CanonicalJSON.data(payload)
        }

        static func signingBytes(_ envelope: WireEventEnvelopeV1) -> Data {
            CanonicalJSON.data(envelopeValue(envelope, includeSignature: false))
        }

        static func envelopeBytes(_ envelope: WireEventEnvelopeV1) throws -> Data {
            guard envelope.signature != nil else { throw WireProtocolErrorV1.missingSignature }
            return CanonicalJSON.data(envelopeValue(envelope, includeSignature: true))
        }

        static func decodeEnvelope(_ data: Data) throws -> WireEventEnvelopeV1 {
            guard let object = try JSONSerialization.jsonObject(with: data) as? [String: Any] else {
                throw WireProtocolErrorV1.nonCanonicalEnvelope
            }
            let required = Set([
                "schema", "eventId", "eventType", "aggregateId", "sequence", "prevHash",
                "createdMonotonic", "deviceId", "actorId", "payloadHash", "keyId", "signature"
            ])
            let allowed = required.union(["reportedUtc"])
            guard required.isSubset(of: object.keys), Set(object.keys).isSubset(of: allowed) else {
                throw WireProtocolErrorV1.nonCanonicalEnvelope
            }
            let decoded = try JSONDecoder().decode(WireEventEnvelopeV1.self, from: data)
            guard try envelopeBytes(decoded) == data else {
                throw WireProtocolErrorV1.nonCanonicalEnvelope
            }
            return decoded
        }

        static func eventHash(_ envelope: WireEventEnvelopeV1) -> String {
            CanonicalJSON.sha256(signingBytes(envelope))
        }

        static func validate(
            _ event: WireEventV1,
            verifier: (String, Data, Data) -> Bool
        ) -> Bool {
            let envelope = event.envelope
            guard envelope.schema == schema,
                  isWireValue(event.payload),
                  !envelope.eventId.isEmpty,
                  !envelope.eventType.isEmpty,
                  !envelope.aggregateId.isEmpty,
                  envelope.sequence >= 1,
                  envelope.createdMonotonic >= 0,
                  !envelope.deviceId.isEmpty,
                  !envelope.actorId.isEmpty,
                  !envelope.keyId.isEmpty,
                  matches(hashPattern, envelope.prevHash),
                  matches(hashPattern, envelope.payloadHash),
                  envelope.reportedUtc.map({ matches(utcPattern, $0) }) ?? true,
                  CanonicalJSON.sha256(payloadBytes(event.payload)) == envelope.payloadHash,
                  let signatureText = envelope.signature,
                  let signature = Data(base64Encoded: signatureText),
                  signature.base64EncodedString() == signatureText,
                  P256SignatureV1.isCanonicalLowS(signature) else {
                return false
            }
            return verifier(envelope.keyId, signingBytes(envelope), signature)
        }

        private static func isWireValue(_ value: CanonicalValue) -> Bool {
            switch value {
            case .decimal:
                return false
            case let .array(values):
                return values.allSatisfy(isWireValue)
            case let .object(values):
                return values.values.allSatisfy(isWireValue)
            case .null, .bool, .integer, .string:
                return true
            }
        }

        static func offerPayload(
            transferId: String,
            fromActorId: String,
            toActorId: String,
            sackIds: [String]
        ) -> CanonicalValue {
            precondition(!sackIds.isEmpty && Set(sackIds).count == sackIds.count)
            return .object([
                "fromActorId": .string(fromActorId),
                "sackIds": .array(sackIds.sorted(by: utf8Less).map(CanonicalValue.string)),
                "toActorId": .string(toActorId),
                "transferId": .string(transferId)
            ])
        }

        static func decisionPayload(
            transferId: String,
            decision: String,
            offerHash: String
        ) -> CanonicalValue {
            precondition(decision == "ACCEPT" || decision == "REJECT")
            precondition(matches(hashPattern, offerHash))
            return .object([
                "decision": .string(decision),
                "offerHash": .string(offerHash),
                "transferId": .string(transferId)
            ])
        }

        private static func envelopeValue(
            _ envelope: WireEventEnvelopeV1,
            includeSignature: Bool
        ) -> CanonicalValue {
            var fields: [String: CanonicalValue] = [
                "actorId": .string(envelope.actorId),
                "aggregateId": .string(envelope.aggregateId),
                "createdMonotonic": .integer(envelope.createdMonotonic),
                "deviceId": .string(envelope.deviceId),
                "eventId": .string(envelope.eventId),
                "eventType": .string(envelope.eventType),
                "keyId": .string(envelope.keyId),
                "payloadHash": .string(envelope.payloadHash),
                "prevHash": .string(envelope.prevHash),
                "schema": .integer(envelope.schema),
                "sequence": .integer(envelope.sequence)
            ]
            if let reportedUtc = envelope.reportedUtc {
                fields["reportedUtc"] = .string(reportedUtc)
            }
            if includeSignature, let signature = envelope.signature {
                fields["signature"] = .string(signature)
            }
            return .object(fields)
        }

        private static func matches(_ expression: NSRegularExpression, _ value: String) -> Bool {
            expression.firstMatch(
                in: value,
                range: NSRange(value.startIndex..., in: value)
            ) != nil
        }

        private static func utf8Less(_ left: String, _ right: String) -> Bool {
            left.utf8.lexicographicallyPrecedes(right.utf8)
        }
    }

    typealias WireEventEnvelopeV1 = CanonicalJSON.WireEventEnvelopeV1
    typealias WireEventV1 = CanonicalJSON.WireEventV1
    typealias WireProtocolErrorV1 = CanonicalJSON.WireProtocolErrorV1
    typealias EventWireCodecV1 = CanonicalJSON.EventWireCodecV1
    typealias WireReplayGuardV1 = CanonicalJSON.WireReplayGuardV1
    typealias P256SignatureV1 = CanonicalJSON.P256SignatureV1

    final class WireReplayGuardV1 {
        private var admitted: [String: Data] = [:]

        func admit(_ event: WireEventV1) throws -> Bool {
            let canonical = EventWireCodecV1.payloadBytes(event.payload)
                + (try EventWireCodecV1.envelopeBytes(event.envelope))
            if let existing = admitted[event.envelope.eventId] {
                guard existing == canonical else { throw WireProtocolErrorV1.eventIdCollision }
                return false
            }
            admitted[event.envelope.eventId] = canonical
            return true
        }
    }

    enum P256SignatureV1 {
        private static let order = data(
            "ffffffff00000000ffffffffffffffffbce6faada7179e84f3b9cac2fc632551"
        )
        private static let halfOrder = data(
            "7fffffff800000007fffffffffffffffde737d56d38bcf4279dce5617e3192a8"
        )

        static func canonicalP1363(derRepresentation: Data) throws -> Data {
            let raw = try P256.Signing.ECDSASignature(
                derRepresentation: derRepresentation
            ).rawRepresentation
            return normalizeLowS(raw)
        }

        static func normalizeLowS(_ signature: Data) -> Data {
            precondition(signature.count == 64)
            let r = signature.prefix(32)
            let s = Data(signature.suffix(32))
            if !halfOrder.lexicographicallyPrecedes(s) {
                return signature
            }
            return Data(r) + subtract(order, s)
        }

        static func isCanonicalLowS(_ signature: Data) -> Bool {
            guard signature.count == 64 else { return false }
            let r = Data(signature.prefix(32))
            let s = Data(signature.suffix(32))
            return r.contains(where: { $0 != 0 })
                && s.contains(where: { $0 != 0 })
                && r.lexicographicallyPrecedes(order)
                && !halfOrder.lexicographicallyPrecedes(s)
        }

        private static func subtract(_ left: Data, _ right: Data) -> Data {
            var result = [UInt8](repeating: 0, count: left.count)
            let a = [UInt8](left)
            let b = [UInt8](right)
            var borrow = 0
            for index in stride(from: a.count - 1, through: 0, by: -1) {
                var value = Int(a[index]) - Int(b[index]) - borrow
                if value < 0 {
                    value += 256
                    borrow = 1
                } else {
                    borrow = 0
                }
                result[index] = UInt8(value)
            }
            precondition(borrow == 0)
            return Data(result)
        }

        private static func data(_ hex: String) -> Data {
            Data(stride(from: 0, to: hex.count, by: 2).map { offset in
                let start = hex.index(hex.startIndex, offsetBy: offset)
                let end = hex.index(start, offsetBy: 2)
                return UInt8(hex[start..<end], radix: 16)!
            })
        }
    }

    private static func utf8Less(_ left: String, _ right: String) -> Bool {
        left.utf8.lexicographicallyPrecedes(right.utf8)
    }

    fileprivate static func isCanonicalDecimal(_ value: String) -> Bool {
        value.range(of: #"^-?(0|[1-9][0-9]*)(\.[0-9]+)?$"#, options: .regularExpression) != nil
            && !value.hasSuffix(".0")
            && value != "-0"
    }

    private static func quote(_ value: String) -> String {
        var output = "\""
        for scalar in value.unicodeScalars {
            switch scalar.value {
            case 0x08: output += "\\b"
            case 0x09: output += "\\t"
            case 0x0A: output += "\\n"
            case 0x0C: output += "\\f"
            case 0x0D: output += "\\r"
            case 0x22: output += "\\\""
            case 0x5C: output += "\\\\"
            case 0x00...0x1F:
                output += String(format: "\\u%04x", scalar.value)
            default:
                output.unicodeScalars.append(scalar)
            }
        }
        return output + "\""
    }
}
