import XCTest
@testable import EnvelopCore

final class CloudResponseTests: XCTestCase {
    func testVoidRPCSupportsEmptyAndNull() throws {
        XCTAssertNil(try decodeCloudResponse(String?.self, from: Data()))
        XCTAssertNil(try decodeCloudResponse(String?.self, from: Data("null".utf8)))
    }
    func testRequiredResponseStillRejectsEmptyOrMalformedBody() {
        XCTAssertThrowsError(try decodeCloudResponse(String.self, from: Data()))
        XCTAssertThrowsError(try decodeCloudResponse(String?.self, from: Data("broken".utf8)))
    }
}
