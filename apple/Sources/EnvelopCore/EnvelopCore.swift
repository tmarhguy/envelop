import Foundation

/// Nordic UART BLE adapter constants for the binary device protocol.
public enum EnvelopWire {
    public static let serviceUUID = "6E400001-B5A3-F393-E0A9-E50E24DCCA9E"
    public static let rxCharacteristicUUID = "6E400002-B5A3-F393-E0A9-E50E24DCCA9E" // central -> Tomato, write without response
    public static let txCharacteristicUUID = "6E400003-B5A3-F393-E0A9-E50E24DCCA9E" // Tomato -> central, notify
    public static let acceptedNames = ["Envelop", "Tomato"] // prefer Envelop, accept Tomato (current radio)
    public static let maxChunk = 20
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

/// Split binary frames into BLE writes of at most 20 bytes.
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
