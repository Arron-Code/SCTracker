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
