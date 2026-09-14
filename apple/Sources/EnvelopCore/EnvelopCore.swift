import Foundation

/// Frozen wire contract v1. Single source of truth for all Envelop apps.
/// Nordic UART over BLE. ASCII + LF. 95 chars + LF max. 20B chunks.
public enum EnvelopWire {
    public static let serviceUUID = "6E400001-B5A3-F393-E0A9-E50E24DCCA9E"
    public static let rxCharacteristicUUID = "6E400002-B5A3-F393-E0A9-E50E24DCCA9E" // central -> Tomato, write without response
    public static let txCharacteristicUUID = "6E400003-B5A3-F393-E0A9-E50E24DCCA9E" // Tomato -> central, notify
    public static let acceptedNames = ["Envelop", "Tomato"] // prefer Envelop, accept Tomato (current radio)
    public static let maxChars = 95
    public static let maxWireBytes = 96 // 95 + LF
    public static let maxChunk = 20
    public static let lf: UInt8 = 10
    public static let cr: UInt8 = 13
}

/// Link states mirror the Tomato OS labels. Connected != Ready.
/// Ready requires TX notifications subscribed. Queued != delivered.
public enum EnvelopLinkState: Equatable {
    case idle
    case bluetoothOff
    case scanning
    case connected(subscribed: Bool)
    case fault(String)

    public var isReady: Bool {
        if case .connected(let sub) = self { return sub }
        return false
    }

    public var pill: String {
        switch self {
        case .idle: return "Idle"
        case .bluetoothOff: return "Bluetooth off"
        case .scanning: return "Scanning"
        case .connected(let sub): return sub ? "Ready" : "Connected"
        case .fault(let m): return m.isEmpty ? "Fault" : m
        }
    }
}

public struct EnvelopMessage: Identifiable, Equatable {
    public let id = UUID()
    public let text: String
    public let isMe: Bool
    public let date: Date
    /// Room sender tag (nil = direct 1:1 bubble, no tag shown).
    public let sender: String?
    public init(text: String, isMe: Bool, date: Date = Date(), sender: String? = nil) {
        self.text = text; self.isMe = isMe; self.date = date; self.sender = sender
    }
    public static func == (lhs: EnvelopMessage, rhs: EnvelopMessage) -> Bool {
        lhs.id == rhs.id
    }
}

/// Byte filter for display. Printable 32...126 pass, LF is the delimiter,
/// CR is ignored, everything else is dropped (v1: no UTF-8 on the wire).
public func envelopDisplayable(_ byte: UInt8) -> UInt8? {
    if byte == EnvelopWire.lf { return byte }
    if byte == EnvelopWire.cr { return nil }
    if byte >= 32 && byte <= 126 { return byte }
    return nil
}

/// Encode user text to wire bytes: keep first 95 printable ASCII, append LF.
/// Returns nil for empty input. Never emits CR. Strips non-ASCII (no emoji on wire).
public func envelopEncode(_ text: String) -> Data? {
    var bytes = [UInt8]()
    bytes.reserveCapacity(EnvelopWire.maxWireBytes)
    for scalar in text.unicodeScalars {
        if bytes.count >= EnvelopWire.maxChars { break }
        let v = scalar.value
        if v >= 32 && v <= 126 { bytes.append(UInt8(v)) }
    }
    guard !bytes.isEmpty else { return nil }
    bytes.append(EnvelopWire.lf)
    return Data(bytes)
}

/// Split wire data into <=20B BLE writes.
public func envelopChunks(_ data: Data) -> [Data] {
    guard !data.isEmpty else { return [] }
    var out = [Data]()
    var i = data.startIndex
    while i < data.endIndex {
        let j = data.index(i, offsetBy: EnvelopWire.maxChunk, limitedBy: data.endIndex) ?? data.endIndex
        out.append(data[i..<j])
        i = j
    }
    return out
}

/// Reassembles fragmented notifies/writes into LF-terminated lines.
/// Splits can land anywhere, including across LF boundaries.
public final class EnvelopLineAssembler {
    private var pending = [UInt8]()
    private let maxLine = EnvelopWire.maxChars
    public init() {}
    /// Feed raw bytes, returns complete lines (without LF).
    public func feed(_ data: Data) -> [String] {
        var lines = [String]()
        for b in data {
            guard let f = envelopDisplayable(b) else { continue }
            if f == EnvelopWire.lf {
                lines.append(String(bytes: pending, encoding: .ascii) ?? "")
                pending.removeAll(keepingCapacity: true)
            } else {
                if pending.count < maxLine { pending.append(f) }
                // else: drop overflow bytes until LF (matches FPGA 95-cap)
            }
        }
        return lines
    }
    public func reset() { pending.removeAll(keepingCapacity: true) }
}
