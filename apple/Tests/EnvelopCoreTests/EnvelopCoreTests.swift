import Testing
@testable import EnvelopCore
import Foundation

@Suite("BLE adapter")
struct EnvelopCoreTests {
    @Test("Nordic UART UUIDs remain stable")
    func uuids() {
        #expect(EnvelopWire.serviceUUID == "6E400001-B5A3-F393-E0A9-E50E24DCCA9E")
        #expect(EnvelopWire.rxCharacteristicUUID == "6E400002-B5A3-F393-E0A9-E50E24DCCA9E")
        #expect(EnvelopWire.txCharacteristicUUID == "6E400003-B5A3-F393-E0A9-E50E24DCCA9E")
    }

    @Test("binary writes split at 20 bytes")
    func chunks() {
        let d = Data(repeating: 0x61, count: 45)
        let c = envelopChunks(d)
        #expect(c.count == 3)
        #expect(c.map(\.count) == [20, 20, 5])
        #expect(c.flatMap(Array.init) == Array(d))
        #expect(envelopChunks(Data()).isEmpty)
    }
}
