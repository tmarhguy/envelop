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
    let presence: PresenceInfo?
    let pinned: Bool?
}
struct PresenceInfo: Codable, Hashable {
    let last_seen: String
}
struct CloudMessage: Codable, Identifiable {
    let id: UUID
    let sender_id: UUID
    let body: String
    let created_at: String
}
private struct CloudComputeJob: Decodable {
    let id: UUID
    let status: String
    let result_text: String?
}
enum CloudHardwareResult {
    case physical(String)
    case unavailable(String)
    case unknown(String)
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
    private enum BridgeAPI {
        static let claim = "rest/v1/rpc/claim_bridge"
        static let release = "rest/v1/rpc/release_bridge"
        static let pending = "rest/v1/rpc/bridge_pending"
        static let acknowledge = "rest/v1/rpc/ack_device_message"
        static let send = "rest/v1/rpc/send_as_device"
        static let computePending = "rest/v1/rpc/bridge_compute_pending"
        static let computeClaim = "rest/v1/rpc/bridge_claim_compute_job"
        static let computeFinish = "rest/v1/rpc/bridge_finish_compute_job"
    }
    private enum ComputeAPI {
        static let enqueue = "rest/v1/rpc/enqueue_compute_job"
        static let read = "rest/v1/rpc/my_compute_job"
        static let cancel = "rest/v1/rpc/cancel_compute_job"
    }
    @Published var profile: CloudProfile?
    @Published var people: [CloudProfile] = []
    @Published var messages: [CloudMessage] = []
    @Published private(set) var lastHiddenMessage: CloudMessage?
    private var hiddenMessages: Set<String> = []
    private var hiddenKey: String? { profile.map { "Envelop.hiddenMessages.\(account).\($0.id.uuidString)" } }
    var visibleMessages: [CloudMessage] { messages.filter { !hiddenMessages.contains($0.id.uuidString) } }
    func hideMessage(_ message: CloudMessage) {
        guard let hiddenKey else { return }
        lastHiddenMessage = message
        hiddenMessages.insert(message.id.uuidString)
        UserDefaults.standard.set(Array(hiddenMessages), forKey: hiddenKey)
        objectWillChange.send()
    }
    func undoHide() {
        guard let message = lastHiddenMessage, let hiddenKey else { return }
        hiddenMessages.remove(message.id.uuidString)
        UserDefaults.standard.set(Array(hiddenMessages), forKey: hiddenKey)
        lastHiddenMessage = nil
    }
    @Published var selected: CloudProfile?
    @Published var error = ""
    @Published var busy = false
    @Published var tomatoOnline = false
    @Published var connected = false
    @Published var bridgeState: DeviceBridgeState = .idle
    private var radio: EnvelopBLE?
    private var computeWaiter: (token: UInt32, route: UInt16, instance: UUID, continuation: CheckedContinuation<Data?, Never>)?
    private var bridgeComputeWaiters: [UInt32: (job: UUID, continuation: CheckedContinuation<Data?, Never>)] = [:]
    @Published var computeWireHex = ""
    private var computeToken: UInt32 = 0x80000000
    var canUseDurableHardware: Bool {
        profile != nil && selected?.is_device == true && conversation != nil
            && (tomatoOnline || bridgeState.isInternetReachable)
    }
    func executeDurableHardware(_ jobHex: String) async -> CloudHardwareResult {
        guard canUseDurableHardware, let conversation else {
            return .unavailable("No authenticated Tomato lease is online.")
        }
        let submitted: CloudComputeJob
        do {
            submitted = try await request(
                ComputeAPI.enqueue,
                body: ["p_device": deviceID, "p_conversation": conversation.uuidString, "p_job_hex": jobHex]
            )
        } catch {
            // The request may have reached the server even when its response did
            // not reach us. Without a job id there is nothing safe to cancel.
            return .unknown("Hardware submission could not be confirmed. It will not be run virtually.")
        }
        let deadline = Date().addingTimeInterval(25)
        while !Task.isCancelled && Date() < deadline {
            do { try await Task.sleep(nanoseconds: 2_000_000_000) } catch { break }
            do {
                let current: CloudComputeJob = try await request(
                    ComputeAPI.read, body: ["p_job": submitted.id.uuidString]
                )
                let resolution = DurableComputeResolution(status: current.status)
                if resolution == .physical {
                    return .physical(current.result_text ?? "Tomato completed the job.")
                }
                if resolution == .virtualSafe {
                    return .unavailable(current.result_text ?? "The hardware job is terminal and cannot replay.")
                }
            } catch {
                return await cancelDurableHardware(submitted.id)
            }
        }
        return await cancelDurableHardware(submitted.id)
    }
    private func cancelDurableHardware(_ id: UUID) async -> CloudHardwareResult {
        do {
            let final: CloudComputeJob = try await request(
                ComputeAPI.cancel, body: ["p_job": id.uuidString]
            )
            if DurableComputeResolution(status: final.status) == .physical {
                return .physical(final.result_text ?? "Tomato completed the job.")
            }
            if DurableComputeResolution(status: final.status) == .virtualSafe {
                return .unavailable("The hardware job is terminal and cannot replay.")
            }
            return .unknown("Hardware completion is unknown. It will not be run virtually.")
        } catch {
            return .unknown("Hardware cancellation could not be confirmed. It will not be run virtually.")
        }
    }
    func executeHardware(_ job: Data) async -> Data? {
        computeWireHex = ""
        guard computeWaiter == nil, bridgeState.isInternetReachable,
              let conversation, let route = routes.conversations.first(where: { $0.value == conversation })?.key,
              let radio else { return nil }
        computeToken &+= 1
        let token = computeToken
        var payload = Data([UInt8(token >> 24), UInt8((token >> 16) & 255), UInt8((token >> 8) & 255), UInt8(token & 255)])
        payload.append(job)
        return await withCheckedContinuation { continuation in
            computeWaiter = (token, route, bridgeInstance, continuation)
            guard let frame = try? DeviceFrame(type: .computeJob, route: route, payload: payload), radio.sendFrame(frame) else {
                computeWaiter = nil; continuation.resume(returning: nil); return
            }
            if let sent = try? DeviceFrame(type: .computeJob, route: route, payload: payload) {
                computeWireHex = sent.encoded.map { String(format: "%02X", $0) }.joined(separator: " ")
            }
            Task { [weak self] in
                try? await Task.sleep(nanoseconds: 8_000_000_000)
                guard let self, let pending = self.computeWaiter, pending.token == token else { return }
                self.computeWaiter = nil; pending.continuation.resume(returning: nil)
            }
        }
    }
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
    private var presenceMode: Bool?
    private var lastBeat = Date.distantPast

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
            let rows: [CloudProfile]
            if presenceMode == false {
                rows = try await fetchPeople(query, presence: false)
            } else {
                do {
                    rows = try await fetchPeople(query, presence: true)
                    presenceMode = true
                } catch {
                    // Backend predates presence: show everyone, skip heartbeats.
                    rows = try await fetchPeople(query, presence: false)
                    presenceMode = false
                }
            }
            var visible = rows.filter { $0.id != profile?.id }
            if presenceMode != false {
                visible = visible.filter { $0.is_device || ($0.pinned ?? false) || isOnline($0) }
            }
            if !visible.contains(where: { $0.is_device }) {
                let pinned: [CloudProfile] = try await request("rest/v1/profiles?id=eq.\(deviceID)&select=*")
                visible.insert(contentsOf: pinned, at: 0)
            }
            guard !Task.isCancelled else { return }
            people = visible
        } catch { self.error = error.localizedDescription }
    }
    private func fetchPeople(_ query: String, presence: Bool) async throws -> [CloudProfile] {
        // Encode as a query value, not PostgREST expression syntax.
        let filtered = query.filter { $0.isLetter || $0.isNumber || $0 == " " || $0 == "-" }
        var components = URLComponents()
        components.queryItems = [URLQueryItem(name: "select", value: presence ? "*,presence(last_seen)" : "*"), URLQueryItem(name: "order", value: "is_device.desc,display_name.asc,id.asc"), URLQueryItem(name: "limit", value: "50")]
        if !filtered.isEmpty { components.queryItems?.append(URLQueryItem(name: "display_name", value: "ilike.*\(filtered)*")) }
        return try await request("rest/v1/profiles\(components.string ?? "")")
    }
    func isOnline(_ person: CloudProfile) -> Bool {
        guard let stamp = person.presence?.last_seen else { return presenceMode == false }
        let formatter = ISO8601DateFormatter(); formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        let date = formatter.date(from: stamp) ?? ISO8601DateFormatter().date(from: stamp)
        return (date ?? .distantPast).timeIntervalSinceNow > -45
    }
    func updateName(_ name: String) async -> Bool {
        guard !busy else { return false }
        busy = true; defer { busy = false }
        do {
            let updated: CloudProfile = try await request("rest/v1/rpc/update_profile_name", body: ["p_name": name])
            profile = updated; error = ""; return true
        } catch { self.error = error.localizedDescription; return false }
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
        // Firmware only auto-replies to canonical "Hello" and "/help": normalize
        // greeting variants (e.g. "Hello, Tomato.") client-side, same as web chat
        // and the Virtual Tomato worker, so hardware and virtual agree.
        var outBody = body
        if selected?.is_device == true {
            let trimmed = body.trimmingCharacters(in: .whitespacesAndNewlines)
            if trimmed.range(of: #"^(hi|hey|hello)\s*,?\s*(tomato)?\s*[!.?]*$"#, options: [.regularExpression, .caseInsensitive]) != nil {
                outBody = "Hello"
            } else if trimmed.range(of: #"^(help|what can you do)[?.!]*$"#, options: [.regularExpression, .caseInsensitive]) != nil {
                outBody = "/help"
            }
        }
        busy = true; defer { busy = false }
        if pendingSend?.conversation != conversation || pendingSend?.body != outBody {
            pendingSend = (conversation, outBody, UUID())
        }
        do {
            let _: CloudMessage = try await request("rest/v1/rpc/send_message", body: ["p_conversation": conversation.uuidString, "p_body": outBody, "p_nonce": pendingSend!.nonce.uuidString])
            pendingSend = nil; error = ""
            // The send succeeded even if a subsequent history refresh fails.
            do { try await fetchMessages() } catch { self.error = error.localizedDescription }
            return true
        } catch { self.error = error.localizedDescription; return false }
    }
    func connectTomato() {
        guard profile != nil else {
            error = "Enter Envelop first — the Tomato bridge needs your identity."
            return
        }
        guard radio == nil else { return }
        let ble = EnvelopBLE(); radio = ble
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
                if link == .bluetoothOff {
                    self.bridgeState = .disconnected
                    self.error = "Mac Bluetooth is off — turn it on so Envelop can reach Tomato."
                } else {
                    self.bridgeState = link == .scanning ? .scanning : .disconnected
                }
                let instance = self.bridgeInstance
                Task { [weak self] in await self?.release(instance) }
                self.clearComputeWaiters()
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
        clearComputeWaiters()
        bridgeInstance = UUID(); routes.reset(); deliveryTokens.removeAll()
        announcedRoutes.removeAll(); outboundNonces.removeAll(); lastForward.removeAll(); nextToken = 1
    }
    private func clearComputeWaiters() {
        if let pending = computeWaiter {
            computeWaiter = nil
            pending.continuation.resume(returning: nil)
        }
        let pending = Array(bridgeComputeWaiters.values)
        bridgeComputeWaiters.removeAll()
        for waiter in pending {
            waiter.continuation.resume(returning: nil)
        }
    }
    private func release(_ instance: UUID) async {
        // PostgREST returns JSON null for void RPCs.
        let _: String? = try? await request(
            BridgeAPI.release,
            body: ["p_device": deviceID, "p_instance": instance.uuidString]
        )
    }
    private func receiveDevice(_ frame: DeviceFrame) {
        if frame.type == .computeResult, frame.payload.count == 9 {
            let token = frame.payload.prefix(4).reduce(UInt32(0), { ($0 << 8) | UInt32($1) })
            if let pending = computeWaiter,
               pending.route == frame.route, pending.instance == bridgeInstance,
               frame.payload.prefix(4).reduce(UInt32(0), { ($0 << 8) | UInt32($1) }) == pending.token {
                computeWaiter = nil; pending.continuation.resume(returning: frame.payload); return
            }
            if let pending = bridgeComputeWaiters.removeValue(forKey: token) {
                pending.continuation.resume(returning: frame.payload); return
            }
        }
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
                    let _: String? = try await self.request(
                        BridgeAPI.acknowledge,
                        body: ["p_device": self.deviceID, "p_instance": instance.uuidString, "p_message": message.uuidString]
                    )
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
                    let _: CloudMessage = try await self.request(
                        BridgeAPI.send,
                        body: ["p_device": self.deviceID, "p_instance": instance.uuidString, "p_conversation": conversation.uuidString, "p_body": body, "p_nonce": nonce.uuidString]
                    )
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
            let _: Lease = try await request(
                BridgeAPI.claim,
                body: ["p_device": deviceID, "p_instance": bridgeInstance.uuidString]
            )
            guard generation == bridgeGeneration, !Task.isCancelled else { return }
            bridgeState = .leaseAcquired
            if announcedRoutes.isEmpty {
                bridgeState = .syncing
                if let reset = try? DeviceFrame(type: .contactReset) { _ = radio?.sendFrame(reset) }
            }
            let queued: [Pending] = try await request(
                BridgeAPI.pending,
                body: ["p_device": deviceID, "p_instance": bridgeInstance.uuidString]
            )
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
            // Cloud compute jobs: same BLE link, COMPUTE_JOB frames, results submitted
            // back so web waiters polling my_compute_job see Tomato's own answer.
            struct ComputePending: Decodable { let job_id: UUID; let conversation_id: UUID; let requester: UUID; let job_hex: String }
            let jobs: [ComputePending] = try await request(
                BridgeAPI.computePending,
                body: ["p_device": deviceID, "p_instance": bridgeInstance.uuidString]
            )
            guard generation == bridgeGeneration, !Task.isCancelled else { return }
            for job in jobs.prefix(4) {
                if routes.conversations.count >= 8 && !routes.conversations.values.contains(job.conversation_id) { continue }
                guard let route = routes.route(for: job.conversation_id) else { continue }
                if !announcedRoutes.contains(route) {
                    let contacts: [CloudProfile] = (try? await request("rest/v1/profiles?id=eq.\(job.requester.uuidString)&select=*")) ?? []
                    guard generation == bridgeGeneration, !Task.isCancelled else { return }
                    guard let contact = contacts.first else { continue }
                    let name = contact.display_name.unicodeScalars.map { (32...126).contains($0.value) ? String($0) : "?" }.joined()
                    var payload = Data([UInt8(contact.avatar_id), 1]); payload.append(Data(name.utf8.prefix(32)))
                    if let frame = try? DeviceFrame(type: .contactUpsert, route: route, payload: payload), radio?.sendFrame(frame) == true { announcedRoutes.insert(route) }
                    else { continue }
                }
                let parts = job.job_hex.split(separator: " ")
                let decoded = parts.map { UInt8($0, radix: 16) }
                guard !parts.isEmpty, parts.allSatisfy({ $0.count == 2 }),
                      decoded.allSatisfy({ $0 != nil }),
                      decoded.count <= DeviceFrame.maximumPayload - 4 else {
                    let _: CloudComputeJob? = try? await request(
                        BridgeAPI.computeFinish,
                        body: ["p_job": job.job_id.uuidString, "p_device": deviceID, "p_instance": bridgeInstance.uuidString, "p_result_text": NSNull(), "p_error": "malformed job hex"] as [String: Any]
                    )
                    continue
                }
                let bytes = decoded.compactMap { $0 }
                guard nextToken < UInt32.max else { continue }
                let token = nextToken; nextToken += 1
                do {
                    let _: CloudComputeJob = try await request(
                        BridgeAPI.computeClaim,
                        body: ["p_job": job.job_id.uuidString, "p_device": deviceID, "p_instance": bridgeInstance.uuidString]
                    )
                } catch { continue }
                guard generation == bridgeGeneration, !Task.isCancelled else { return }
                var payload = Data([UInt8(token >> 24), UInt8((token >> 16) & 255), UInt8((token >> 8) & 255), UInt8(token & 255)])
                payload.append(contentsOf: bytes)
                guard let frame = try? DeviceFrame(type: .computeJob, route: route, payload: payload), radio?.sendFrame(frame) == true else { continue }
                let reply: Data? = await withCheckedContinuation { continuation in
                    bridgeComputeWaiters[token] = (job.job_id, continuation)
                    Task { [weak self] in
                        try? await Task.sleep(nanoseconds: 8_000_000_000)
                        guard let self, let pending = self.bridgeComputeWaiters[token], pending.job == job.job_id else { return }
                        self.bridgeComputeWaiters.removeValue(forKey: token); pending.continuation.resume(returning: nil)
                    }
                }
                guard generation == bridgeGeneration, !Task.isCancelled else { return }
                if let reply, reply.count == 9 {
                    let value = reply.suffix(4).reduce(UInt32(0)) { ($0 << 8) | UInt32($1) }
                    let text = reply[4] == 0
                        ? "\(value) / \(String(format: "0x%08X", value))"
                        : "Tomato rejected the job (status \(reply[4]))."
                    let _: CloudComputeJob? = try? await request(
                        BridgeAPI.computeFinish,
                        body: ["p_job": job.job_id.uuidString, "p_device": deviceID, "p_instance": bridgeInstance.uuidString, "p_result_text": text, "p_error": NSNull()] as [String: Any]
                    )
                }
                // Timeout: leave claimed. The web waiter cancels or a later cycle
                // re-claims it stale; a late Tomato answer is never replayed blindly.
            }
            bridgeState = .online
            if let status = try? DeviceFrame(type: .status, payload: Data([2])) { _ = radio?.sendFrame(status) }
            if error.contains("hold the Tomato bridge") || error.contains("not provisioned") {
                error = ""
            }
        } catch {
            guard generation == bridgeGeneration, !Task.isCancelled else { return }
            bridgeState = .internetLost
            if let status = try? DeviceFrame(type: .status, payload: Data([1])) { _ = radio?.sendFrame(status) }
            let message = error.localizedDescription
            let lower = message.lowercased()
            if lower.contains("provision") {
                let id = profile?.id.uuidString ?? "unknown"
                self.error = "This account can't hold the Tomato bridge yet. Provision it, then reconnect. Profile ID: \(id)"
            } else {
                self.error = message
            }
            await release(bridgeInstance)
            radio?.onLink = nil
            radio?.onBytes = nil
            radio?.stop()
            radio = nil
            parser.reset()
            bridgeGeneration = UUID()
            clearComputeWaiters()
            routes.reset()
            deliveryTokens.removeAll()
            announcedRoutes.removeAll()
            lastForward.removeAll()
            outboundNonces.removeAll()
            nextToken = 1
            bridgeInstance = UUID()
        }
    }
    private func startPolling() {
        if let hiddenKey { hiddenMessages = Set(UserDefaults.standard.stringArray(forKey: hiddenKey) ?? []) }
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
            if presenceMode != false, Date().timeIntervalSince(lastBeat) > 15 {
                lastBeat = Date()
                let _: String? = try? await request("rest/v1/rpc/heartbeat", body: [String: Any]())
            }
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
        guard let base, let url = URL(string: path, relativeTo: base.appendingPathComponent("/")) else { throw CloudError.message("This build isn’t connected to the Envelop network.") }
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
        return try decodeCloudResponse(T.self, from: data)
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
