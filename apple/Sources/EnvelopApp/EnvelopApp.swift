import SwiftUI
#if os(macOS)
import AppKit
#endif

/// Envelop macOS entry. Zero dependencies: SwiftUI + CoreBluetooth +
/// Network only. One screen combines test chat with the Tomato bridge role.
@main
public struct EnvelopApp: App {
    public init() {
        #if os(macOS)
        DispatchQueue.main.async {
            NSApplication.shared.activate(ignoringOtherApps: true)
        }
        #endif
    }

    public var body: some Scene {
        WindowGroup {
            CloudView()
        }
    }
}
