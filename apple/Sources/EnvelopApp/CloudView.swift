import SwiftUI
#if os(macOS)
import AppKit
#else
import UIKit
#endif

struct CloudView: View {
    @StateObject private var session = CloudSession()
    @State private var name = ""
    @State private var query = ""
    @State private var draft = ""
    @State private var editingName = false
    @State private var profileName = ""
    @State private var computing = false
    @State private var computePrompts: [TomatoComputeRecord] = []
    @StateObject private var localCompute = TomatoComputeRecord(prompt: "What is (57 + 19) AND 0x3F?")
    var body: some View {
        Group {
            if !session.configured {
                ContentUnavailableView("Envelop isn’t connected", systemImage: "network", description: Text("This build has no network baked in. Use a download from the Envelop site, or ask whoever runs the test network."))
            } else if session.profile == nil {
                VStack(spacing: 18) {
                    EnvelopAvatar()
                    Text("Welcome to Envelop").font(.largeTitle.bold())
                    TextField("Your name", text: $name).textFieldStyle(.roundedBorder)
                    Button("Enter Envelop") {
                        Task { await session.enter(name: name, avatar: defaultAvatar(for: name)) }
                    }
                        .buttonStyle(.borderedProminent)
                        .disabled(name.trimmingCharacters(in: .whitespaces).isEmpty || name.count > 32 || session.busy)
                    Button("Try Tomato locally") { computing = true }
                    if computing { ScrollView { TomatoComputeView(session: session, record: localCompute) }.frame(height: 350) }
                    Text("Local preview works without a cloud profile.").font(.caption).foregroundStyle(.secondary)
                }.padding(30).frame(maxWidth: 420)
            } else {
                NavigationSplitView {
                    List(session.people) { person in
                        Button { draft = ""; Task { await session.open(person) } } label: {
                            HStack {
                                Image(systemName: person.is_device ? "desktopcomputer" : "person.crop.circle.fill")
                                VStack(alignment: .leading) {
                                    HStack(spacing: 3) {
                                        Text(person.display_name)
                                        if person.verified {
                                            Image(systemName: "checkmark.seal.fill")
                                                .foregroundStyle(EnvelopTheme.verified)
                                                .font(.caption)
                                                .accessibilityLabel("Verified")
                                        }
                                    }
                                    if person.is_device {
                                        Text(session.tomatoOnline ? "Online" : "Offline")
                                            .font(.caption).foregroundStyle(.secondary)
                                    } else if person.pinned ?? false {
                                        Text(session.isOnline(person) ? "Online" : "Offline")
                                            .font(.caption).foregroundStyle(.secondary)
                                    }
                                }
                            }
                        }.buttonStyle(.plain)
                    }
                    .navigationTitle("Envelop")
                    .navigationSplitViewColumnWidth(min: 220, ideal: 260)
                    .safeAreaInset(edge: .bottom) {
                        VStack(alignment: .leading, spacing: 12) {
                            #if os(macOS)
                            Label(connectionLabel, systemImage: session.bridgeState.isInternetReachable ? "checkmark.circle.fill" : "antenna.radiowaves.left.and.right")
                                .font(.callout).foregroundStyle(session.bridgeState.isInternetReachable ? .green : .secondary)
                            Button {
                                if session.bridgeState == .idle { session.connectTomato() } else { session.disconnectTomato() }
                            } label: {
                                Text(session.bridgeState == .idle ? "Connect to Tomato" : "Disconnect Tomato")
                                    .frame(maxWidth: .infinity)
                            }.buttonStyle(.borderedProminent)
                            #else
                            Label(session.tomatoOnline ? "Tomato online" : "Tomato offline", systemImage: session.tomatoOnline ? "checkmark.circle.fill" : "antenna.radiowaves.left.and.right")
                                .font(.callout).foregroundStyle(session.tomatoOnline ? .green : .secondary)
                            #endif
                            if let me = session.profile {
                                Divider()
                                HStack {
                                    Label(me.display_name, systemImage: "person.crop.circle")
                                        .lineLimit(1).help(me.display_name)
                                    if me.verified {
                                        Image(systemName: "checkmark.seal.fill")
                                            .foregroundStyle(EnvelopTheme.verified)
                                            .font(.caption)
                                            .accessibilityLabel("Verified")
                                    }
                                    Spacer()
                                    Button {
                                        profileName = me.display_name; editingName = true
                                    } label: { Image(systemName: "pencil") }
                                    .buttonStyle(.borderless).help("Edit name").accessibilityLabel("Edit name")
                                }.font(.callout)
                                Text(me.id.uuidString).font(.caption2).foregroundStyle(.secondary).textSelection(.enabled)
                            }
                        }.padding(14).background(.bar)
                    }
                    .searchable(text: $query, prompt: "Find people")
                    .task(id: query) {
                        do { try await Task.sleep(nanoseconds: 250_000_000) } catch { return }
                        await session.search(query)
                    }
                } detail: {
                    if let peer = session.selected {
                        VStack(spacing: 0) {
                            if peer.is_device {
                                HStack {
                                    Label("Hardware first · virtual available", systemImage: "cpu").font(.caption).foregroundStyle(.secondary)
                                    Spacer()
                                    Button("Try a calculation") { draft = "What is (57 + 19) AND 0x3F?" }
                                }.padding(12)
                            }
                            ScrollViewReader { proxy in
                                ScrollView {
                                    LazyVStack(alignment: .leading, spacing: 12) {
                                        ForEach(session.visibleMessages) { message in
                                            HStack {
                                                if message.sender_id == session.profile?.id { Spacer(minLength: 40) }
                                                VStack(alignment: .leading, spacing: 6) {
                                                    Text(message.body).textSelection(.enabled)
                                                    HStack(spacing: 12) {
                                                        Text(messageTime(message.created_at)).font(.caption2).foregroundStyle(.secondary)
                                                        Spacer(minLength: 8)
                                                        Menu { messageActions(message) } label: {
                                                            Image(systemName: "ellipsis")
                                                        }.menuStyle(.borderlessButton).fixedSize()
                                                        .accessibilityLabel("Message actions")
                                                    }
                                                }.padding(12)
                                                    .background(message.sender_id == session.profile?.id ? Color.green.opacity(0.15) : Color.gray.opacity(0.12))
                                                    .clipShape(RoundedRectangle(cornerRadius: 14))
                                                    .contextMenu { messageActions(message) }
                                                if message.sender_id != session.profile?.id { Spacer(minLength: 40) }
                                            }.id(message.id)
                                        }
                                        if peer.is_device {
                                            ForEach(computePrompts) { record in
                                                TomatoComputeView(session: session, record: record).id(record.id)
                                            }
                                        }
                                    }.padding()
                                }.onChange(of: computePrompts.count) {
                                    if let id = computePrompts.last?.id { proxy.scrollTo(id, anchor: .bottom) }
                                }.onChange(of: session.messages.last?.id) {
                                    if let id = session.messages.last?.id { proxy.scrollTo(id, anchor: .bottom) }
                                }
                            }
                            if session.lastHiddenMessage != nil {
                                HStack {
                                    Text("Deleted on this Mac").font(.caption).foregroundStyle(.secondary)
                                    Button("Undo") { session.undoHide() }
                                    Spacer()
                                }.padding(.horizontal).padding(.vertical, 6)
                            }
                            if peer.is_device && !session.tomatoOnline {
                                Text("Messages wait in Envelop until Tomato has a bridge.").font(.caption).foregroundStyle(.secondary).padding(8)
                            }
                            HStack(alignment: .bottom) {
                                TextField("Message \(peer.display_name)", text: $draft, axis: .vertical)
                                    .textFieldStyle(.roundedBorder)
                                    .lineLimit(1...4)
                                    .submitLabel(.send)
                                    .onSubmit { sendDraft(to: peer) }
                                    #if os(macOS)
                                    .onKeyPress { press in
                                        guard press.key == .return else { return .ignored }
                                        if press.modifiers.contains(.shift) { return .ignored }
                                        sendDraft(to: peer)
                                        return .handled
                                    }
                                    #endif
                                Button("Send") { sendDraft(to: peer) }
                                    .disabled(!canSend)
                            }.padding()
                        }.navigationTitle(peer.display_name)
                    } else {
                        ContentUnavailableView("Choose a conversation", systemImage: "bubble.left.and.bubble.right", description: Text("Message a person or send a note to Tomato."))
                    }
                }
            }
        }
        .safeAreaInset(edge: .bottom) {
            if !session.error.isEmpty { Text(session.error).font(.caption).foregroundStyle(.red).padding(8) }
        }
        .task { await session.restore() }
        .sheet(isPresented: $editingName) {
            VStack(spacing: 16) {
                Text("Your name").font(.headline)
                TextField("Your name", text: $profileName).textFieldStyle(.roundedBorder)
                HStack {
                    Button("Cancel") { editingName = false }
                    Button("Save") {
                        Task { if await session.updateName(profileName) { editingName = false } }
                    }.disabled(session.busy || profileName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || profileName.count > 32)
                }
                if !session.error.isEmpty { Text(session.error).foregroundStyle(.red).font(.caption) }
            }.padding(24).frame(width: 340)
        }
        .onDisappear { session.disconnectTomato() }
    }

    private var canSend: Bool {
        !draft.isEmpty && draft.utf8.count <= 256 && !session.busy
    }

    #if os(macOS)
    private var connectionLabel: String {
        switch session.bridgeState {
        case .idle: return "Tomato disconnected"
        case .scanning: return "Looking for Tomato…"
        case .bleConnected, .gattReady: return "Connecting to Tomato…"
        case .tomatoVerified, .leaseAcquired, .syncing: return "Syncing Tomato…"
        case .online, .bridging: return "Tomato connected"
        case .internetLost: return "Internet unavailable"
        case .leaseLost: return "Bridge connection lost"
        case .disconnected: return "Tomato disconnected"
        }
    }
    #endif

    @ViewBuilder private func messageActions(_ message: CloudMessage) -> some View {
        Button("Copy") {
            #if os(macOS)
            NSPasteboard.general.clearContents()
            NSPasteboard.general.setString(message.body, forType: .string)
            #else
            UIPasteboard.general.string = message.body
            #endif
        }
        Button("Use text in message") { draft = message.body }
        Divider()
        Button("Delete for me on this Mac", role: .destructive) { session.hideMessage(message) }
    }

    private func messageTime(_ value: String) -> String {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        let date = formatter.date(from: value) ?? ISO8601DateFormatter().date(from: value)
        return date?.formatted(date: .abbreviated, time: .shortened) ?? ""
    }

    /// Enter / IME Send / button all share this path. Desktop: Enter sends, Shift+Enter newlines.
    private func sendDraft(to peer: CloudProfile) {
        guard canSend else { return }
        let text = draft
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        let compute = trimmed.hasPrefix("/calc") || trimmed.hasPrefix("/run") || trimmed.hasPrefix("what is ") || trimmed.first.map { "0123456789(~+-".contains($0) } == true
        if peer.is_device && compute {
            computePrompts.append(TomatoComputeRecord(prompt: text)); draft = ""; return
        }
        let peerID = peer.id
        Task {
            if await session.send(text), draft == text, session.selected?.id == peerID { draft = "" }
        }
    }
}

/// One avatar, assigned, no picker. Stable per name so a user keeps their
/// look; the stored profile is the source of truth afterwards.
private func defaultAvatar(for name: String) -> Int {
    var h = 0
    for s in name.lowercased().unicodeScalars { h = (h &* 31) &+ Int(s.value) }
    return abs(h) % 16
}
