import Foundation

/// Binary device protocol. Separate from the legacy LF-delimited radio prototype.
public enum DeviceFrameType: UInt8, CaseIterable {
    case hello = 1, helloAck, contactReset, contactUpsert, openChat, chatHistory
    case chatMessage, sendMessage, messageAck, status, ping, pong
    case computeJob = 32, computeResult = 33
}

public enum DeviceProtocolError: Error, Equatable {
    case oversizedPayload, invalidText, invalidIdentity
}

public struct DeviceFrame: Equatable {
    public static let maximumPayload = 512
    public let type: DeviceFrameType
    public let route: UInt16
    public let payload: Data
    public init(type: DeviceFrameType, route: UInt16 = 0, payload: Data = Data()) throws {
        guard payload.count <= Self.maximumPayload else { throw DeviceProtocolError.oversizedPayload }
        self.type = type; self.route = route; self.payload = payload
    }
    public var encoded: Data {
        var bytes: [UInt8] = [0x50, 0x47, 1, type.rawValue,
                              UInt8(route >> 8), UInt8(route & 255),
                              UInt8(payload.count >> 8), UInt8(payload.count & 255)]
        bytes.append(contentsOf: payload)
        let crc = Self.checksum(bytes)
        bytes += [UInt8(crc >> 8), UInt8(crc & 255)]
        return Data(bytes)
    }
    public static func checksum(_ bytes: [UInt8]) -> UInt16 {
        var crc: UInt16 = 0xffff
        for byte in bytes {
            crc ^= UInt16(byte) << 8
            for _ in 0..<8 { crc = (crc & 0x8000 != 0) ? (crc << 1) ^ 0x1021 : crc << 1 }
        }
        return crc
    }
    public static func text(_ text: String) throws -> Data {
        let bytes = Array(text.utf8)
        guard !bytes.isEmpty, bytes.count <= 256,
              bytes.allSatisfy({ (32...126).contains($0) }) else { throw DeviceProtocolError.invalidText }
        return Data(bytes)
    }
    public var verifiedDeviceID: String? {
        guard type == .helloAck, route == 0,
              String(data: payload, encoding: .ascii) == "ENVELOP/1\nDEVICE=TOMATO\nID=TOMATO-001" else { return nil }
        return "TOMATO-001"
    }
}

/// Bounded parser accepting arbitrary fragments, concatenated frames, and noise.
/// A CRC failure advances one byte so the next valid magic can be recovered.
public final class DeviceFrameParser {
    private var buffer: [UInt8] = []
    public init() {}
    public func reset() { buffer.removeAll(keepingCapacity: true) }
    public func feed(_ data: Data) -> [DeviceFrame] {
        var frames: [DeviceFrame] = []
        for byte in data {
            buffer.append(byte)
            while buffer.count >= 2 {
                guard buffer[0] == 0x50, buffer[1] == 0x47 else { buffer.removeFirst(); continue }
                guard buffer.count >= 8 else { break }
                let length = Int(buffer[6]) << 8 | Int(buffer[7])
                guard buffer[2] == 1, let type = DeviceFrameType(rawValue: buffer[3]),
                      length <= DeviceFrame.maximumPayload else { buffer.removeFirst(); continue }
                guard buffer.count >= length + 10 else { break }
                let expected = UInt16(buffer[length + 8]) << 8 | UInt16(buffer[length + 9])
                guard DeviceFrame.checksum(Array(buffer.prefix(length + 8))) == expected else {
                    buffer.removeFirst(); continue
                }
                let route = UInt16(buffer[4]) << 8 | UInt16(buffer[5])
                if let frame = try? DeviceFrame(type: type, route: route, payload: Data(buffer[8..<(8 + length)])) {
                    frames.append(frame)
                }
                buffer.removeFirst(length + 10)
            }
        }
        return frames
    }
}

public enum DeviceBridgeState: String, Equatable {
    case idle, scanning, bleConnected, gattReady, tomatoVerified, leaseAcquired, syncing, online, bridging
    case internetLost, leaseLost, disconnected
    public var isInternetReachable: Bool { self == .online || self == .bridging }
}

/// Client-side replay fence for durable compute_jobs.
public enum DurableComputeResolution: Equatable {
    case physical, virtualSafe, unknown
    public init(status: String) {
        switch status {
        case "completed": self = .physical
        case "cancelled", "failed": self = .virtualSafe
        default: self = .unknown
        }
    }
}

/// Routes belong to one physical connection. Never reuse a route inside that session.
public struct DeviceRoutes {
    public private(set) var conversations: [UInt16: UUID] = [:]
    private var next: UInt32 = 1
    public init() {}
    public mutating func route(for conversation: UUID) -> UInt16? {
        if let existing = conversations.first(where: { $0.value == conversation }) { return existing.key }
        guard next <= UInt16.max else { return nil }
        let route = UInt16(next); next += 1
        conversations[route] = conversation
        return route
    }
    public mutating func reset() { conversations.removeAll(); next = 1 }
}
