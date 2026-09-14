import Testing
@testable import EnvelopCore
import Foundation

@Suite("wire contract v1")
struct EnvelopCoreTests {
    @Test("encode appends LF and caps at 95")
    func encodeCaps() {
        #expect(envelopEncode("") == nil)
        #expect(envelopEncode("hi") == Data([0x68, 0x69, 0x0A]))
        let long = String(repeating: "a", count: 200)
        let d = envelopEncode(long)!
        #expect(d.count == 96)
        #expect(d.last == 10)
    }

    @Test("encode strips non-ascii, never emits CR")
    func encodeStrips() {
        let d = envelopEncode("héllo\r\n")!
        #expect(!d.contains(0x0D))
        #expect(String(bytes: d.dropLast(), encoding: .ascii) == "hllo")
    }

    @Test("chunks split at 20")
    func chunks() {
        let d = Data(repeating: 0x61, count: 45)
        let c = envelopChunks(d)
        #expect(c.count == 3)
        #expect(c.map(\.count) == [20, 20, 5])
    }

    @Test("assembler reassembles split LF, ignores CR, filters controls")
    func assembler() {
        let a = EnvelopLineAssembler()
        #expect(a.feed(Data("hel".utf8)).isEmpty)
        #expect(a.feed(Data("lo\r\nwor".utf8)) == ["hello"])
        #expect(a.feed(Data([0x01, 0x02]).advanced(by: 0)).isEmpty)
        #expect(a.feed(Data("ld\n".utf8)) == ["world"])
    }

    @Test("assembler caps line at 95 then waits for LF")
    func assemblerCap() {
        let a = EnvelopLineAssembler()
        let big = Data(repeating: 0x62, count: 120) + Data([0x0A])
        let lines = a.feed(big)
        #expect(lines.count == 1)
        #expect(lines[0].count == 95)
    }
}
