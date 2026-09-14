import SwiftUI

struct CloudView: View {
    @StateObject private var session = CloudSession()
    @State private var name = ""
    @State private var query = ""
    @State private var draft = ""
    var body: some View {
        Group {
            if !session.configured {
                ContentUnavailableView("Connect Envelop to Supabase", systemImage: "network", description: Text("Set ENVELOP_SUPABASE_URL and ENVELOP_SUPABASE_KEY, then relaunch. See backend/README.md for setup."))
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
                                    Text(person.is_device ? (session.tomatoOnline ? "Online" : "Offline") : "@\(person.handle)")
                                        .font(.caption).foregroundStyle(.secondary)
                                }
                            }
                        }.buttonStyle(.plain)
                    }
                    .navigationTitle("Envelop")
                    .toolbar {
                        Button(session.bridgeState == .idle ? "Connect Tomato" : "Disconnect Tomato") {
                            if session.bridgeState == .idle { session.connectTomato() } else { session.disconnectTomato() }
                        }
                    }
                    .safeAreaInset(edge: .bottom) {
                        Text("Bridge: \(session.bridgeState.rawValue)").font(.caption).padding(8)
                    }
                    .searchable(text: $query, prompt: "Find people")
                    .task(id: query) {
                        do { try await Task.sleep(nanoseconds: 250_000_000) } catch { return }
                        await session.search(query)
                    }
                } detail: {
                    if let peer = session.selected {
                        VStack(spacing: 0) {
                            ScrollViewReader { proxy in
                                ScrollView {
                                    LazyVStack(alignment: .leading, spacing: 12) {
                                        ForEach(session.messages) { message in
                                            HStack {
                                                if message.sender_id == session.profile?.id { Spacer(minLength: 40) }
                                                Text(message.body).padding(12)
                                                    .background(message.sender_id == session.profile?.id ? Color.green.opacity(0.15) : Color.gray.opacity(0.12))
                                                    .clipShape(RoundedRectangle(cornerRadius: 14))
                                                if message.sender_id != session.profile?.id { Spacer(minLength: 40) }
                                            }.id(message.id)
                                        }
                                    }.padding()
                                }.onChange(of: session.messages.last?.id) {
                                    if let id = session.messages.last?.id { proxy.scrollTo(id, anchor: .bottom) }
                                }
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
        .onDisappear { session.disconnectTomato() }
    }

    private var canSend: Bool {
        !draft.isEmpty && draft.utf8.count <= 256 && !session.busy
    }

    /// Enter / IME Send / button all share this path. Desktop: Enter sends, Shift+Enter newlines.
    private func sendDraft(to peer: CloudProfile) {
        guard canSend else { return }
        let text = draft
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
