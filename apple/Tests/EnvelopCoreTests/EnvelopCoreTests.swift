import XCTest
@testable import EnvelopCore
import Foundation

final class EnvelopCoreTests: XCTestCase {
    func testNordicUARTUUIDsRemainStable() {
        XCTAssertEqual(EnvelopWire.serviceUUID, "6E400001-B5A3-F393-E0A9-E50E24DCCA9E")
        XCTAssertEqual(EnvelopWire.rxCharacteristicUUID, "6E400002-B5A3-F393-E0A9-E50E24DCCA9E")
        XCTAssertEqual(EnvelopWire.txCharacteristicUUID, "6E400003-B5A3-F393-E0A9-E50E24DCCA9E")
    }

    func testBinaryWritesSplitAt20Bytes() {
        let d = Data(repeating: 0x61, count: 45)
        let c = envelopChunks(d)
        XCTAssertEqual(c.count, 3)
        XCTAssertEqual(c.map(\.count), [20, 20, 5])
        XCTAssertEqual(c.flatMap(Array.init), Array(d))
        XCTAssertTrue(envelopChunks(Data()).isEmpty)
    }
}
