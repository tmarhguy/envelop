import Foundation
import Security
import EnvelopCore
import EnvelopBLE

struct CloudProfile: Codable, Identifiable, Hashable {
    let id: UUID
    let handle: String
    let display_name: String
    let avatar_id: Int
    let is_device: Bool
    let verified: Bool
}
struct CloudMessage: Codable, Identifiable {
    let id: UUID
    let sender_id: UUID
    let body: String
    let created_at: String
}
private struct CloudCredentials: Codable {
    let access_token: String
    let refresh_token: String
    let expires_in: Int
    let user: User
    struct User: Codable { let id: UUID }
}
private struct APIError: Decodable { let message: String?; let msg: String?; let error_description: String? }
private enum CloudError: LocalizedError {
    case message(String)
    var errorDescription: String? { if case .message(let text) = self { return text }; return nil }
}

@MainActor
final class CloudSession: ObservableObject {
    @Published var profile: CloudProfile?
    @Published var people: [CloudProfile] = []
    @Published var messages: [CloudMessage] = []
    @Published var selected: CloudProfile?
    @Published var error = ""
    @Published var busy = false
    @Published var tomatoOnline = false
    @Published var connected = false
    @Published var bridgeState: DeviceBridgeState = .idle
    private var radio: EnvelopBLE?
    private let parser = DeviceFrameParser()
    private var bridgeTask: Task<Void, Never>?
    private var handshakeTask: Task<Void, Never>?
    private var bridgeGeneration = UUID()
    private var bridgeInstance = UUID()
    private let deviceID = "00000000-0000-0000-0000-000000000001"
    private var routes = DeviceRoutes()
    private var deliveryTokens: [UInt32: UUID] = [:]
    private var nextToken: UInt32 = 1
    private var outboundNonces: [UInt32: UUID] = [:]
    private var announcedRoutes: Set<UInt16> = []
    private var lastForward: [UUID: Date] = [:]
    private var credentials: CloudCredentials?
    private var expires = Date.distantPast
    private var conversation: UUID?
    private var pollTask: Task<Void, Never>?
    private var selectionGeneration = 0
    private var refreshTask: Task<CloudCredentials, Error>?
    private var pendingSend: (conversation: UUID, body: String, nonce: UUID)?
    private var base: URL?
    private var key = ""
    private var account = ""

    var configured: Bool { base != nil && !key.isEmpty }
    init() {
        let env = ProcessInfo.processInfo.environment
        let url = env["ENVELOP_SUPABASE_URL"] ?? Bundle.main.object(forInfoDictionaryKey: "EnvelopSupabaseURL") as? String ?? ""
        key = env["ENVELOP_SUPABASE_KEY"] ?? Bundle.main.object(forInfoDictionaryKey: "EnvelopSupabaseKey") as? String ?? ""
        if let candidate = URL(string: url), candidate.scheme == "https", candidate.host != nil {
            base = candidate; account = candidate.absoluteString
        }
    }
    func restore() async {
        guard configured else { return }
        do {
            if let data = loadToken() {
                credentials = try JSONDecoder().decode(CloudCredentials.self, from: data)
                try await refresh()
                let rows: [CloudProfile] = try await request("rest/v1/profiles?id=eq.\(credentials!.user.id.uuidString)&select=*")
                profile = rows.first
                if profile != nil { startPolling() }
            }
        } catch { self.error = error.localizedDescription }
    }
    func enter(name: String, avatar: Int) async {
        guard !busy else { return }; busy = true; defer { busy = false }
        do {
            if credentials == nil {
                let token: CloudCredentials = try await request("auth/v1/signup", body: ["data": [:]], authenticated: false)
                try save(token)
            }
            let created: CloudProfile = try await request("rest/v1/rpc/create_profile", body: ["p_name": name, "p_avatar": avatar])
            profile = created; error = ""; startPolling()
        } catch { self.error = error.localizedDescription }
    }
    func search(_ query: String = "") async {
        do {
            // Encode as a query value, not PostgREST expression syntax.
            let filtered = query.filter { $0.isLetter || $0.isNumber || $0 == " " || $0 == "-" }
            var components = URLComponents()
            components.queryItems = [URLQueryItem(name: "select", value: "*"), URLQueryItem(name: "order", value: "is_device.desc,display_name.asc,id.asc"), URLQueryItem(name: "limit", value: "50")]
            if !filtered.isEmpty { components.queryItems?.append(URLQueryItem(name: "display_name", value: "ilike.*\(filtered)*")) }
            let rows: [CloudProfile] = try await request("rest/v1/profiles\(components.string ?? "")")
            var visible = rows.filter { $0.id != profile?.id }
            if !visible.contains(where: { $0.is_device }) {
                let pinned: [CloudProfile] = try await request("rest/v1/profiles?id=eq.\(deviceID)&select=*")
                visible.insert(contentsOf: pinned, at: 0)
            }
            guard !Task.isCancelled else { return }
            people = visible
        } catch { self.error = error.localizedDescription }
    }
    func open(_ peer: CloudProfile) async {
        selectionGeneration += 1
        let generation = selectionGeneration
        selected = peer; conversation = nil; messages = []
        do {
            let id: UUID = try await request("rest/v1/rpc/get_or_create_dm", body: ["p_peer": peer.id.uuidString])
            guard generation == selectionGeneration else { return }
            conversation = id; try await fetchMessages()
        } catch { if generation == selectionGeneration { self.error = error.localizedDescription } }
    }
    func send(_ body: String) async -> Bool {
        guard let conversation, !busy else { return false }
        guard !body.isEmpty, body.utf8.count <= 256,
              selected?.is_device != true || body.utf8.allSatisfy({ (32...126).contains($0) }) else {
            error = "Use 1–256 bytes. Tomato accepts printable ASCII."; return false
        }
        busy = true; defer { busy = false }
        if pendingSend?.conversation != conversation || pendingSend?.body != body {
            pendingSend = (conversation, body, UUID())
        }
        do {
            let _: CloudMessage = try await request("rest/v1/rpc/send_message", body: ["p_conversation": conversation.uuidString, "p_body": body, "p_nonce": pendingSend!.nonce.uuidString])
            pendingSend = nil; error = ""
            // The send succeeded even if a subsequent history refresh fails.
            do { try await fetchMessages() } catch { self.error = error.localizedDescription }
            return true
        } catch { self.error = error.localizedDescription; return false }
    }
    func connectTomato() {
        guard profile != nil, radio == nil else { return }
        let ble = EnvelopBLE(binaryMode: true); radio = ble
        bridgeState = .scanning
        ble.onLink = { [weak self] link in
            guard let self else { return }
            if link.isReady {
                self.bridgeState = .gattReady
                self.parser.reset()
                if let hello = try? DeviceFrame(type: .hello) { _ = self.radio?.sendFrame(hello) }
                self.handshakeTask?.cancel()
                self.handshakeTask = Task { [weak self] in
                    do { try await Task.sleep(nanoseconds: 5_000_000_000) } catch { return }
                    guard let self, self.bridgeState == .gattReady else { return }
                    self.error = "Tomato did not answer ENVELOP/1. Install the matching binary protocol firmware."
                    self.disconnectTomato()
                }
            } else {
                self.bridgeTask?.cancel(); self.bridgeGeneration = UUID()
                self.handshakeTask?.cancel()
                self.bridgeState = link == .scanning ? .scanning : .disconnected
                let instance = self.bridgeInstance
                Task { [weak self] in await self?.release(instance) }
                self.routes.reset(); self.deliveryTokens.removeAll(); self.announcedRoutes.removeAll()
                self.lastForward.removeAll(); self.outboundNonces.removeAll(); self.nextToken = 1
                self.bridgeInstance = UUID()
            }
        }
        ble.onBytes = { [weak self] bytes in
            guard let self else { return }
            for frame in self.parser.feed(bytes) { self.receiveDevice(frame) }
        }
        ble.start()
    }
    func disconnectTomato() {
        bridgeTask?.cancel(); handshakeTask?.cancel(); bridgeGeneration = UUID()
        radio?.onLink = nil; radio?.onBytes = nil; radio?.stop(); radio = nil
        bridgeState = .idle
        let instance = bridgeInstance
        Task { [weak self] in await self?.release(instance) }
        bridgeInstance = UUID(); routes.reset(); deliveryTokens.removeAll()
        announcedRoutes.removeAll(); outboundNonces.removeAll(); lastForward.removeAll(); nextToken = 1
    }
    private func release(_ instance: UUID) async {
        // PostgREST returns JSON null for void RPCs.
        let _: String? = try? await request("rest/v1/rpc/release_bridge", body: ["p_device": deviceID, "p_instance": instance.uuidString])
    }
    private func receiveDevice(_ frame: DeviceFrame) {
        if frame.type == .helloAck, bridgeState == .gattReady, frame.verifiedDeviceID != nil {
            handshakeTask?.cancel(); bridgeState = .tomatoVerified
            let generation = bridgeGeneration
            bridgeTask = Task { [weak self] in
                while !Task.isCancelled {
                    guard let self, self.bridgeGeneration == generation else { return }
                    await self.bridgeCycle(generation)
                    do { try await Task.sleep(nanoseconds: 3_000_000_000) } catch { return }
                }
            }
            return
        }
        guard bridgeState.isInternetReachable else { return }
        if frame.type == .ping, let pong = try? DeviceFrame(type: .pong, payload: frame.payload) { _ = radio?.sendFrame(pong) }
        let bytes = Array(frame.payload)
        guard bytes.count >= 4 else { return }
        let token = bytes.prefix(4).reduce(UInt32(0)) { ($0 << 8) | UInt32($1) }
        let instance = bridgeInstance
        if frame.type == .messageAck, bytes.count == 4, let message = deliveryTokens[token] {
            Task { [weak self] in
                guard let self else { return }
                do {
                    let _: String? = try await self.request("rest/v1/rpc/ack_device_message", body: ["p_device": self.deviceID, "p_instance": instance.uuidString, "p_message": message.uuidString])
                    guard self.bridgeInstance == instance else { return }
                    self.deliveryTokens.removeValue(forKey: token); self.lastForward.removeValue(forKey: message)
                } catch { self.error = error.localizedDescription }
            }
        } else if frame.type == .sendMessage, let conversation = routes.conversations[frame.route],
                  let body = String(bytes: bytes.dropFirst(4), encoding: .ascii), (try? DeviceFrame.text(body)) != nil {
            // Keep nonce stable through retries; bounded by the session's outgoing token space.
            guard outboundNonces.count < 1024 || outboundNonces[token] != nil else { return }
            let nonce = outboundNonces[token] ?? UUID(); outboundNonces[token] = nonce
            Task { [weak self] in
                guard let self else { return }
                do {
                    let _: CloudMessage = try await self.request("rest/v1/rpc/send_as_device", body: ["p_device": self.deviceID, "p_instance": instance.uuidString, "p_conversation": conversation.uuidString, "p_body": body, "p_nonce": nonce.uuidString])
                    guard self.bridgeInstance == instance else { return }
                    if let ack = try? DeviceFrame(type: .messageAck, route: frame.route, payload: Data(bytes.prefix(4))) { _ = self.radio?.sendFrame(ack) }
                } catch { self.error = error.localizedDescription }
            }
        }
    }
    private func bridgeCycle(_ generation: UUID) async {
        struct Lease: Decodable { let device_id: UUID }
        struct Pending: Decodable { let message_id: UUID; let conversation_id: UUID; let sender_id: UUID; let body: String }
        do {
            let _: Lease = try await request("rest/v1/rpc/claim_bridge", body: ["p_device": deviceID, "p_instance": bridgeInstance.uuidString])
            guard generation == bridgeGeneration, !Task.isCancelled else { return }
            if announcedRoutes.isEmpty {
                bridgeState = .syncing
                if let reset = try? DeviceFrame(type: .contactReset) { _ = radio?.sendFrame(reset) }
            }
            let queued: [Pending] = try await request("rest/v1/rpc/bridge_pending", body: ["p_device": deviceID, "p_instance": bridgeInstance.uuidString])
            guard generation == bridgeGeneration, !Task.isCancelled else { return }
            for item in queued {
                if (lastForward[item.message_id] ?? .distantPast) > Date().addingTimeInterval(-10) { continue }
                if routes.conversations.count >= 8 && !routes.conversations.values.contains(item.conversation_id) { continue }
                guard let route = routes.route(for: item.conversation_id) else { continue }
                if !announcedRoutes.contains(route) {
                    let contacts: [CloudProfile] = try await request("rest/v1/profiles?id=eq.\(item.sender_id.uuidString)&select=*")
                    guard generation == bridgeGeneration, !Task.isCancelled else { return }
                    guard let contact = contacts.first else { continue }
                    let name = contact.display_name.unicodeScalars.map { (32...126).contains($0.value) ? String($0) : "?" }.joined()
                    var payload = Data([UInt8(contact.avatar_id), 1]); payload.append(Data(name.utf8.prefix(32)))
                    if let frame = try? DeviceFrame(type: .contactUpsert, route: route, payload: payload), radio?.sendFrame(frame) == true { announcedRoutes.insert(route) }
                    else { continue }
                }
                let token: UInt32
                if let existing = deliveryTokens.first(where: { $0.value == item.message_id }) { token = existing.key }
                else {
                    guard nextToken < UInt32.max, deliveryTokens.count < 64 else { continue }
                    token = nextToken; nextToken += 1; deliveryTokens[token] = item.message_id
                }
                var payload = Data([UInt8(token >> 24), UInt8((token >> 16) & 255), UInt8((token >> 8) & 255), UInt8(token & 255)])
                payload.append(try DeviceFrame.text(item.body))
                if let frame = try? DeviceFrame(type: .chatMessage, route: route, payload: payload), radio?.sendFrame(frame) == true { lastForward[item.message_id] = Date() }
            }
            bridgeState = .online
        } catch {
            guard generation == bridgeGeneration, !Task.isCancelled else { return }
            bridgeState = .internetLost; self.error = error.localizedDescription
            await release(bridgeInstance)
        }
    }
    private func startPolling() {
        pollTask?.cancel()
        pollTask = Task { [weak self] in
            await self?.search()
            while !Task.isCancelled {
                await self?.poll()
                do { try await Task.sleep(nanoseconds: 3_000_000_000) } catch { break }
            }
        }
    }
    private func poll() async {
        do {
            struct Lease: Decodable { let expires_at: String }
            let leases: [Lease] = try await request("rest/v1/device_bridges?device_id=eq.00000000-0000-0000-0000-000000000001&select=expires_at")
            let formatter = ISO8601DateFormatter(); formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
            tomatoOnline = leases.contains { lease in
                let date = formatter.date(from: lease.expires_at) ?? ISO8601DateFormatter().date(from: lease.expires_at)
                return (date ?? .distantPast) > Date()
            }
            try await fetchMessages(); connected = true
        } catch { connected = false; tomatoOnline = false; self.error = error.localizedDescription }
    }
    private func fetchMessages() async throws {
        guard let id = conversation else { return }
        let rows: [CloudMessage] = try await request("rest/v1/messages?conversation_id=eq.\(id.uuidString)&select=*&order=created_at.desc,id.desc&limit=20")
        guard conversation == id else { return }; messages = rows.reversed()
    }
    private func refresh() async throws {
        guard let old = credentials else { throw CloudError.message("Sign in first") }
        if refreshTask == nil {
            refreshTask = Task {
                let token: CloudCredentials = try await request("auth/v1/token?grant_type=refresh_token", body: ["refresh_token": old.refresh_token], authenticated: false)
                try save(token)
                return token
            }
        }
        defer { refreshTask = nil }
        _ = try await refreshTask!.value
    }
    private func request<T: Decodable>(_ path: String, body: [String: Any]? = nil, authenticated: Bool = true) async throws -> T {
        guard let base, let url = URL(string: path, relativeTo: base.appendingPathComponent("/")) else { throw CloudError.message("Configure a Supabase HTTPS URL and public key.") }
        if authenticated && expires < Date().addingTimeInterval(60) { try await refresh() }
        var request = URLRequest(url: url); request.timeoutInterval = 20
        request.setValue(key, forHTTPHeaderField: "apikey")
        if authenticated, let token = credentials?.access_token { request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization") }
        if let body {
            request.httpMethod = "POST"; request.httpBody = try JSONSerialization.data(withJSONObject: body)
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        }
        let (data, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode) else {
            let parsed = try? JSONDecoder().decode(APIError.self, from: data)
            throw CloudError.message(parsed?.message ?? parsed?.msg ?? parsed?.error_description ?? "Envelop network request failed.")
        }
        return try JSONDecoder().decode(T.self, from: data)
    }
    private var keychainQuery: [String: Any] { [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: "Envelop.Supabase", kSecAttrAccount as String: account] }
    private func loadToken() -> Data? {
        var query = keychainQuery; query[kSecReturnData as String] = true; query[kSecMatchLimit as String] = kSecMatchLimitOne
        var result: CFTypeRef?; guard SecItemCopyMatching(query as CFDictionary, &result) == errSecSuccess else { return nil }
        return result as? Data
    }
    private func save(_ token: CloudCredentials) throws {
        let data = try JSONEncoder().encode(token)
        let update = [kSecValueData as String: data]
        var status = SecItemUpdate(keychainQuery as CFDictionary, update as CFDictionary)
        if status == errSecItemNotFound {
            var query = keychainQuery; query[kSecValueData as String] = data
            query[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
            status = SecItemAdd(query as CFDictionary, nil)
        }
        guard status == errSecSuccess else { throw CloudError.message("Could not securely save your Envelop identity (\(status)).") }
        credentials = token; expires = Date().addingTimeInterval(TimeInterval(token.expires_in))
    }
}
