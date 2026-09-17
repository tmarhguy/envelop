import SwiftUI
import Foundation

/// Local development integration. One compiler; hardware-first dispatch;
/// virtual execution always requires an explicit choice, and never replays later.
final class TomatoComputeRecord: ObservableObject, Identifiable {
    let id = UUID()
    let prompt: String
    var started = false
    @Published var wireHex = ""
    init(prompt: String) { self.prompt = prompt }
    @Published var source = "What is (57 + 19) AND 0x3F?"
    @Published var canonical = ""
    @Published var jobHex = ""
    @Published var result = ""
    @Published var target = ""
    @Published var busy = false
    @Published var fallback = false
    @Published var frozenSource = ""
    @Published var failure = ""
}

struct TomatoComputeView: View {
    @ObservedObject var session: CloudSession
    @ObservedObject var record: TomatoComputeRecord
    struct Interpretation: Decodable {
        let kind: String
        let canonical: String
        let job: String?
        let target: String?
        let replies: [Reply]?
        struct Reply: Decodable { let text: String }
    }
    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text(record.prompt).font(.body).textSelection(.enabled)
                .padding(12).frame(maxWidth: .infinity, alignment: .trailing)
                .background(Color.green.opacity(0.12)).clipShape(RoundedRectangle(cornerRadius: 12))
            Label("Tomato · compute", systemImage: "cpu").font(.headline)
            if record.busy { ProgressView("Waiting for Tomato…") }
            if !record.canonical.isEmpty {
                Text("Compiled program · remote bytecode v1").font(.headline)
                ScrollView { Text(record.canonical).font(.system(.caption, design: .monospaced)).textSelection(.enabled).frame(maxWidth: .infinity, alignment: .leading) }.frame(maxHeight: 100)
                Text("Job hex · version byte + instructions").font(.caption.bold())
                DisclosureGroup("Show all \(record.jobHex.split(separator: " ").count) bytes · hex") { Text(record.jobHex).font(.system(.caption2, design: .monospaced)).textSelection(.enabled) }
                Text("This is bounded remote bytecode interpreted by Tomato OS, not raw CPU machine code.").font(.caption2).foregroundStyle(.secondary)
                if !record.wireHex.isEmpty {
                    DisclosureGroup("Exact ENVELOP/1 frame sent · hex") {
                        Text(record.wireHex).font(.system(.caption2, design: .monospaced)).textSelection(.enabled)
                    }
                }
            }
            if record.fallback {
                Text("Physical Tomato is unavailable for this job. Use Virtual Tomato?").font(.headline)
                Text("It runs through the local Virtual Tomato emulator service. The result will be labeled Virtual Tomato; this job will not run later on hardware.").font(.caption).foregroundStyle(.secondary)
                HStack {
                    Button("Use Virtual Tomato") { Task { await virtual() } }.buttonStyle(.borderedProminent)
                    Button("Cancel") { record.fallback = false; record.target = "Cancelled — no virtual execution" }
                }
            }
            if !record.target.isEmpty { Label(record.target, systemImage: "cpu").font(.callout.bold()) }
            if !record.result.isEmpty { Text(record.result).font(.system(.body, design: .monospaced)).textSelection(.enabled) }
            if !record.failure.isEmpty { Text(record.failure).foregroundStyle(.red).font(.callout) }
            Text("Local preview integration · compiler service: 127.0.0.1:8766").font(.caption2).foregroundStyle(.secondary)
        }.padding(16).frame(maxWidth: .infinity, alignment: .leading)
            .background(Color.secondary.opacity(0.06)).clipShape(RoundedRectangle(cornerRadius: 14))
            .task { guard !record.started else { return }; record.started = true; record.source = record.prompt; await run() }
    }
    private func call(_ path: String, text: String) async throws -> Interpretation {
        let base = URL(string: "http://127.0.0.1:8766")!
        let (tokenData, _) = try await URLSession.shared.data(from: base.appendingPathComponent("session"))
        struct Token: Decodable { let token: String }
        let token = try JSONDecoder().decode(Token.self, from: tokenData).token
        var request = URLRequest(url: base.appendingPathComponent(path)); request.httpMethod = "POST"; request.timeoutInterval = 30
        request.setValue(token, forHTTPHeaderField: "X-Tomato-Token")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONSerialization.data(withJSONObject: ["text": text])
        let (data, response) = try await URLSession.shared.data(for: request)
        guard (response as? HTTPURLResponse)?.statusCode == 200 else {
            throw NSError(domain: "Tomato", code: 1, userInfo: [NSLocalizedDescriptionKey: String(data: data, encoding: .utf8) ?? "Compiler unavailable"])
        }
        return try JSONDecoder().decode(Interpretation.self, from: data)
    }
    private func run() async {
        record.busy = true; defer { record.busy = false }
        record.frozenSource = record.source; record.failure = ""; record.result = ""; record.target = ""; record.canonical = ""; record.jobHex = ""
        do {
            let parsed = try await call("interpret", text: record.frozenSource)
            record.canonical = parsed.canonical
            guard let hex = parsed.job else {
                record.failure = "Use the conversation for chat. This panel accepts compute jobs."; return
            }
            guard hex.count.isMultiple(of: 2) else {
                record.failure = "Compiler returned malformed bytecode."; return
            }
            var bytes: [UInt8] = []
            for i in stride(from: 0, to: hex.count, by: 2) {
                let start = hex.index(hex.startIndex, offsetBy: i)
                let end = hex.index(start, offsetBy: 2)
                guard let byte = UInt8(hex[start..<end], radix: 16) else {
                    record.failure = "Compiler returned malformed bytecode."; return
                }
                bytes.append(byte)
            }
            record.jobHex = bytes.map { String(format: "%02X", $0) }.joined(separator: " ")
            record.target = "Trying physical Tomato…"
            if session.canUseDurableHardware {
                switch await session.executeDurableHardware(record.jobHex) {
                case .physical(let result):
                    record.target = "Physical Tomato · durable hardware job"
                    record.result = result
                case .unavailable(let reason):
                    record.target = "Physical Tomato unavailable"
                    record.failure = reason
                    record.fallback = true
                case .unknown(let reason):
                    record.target = "Tomato execution unknown · no virtual replay"
                    record.failure = reason
                }
            } else if let reply = await session.executeHardware(Data(bytes)) {
                // Development-only direct BLE path. Authenticated online
                // conversations always use durable compute_jobs above.
                record.wireHex = session.computeWireHex
                record.target = "Direct BLE development path · not provenance-verified"
                let value = reply.suffix(4).reduce(UInt32(0)) { ($0 << 8) | UInt32($1) }
                record.result = reply[4] == 0 ? "\(value)\n" + String(format: "0x%08X", value) : "Tomato rejected the job (error \(reply[4]))."
            } else {
                record.wireHex = session.computeWireHex
                record.target = "Physical Tomato unavailable"
                record.fallback = true
            }
        } catch {
            record.failure = error.localizedDescription
            if (error as NSError).domain == NSURLErrorDomain { record.failure += "\nStart Virtual Tomato’s local compiler service and retry." }
        }
    }
    private func virtual() async {
        record.fallback = false; record.busy = true; defer { record.busy = false }; record.failure = ""
        do {
            let parsed = try await call("execute", text: record.frozenSource)
            record.target = "Virtual Tomato · local emulator service"
            record.result = parsed.replies?.map(\.text).joined(separator: "\n\n") ?? "No response"
        } catch { record.failure = error.localizedDescription; record.target = "Virtual execution failed" }
    }
}
