import XCTest
@testable import EnvelopCore

final class DeviceProtocolTests: XCTestCase {
    func testEveryFragmentBoundary() throws {
        let frame = try DeviceFrame(type: .chatMessage, route: 513, payload: DeviceFrame.text(String(repeating: "x", count: 256)))
        for split in 0...frame.encoded.count {
            let parser = DeviceFrameParser()
            XCTAssertEqual(parser.feed(frame.encoded.prefix(split)) + parser.feed(frame.encoded.dropFirst(split)), [frame])
        }
        let parser = DeviceFrameParser()
        XCTAssertEqual(envelopChunks(frame.encoded).flatMap { parser.feed($0) }, [frame])
        XCTAssertTrue(envelopChunks(frame.encoded).allSatisfy { $0.count <= 20 })
    }
    func testNoiseCRCAndInvalidHeaderRecovery() throws {
        let frame = try DeviceFrame(type: .ping)
        var corrupt = frame.encoded; corrupt[9] ^= 1
        let invalid = Data([0x50,0x47,1,1,0,0,255,255])
        XCTAssertEqual(DeviceFrameParser().feed(Data([0,1,0x50]) + corrupt + invalid + frame.encoded + frame.encoded), [frame,frame])
    }
    func testIdentityAndTextValidation() throws {
        XCTAssertThrowsError(try DeviceFrame.text("hello 🌍"))
        XCTAssertThrowsError(try DeviceFrame.text("hello\nworld"))
        XCTAssertThrowsError(try DeviceFrame.text(String(repeating: "a", count: 257)))
        XCTAssertThrowsError(try DeviceFrame(type: .hello, payload: Data(repeating: 0, count: 513)))
        let identity = Data("ENVELOP/1\nDEVICE=TOMATO\nID=TOMATO-001".utf8)
        XCTAssertEqual(try DeviceFrame(type: .helloAck, payload: identity).verifiedDeviceID, "TOMATO-001")
        XCTAssertNil(try DeviceFrame(type: .helloAck, payload: Data("Tomato".utf8)).verifiedDeviceID)
        XCTAssertNil(try DeviceFrame(type: .hello, payload: identity).verifiedDeviceID)
    }
    func testRoutesAndOfflineStates() {
        var routes = DeviceRoutes(); let a = UUID(); let b = UUID()
        XCTAssertEqual(routes.route(for: a), 1); XCTAssertEqual(routes.route(for: a), 1)
        XCTAssertEqual(routes.route(for: b), 2)
        routes.reset(); XCTAssertTrue(routes.conversations.isEmpty)
        XCTAssertEqual(routes.route(for: b), 1)
        XCTAssertFalse(DeviceBridgeState.tomatoVerified.isInternetReachable)
        XCTAssertFalse(DeviceBridgeState.internetLost.isInternetReachable)
        XCTAssertTrue(DeviceBridgeState.online.isInternetReachable)
    }
    func testPublishedVectors() throws {
        struct Vector: Decodable { let type: UInt8; let route: UInt16; let payload_hex: String; let frame_hex: String }
        let source = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
            .appendingPathComponent("protocol/test-vectors/frames.json")
        func data(_ hex: String) -> Data {
            let chars = Array(hex)
            return Data(stride(from: 0, to: chars.count, by: 2).map { UInt8(String(chars[$0...($0+1)]), radix: 16)! })
        }
        for vector in try JSONDecoder().decode([Vector].self, from: Data(contentsOf: source)) {
            let frame = try DeviceFrame(type: DeviceFrameType(rawValue: vector.type)!, route: vector.route, payload: data(vector.payload_hex))
            XCTAssertEqual(frame.encoded, data(vector.frame_hex))
            XCTAssertEqual(DeviceFrameParser().feed(frame.encoded), [frame])
        }
    }
}
