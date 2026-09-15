import Foundation

/// PostgREST void RPCs may return an empty HTTP body rather than JSON null.
/// Required values still fail decoding, so empty profile/message responses
/// cannot accidentally be treated as successful writes.
public func decodeCloudResponse<T: Decodable>(_ type: T.Type, from data: Data) throws -> T {
    try JSONDecoder().decode(type, from: data.isEmpty ? Data("null".utf8) : data)
}
