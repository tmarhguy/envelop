# Envelop Apple (iOS first, macOS shares the core)

Lightest native build. Zero dependencies: SwiftUI + CoreBluetooth +
Network only. One screen: the Envelop network (people + Tomato) with the
bridge role inside. No avatar picker (one assigned avatar), no legacy tabs.

```text
apple/
├── Package.swift            # EnvelopCore + EnvelopBLE + EnvelopApp, iOS 17 / macOS 14
├── Sources/
│   ├── EnvelopCore/          # BLE UART framing + device binary protocol
│   ├── EnvelopBLE/           # CBCentralManager: scan, UART verify, chunked transport
│   └── EnvelopApp/           # CloudView (onboarding/people/DMs) + bridge, Theme
├── Tests/
│   └── EnvelopCoreTests/     # framing + device protocol tests
├── ios/Info.plist           # BT usage strings + bluetooth-central background mode
├── mac/Info.plist           # Mac bundle plist (keep NSBluetoothAlwaysUsageDescription!)
└── Envelop.app/              # built bundle — always run THIS, never .build binary
```

Wire: service `6E400001…`, RX `…0002` write-without-response, TX `…0003`
notify. Name `Envelop`, accept `Tomato` for compat. One LF = one bubble.
Queued locally, never "Delivered".

## Run now (no Xcode needed for logic)

```bash
swift test   # from apple/
```

## Run the app

- macOS (works today, no Xcode): `swift build`, then the script below
  copies the binary + `mac/Info.plist` into the `Envelop.app` bundle and
  opens it. Always launch the **bundle**, never the raw `.build` binary:
  bundle-less executables can't become frontmost, so the window shows but
  never takes keyboard focus. The bundle plist must keep
  `NSBluetoothAlwaysUsageDescription` or TCC kills the app at first
  `CBCentralManager` use (see DiagnosticReports `__TCC_CRASHING…`).

```bash
swift build
mkdir -p Envelop.app/Contents/MacOS
cp .build/debug/Envelop Envelop.app/Contents/MacOS/Envelop
cp mac/Info.plist Envelop.app/Contents/Info.plist
open Envelop.app   # allow Bluetooth when macOS asks
```
- iPhone: full Xcode required (`xcodebuild` today is CLT-only on this Mac,
  so device builds wait on Xcode). Open `apple/` in Xcode, pick an iPhone
  simulator/device, Run. Add `ios/Info.plist` keys + AppIcon to the Xcode
  target when creating it (File > New > Project > iOS App, then drag in
  `Sources/`).
```

Icon: red circle + white paper plane (`EnvelopAvatar`). Export a real
`AppIcon` from `assets/icon/envelop.svg` when it lands.

## Composer

Desktop: **Enter** sends; **Shift+Enter** inserts a newline. iPhone/iPad keep a visible **Send** button; the soft keyboard uses the Send action.
