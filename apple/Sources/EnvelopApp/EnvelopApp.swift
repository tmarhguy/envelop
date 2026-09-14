import SwiftUI
#if os(macOS)
import AppKit
#endif

/// Envelop iOS/macOS entry. Zero dependencies: SwiftUI + CoreBluetooth +
/// Network only. One screen: the Envelop network (people + Tomato).
/// BLE exists only inside the bridge role (Connect Tomato).
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
