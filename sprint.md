# Envelop — native BLE chat for Tomato

## Outcome and scope

Envelop is the phone/desktop side of Tomato Chat: four tiny native apps that
find the Tomato FPGA over Bluetooth Low Energy and text it like a real
chat app. Light, snappy, icon included, nothing crazy.

`Phone/Desktop GATT <-> nRF8001 <-> ACI SPI RTL <-> BLE engine <-> MMIO <-> Tomato OS`

This is app-to-app BLE text, not SMS / iMessage / Messages integration.
The custom apps are this repo. The FPGA side is already working in
`../tomato` (`sprint.md`, `hardware/fpga/core/rtl/nrf8001*.v`,
`software/os/tomato_os.s` screen `screen_tomato_chat`).

Branding rule: it is Envelop, as if it was never Tomato. UI strings say
Envelop. Code/docs may reference `Tomato` only where the radio still
advertises it (compat, see below).

## Frozen wire contract v1 (do not change without a new version)

Source: `../tomato/sprint.md` + `vendor/nrf8001/services.h` (Adafruit
`5b331b3`, Nordic notice retained) + `rtl/nrf8001.v`.

- **Radio:** nRF8001 BLE peripheral, Nordic UART service over BLE.
  Not classic Bluetooth SPP, not a serial port.
- **Advertised short name:** `Tomato` today (6 chars, 7-char pipe-1 limit).
  Next firmware rev renames to `Envelop` (also 6 chars, no GATT rework).
  All four apps MUST accept both names and prefer `Envelop`.
- **Service:** `6E400001-B5A3-F393-E0A9-E50E24DCCA9E`
- **RX (central -> Tomato):** `6E400002-...` — Write Without Response only
  (`Write Command`). Pipe 2. Cap each write at 20 bytes.
- **TX (Tomato -> central):** `6E400003-...` — Notify only. Pipe 3.
  Subscribe to notifications before calling it "Ready". Up to 20 bytes
  per notification, fragmented arbitrarily.
- **Framing:** ASCII text + LF (`0x0A`). Ignore CR (`0x0D`) on receive.
  Displayable: `32..126` + LF. Filter everything else. No UTF-8, no ACKs,
  no encryption/pairing policy in v1.
- **Limits:** 95 printable chars + LF = 96 bytes max per message on the
  wire. FPGA has one 96-byte staged TX buffer and a 256-byte RX FIFO with
  sticky overflow. Longer local drafts must be blocked client-side with
  `Draft full` behavior matching the OS.
- **Segmentation:** BLE writes/notifications can split anywhere, including
  across LF boundaries. Reassemble by accumulating bytes until LF.
  One LF = one bubble.
- **Link states (mirror the OS labels):**
  `Starting / Advertising / Connected / Ready (subscribed) / Fault / Overflow`.
  `Connected` != `Ready`. `Ready` requires TX notifications enabled.
  `Queued` is local acceptance, never remote delivery — no firmware ACK
  exists, so the apps must never show "Delivered/Read".
- **Disconnect:** clears unsent Tomato TX, restarts advertising. Apps
  auto-offer reconnect, never auto-replay without user action.

## UX spec (all four apps, same behavior)

Like a real texting app, minimal:

- One conversation view: transcript bubbles (me / Tomato), composer,
  Send. Timestamps local-only. No accounts, no cloud, no history sync.
- Header: Envelop icon + peer name (`Envelop`/`Tomato`) + state pill
  (Scanning / Advertising found / Connected / Ready / Fault / Overflow).
- Composer: single-line + Send, 95-char counter, disabled unless Ready.
  Send appends LF, chunks 20, writes without response with central-side
  flow control. Keep draft on failed send.
- Transcript: append on each LF, ignore CR, filter controls. Persist
  locally per install (last N messages, plain file / SwiftData / Room /
  local JSON — no server). Clear-chat action.
- Retry / Reconnect button maps to "Retry radio" intent: unsubscribe,
  disconnect, rescan, resubscribe. Never claim delivery.
- Light + dark mode, Dynamic Type / system font scaling, keyboard-safe,
  haptics on send/receive where free (iOS/Android).
- Cold start < ~1s, idle-zero CPU (no polling loops; event-driven BLE
  callbacks), binary < ~10 MB target per platform.

## Architecture (one contract, thin native shells)

No Electron, no WebView, no shared heavy runtime. Three small codebases
covering four apps:

1. `apple/` — one Swift package, two targets: iOS + macOS (SwiftUI +
   CoreBluetooth). ~90% shared. iOS ships first.
2. `android/` — Kotlin + Jetpack Compose + `android.bluetooth.le` /
   `BluetoothGatt`. No Compose-Multiplatform, no Flutter.
3. `windows/` — WinUI 3 (Windows App SDK) + C# +
   `Windows.Devices.Bluetooth`. MSIX packaged. No Electron/Tauri.

Shared non-code asset: `docs/wire-contract.md` (copy of the section
above) + `test/interop.md` checklist so all four behave identically.

## Repo map (what we will build)

```text
envelop/
├── sprint.md               # this file
├── docs/
│   └── wire-contract.md    # frozen v1, copied from above
├── assets/
│   └── icon/               # envelop glyph, svg + exported png/icns/ico
├── apple/                  # SwiftUI + CoreBluetooth, iOS + macOS targets
├── android/                # Kotlin + Compose, minSdk 26 (BLE scan stable)
├── windows/                # WinUI3 + C#, msix packaging
└── test/
    └── interop.md          # same 10-step check per platform
```

## Platform plans

### 1. iOS (first, validates the contract)

- Stack: SwiftUI, `CBCentralManager` + `CBPeripheral`, `CoreBluetooth`
  background mode `bluetooth-central`. Min iOS 17.
- Info: `NSBluetoothAlwaysUsageDescription` + `NSBluetoothPeripheralUsageDescription`.
- Flow: scan for service `6E400001...` -> connect (1 peripheral) ->
  discover services -> discover `...0002` + `...0003` -> subscribe to
  `...0003` (`setNotifyValue(true)`) -> Ready. Write to `...0002` with
  `.withoutResponse`, 20-byte chunks. Reassemble notifies until LF.
- Handle: `centralManagerDidUpdateState`, MAC rotation (use stored
  peripheral UUID, not MAC), disconnect -> pill back to Scanning +
  auto-rescan with backoff, unsubscribe handling.
- Ship: icon, launch screen, TestFlight, then App Store.

### 2. Android (second)

- Stack: Kotlin, Compose Material3, `BluetoothLeScanner` +
  `BluetoothGatt`. minSdk 26, target latest. No extra BLE lib.
- Permissions: `BLUETOOTH_SCAN` + `BLUETOOTH_CONNECT` (API 31+),
  `ACCESS_FINE_LOCATION` only for API <= 30 scan. Runtime request in-app.
  Require Location ON prompt where needed.
- Flow: `ScanFilter(serviceUuid)` -> `connectGatt(autoConnect=false)` ->
  `discoverServices()` -> enable TX notify (`setCharacteristicNotification`
  + write CCCD `0x2902` = `ENABLE_NOTIFICATION_VALUE`) -> Ready. Write RX
  with `WRITE_TYPE_NO_RESPONSE`, 20-byte chunks, `onCharacteristicWrite`
  chains next chunk. Reassemble `onCharacteristicChanged` until LF.
  MTU: request 23+ but never assume >20 payload (nRF8001 is BLE 4.0).
- Handle: Gatt 133 / 8 retries with disconnect+rescan, bond-none (no
  pairing in v1), Doze-safe reconnect via user tap, not a foreground
  service in v1.
- Ship: adaptive icon, signed AAB.

### 3. macOS / MacBook (third, reuses iOS core)

- Same `apple/` package, native macOS target (not Catalyst shim).
  SwiftUI + CoreBluetooth, hardened runtime + Bluetooth entitlement.
  Min macOS 14.
- Same flow as iOS. Extra: menu-bar state, Cmd+K clear, paste handling
  (strip to 95 printable + LF). Notarized DMG + App Store path.
- Verify coexistence: iOS and macOS never both hold the link (nRF8001 =
  one central). Show "Peer busy" hint if connect fails while bonded
  elsewhere.

### 4. Windows (fourth)

- Stack: WinUI 3 (Windows App SDK 1.5+), C#, `Windows.Devices.Bluetooth`.
  `Package.appxmanifest`: `bluetooth` capability. Win10 1809+ / Win11.
- Flow: `BluetoothLEAdvertisementWatcher` filtered on service UUID ->
  `BluetoothLEDevice.FromBluetoothAddressAsync` -> `GetGattServicesAsync`
  -> RX/TX `GattCharacteristic` -> `WriteClientCharacteristicConfigurationDescriptorAsync(Notify)`
  -> Ready. `WriteValueWithResultAsync(..., NoResponse)`, 20-byte chunks.
  `ValueChanged` reassembly until LF.
- Handle: watcher stop on connect, device disconnect `ConnectionStatusChanged`
  -> rescan, unpaired flow (no PIN in v1), MSIX sideload + Store.
- Snappy rule: AOT-friendly, no WebView2, no React Native Windows.

### Icon + packaging (once, shared)

- One envelop glyph, flat + mono variants: `assets/icon/envelop.svg`.
  Export: iOS `AppIcon`, Android adaptive `mipmap`, macOS `icns`,
  Windows `.ico` + MSIX tile. No photo assets in-app (keeps binaries small).

## Work and acceptance gates

- [ ] Freeze `docs/wire-contract.md` v1 + `test/interop.md` (this sprint).
- [ ] Draw `assets/icon/envelop.svg` + exports (all four pick it up).
- [ ] iOS MVP: scan/connect/subscribe/send/receive/reconnect.
- [ ] Android MVP: same.
- [ ] macOS target from shared Apple core.
- [ ] Windows MVP: same.
- [ ] Interop pass per platform against real Tomato (not sim):
  1. discover `Tomato`/`Envelop` + UART service
  2. subscribe `...0003` -> pill flips Connected -> Ready
  3. central writes `hello\n` (no-response, <=20B) -> Tomato shows it
  4. Tomato composes reply -> central gets notify bubble (maybe fragmented)
  5. 95-char max + LF; 96th char blocked client-side
  6. 20/21-byte boundary + split-LF reassembly
  7. disconnect/reconnect, unsubscribe/resubscribe, radio reboot — no
     frozen UI, no auto-duplicate replay, no false "Delivered"
  8. overflow/fault surfaces as pill, Retry recovers
- [ ] Store/packaging: TestFlight + Play internal + DMG/MSIX sideload.
- [ ] Rename radio to `Envelop` (firmware follow-up in `../tomato`);
  apps already accept both so no app update needed.

## Test matrix (per platform, against hardware)

Transport: 20B exact, 21B split, 95+LF max, back-to-back messages,
split-across-notify LF, CR ignored, control bytes filtered, zero-length
notify ignored. Link: airplane toggle, walk-away disconnect, kill app
mid-send (draft retained), reboot FPGA mid-chat, unsubscribe alone.
Regression: existing `../tomato` sim suite untouched; apps never depend
on sim framebuffer.

Hardware acceptance is separate from simulation. Do not mark radio
delivery verified from a testbench, build log, or local queue.

## Non-goals (v1, direct BLE)

No SMS/iMessage bridge, no UTF-8/emoji wire support (display may render
emoji locally but wire stays ASCII+LF), no cloud backup, no pairing/PIN
policy change, no firmware GATT layout change (that needs nRFgo Studio
regen + `gen_nrf8001_setup.py --check`). Multi-peer/group chat is NOT a
v1 direct-BLE goal — it lives in the relay plan below (wire v2).

## Group chat via relay (planned, wire v2)

Why a relay: the nRF8001 is a single-connection peripheral (one
`connected` flag in `rtl/nrf8001.v`). Two phones cannot hold the BLE
link at once, and the nRF8001 cannot do BLE Mesh. So group chat keeps
direct BLE untouched and adds one hub that owns the single BLE slot:

```text
[iPhone] --WiFi/TCP-->                 --BLE--> [nRF8001] --> Tomato
[Android]--WiFi/TCP--> [Envelop Relay]  --BLE--> (single link, unchanged v1)
[Mac]    --WiFi/TCP-->  (fan-out, serializes)
```

- **Relay host (recommended first): this MacBook.** It already runs
  `Envelop.app` and can hold BLE to Tomato while serving phones on local
  WiFi. Later: Pi or tiny cloud VM (same binary). No FPGA change.
- **Relay impl: Python stdlib asyncio, zero deps** (matches the tomato
  toolchain; `software/assembler.py` precedent). One TCP port, LF framing
  like the wire contract — no JSON, no broker to install.
- **Wire v2 (group, still ASCII+LF):**
  - Phone joins: `+NAME\n` (NAME = ≤8 printable chars, first-come-wins).
  - Phone sends: bytes go to all phones + Tomato as `NAME: text\n`.
  - Tomato sends: relay tags it `TOMATO: text\n` to all phones, never
    echoes it back to Tomato (loop guard).
  - Presence: relay broadcasts `* NAME joined/left\n`.
  - The `NAME: ` prefix comes out of the 95-char budget, so long lines
    truncate — same 96B cap, no firmware change needed. Tomato displays
    whatever bytes arrive, so **zero Tomato changes** for v1 of group.
- **Pacing (no ACKs exist):** relay writes to Tomato serially with a
  small gap (~300 ms) so bursts from N phones don't overrun the 256B RX
  FIFO / single 96B TX slot. Queued-not-delivered rule still applies.
- **Apps:** add a transport switch — Direct BLE (1:1, today's UI) vs
  Relay (type host:port once, pick a name). Group transcript colors: me
  green, Tomato red, others neutral with a name tag. Same 95 counter.
- **Trust model v1:** same room = same WiFi = same trust as BLE
  proximity. No auth, no TLS on LAN. Public/remote relay (TLS + room
  code) is a follow-up, not v1.
- **Phases:** 1) `relay/` server + loopback tests (fake Tomato over TCP);
  2) relay↔real Tomato 1:1 parity; 3) 2–3 phones + Tomato group test;
  4) app Relay mode (Apple first, then Android/Windows); 5) presence +
  pacing polish.
- **Acceptance:** 3 clients + Tomato exchange 20 messages in any order —
  every phone shows the same transcript in the same order, Tomato shows
  each line tagged, no echo back to sender-side Tomato, kill/rejoin one
  phone loses nothing but its own gap, relay restart resubscribes BLE
  without duplicating the last Tomato line.
- **Won't work (saying no upfront):** multi-connect direct to the radio,
  BLE Mesh on nRF8001 hardware, and iMessage/SMS bridging.

## Sources and provenance

- `../tomato/sprint.md` — MMIO `0x380010..17`, pipe 2 RX / pipe 3 TX,
  20B ACI sends, 96B TX / 256B RX, LF framing.
- `../tomato/hardware/fpga/core/vendor/nrf8001/services.h` + `README.md`
  — 21 setup records, pipes 1-4, Nordic notice (not relicensed).
- `../tomato/hardware/fpga/core/rtl/nrf8001.v` — name `Tomato`, 7-char
  limit, credit/subscribe gating, fault codes.
- `../tomato/software/os/tomato_os.s` — 95-char bound, LF send, latest-line
  pane (phones do full transcript instead).
- `../tomato/docs/log/2026-09-14 - Envelop - Tomato gets a message app.md`
  — name origin: envelops were message transmitters.

## Run log

- Sep 14: sprint frozen. Envelop repo empty (`main`, no commits yet).
  FPGA side already texts a generic BLE central. Next: wire-contract doc
  + icon + iOS MVP.
- Sep 14: iOS MVP scaffolded in `apple/` (SPM, zero deps: SwiftUI +
  CoreBluetooth). `EnvelopCore` (LF framing, 95-cap, 20B chunks, CR ignore),
  `EnvelopBLE` (scan UART service, subscribe TX `…0003`, write RX `…0002`
  without response, Envelop/Tomato names), `EnvelopApp` (white+red chat:
  red sender, white receiver, state pill, 95 counter, queued-not-delivered
  hint). `swift test`: build clean, 5/5 contract tests pass on macOS SDK.
  iPhone device build waits on full Xcode (this Mac is CLT-only).
- Sep 14: UI fixes from live Mac run: composer no longer disabled while
  Scanning (typing always works, only Send needs Ready); bubbles swapped
  to green sender / red receiver. Rebuilt, 5/5 tests pass, relaunched.
- Sep 14: keyboard root-caused. The raw `.build` binary can't activate
  (never frontmost, never key) so its window ignored typing; the first
  hand-made `Envelop.app` died at launch from TCC (missing
  `NSBluetoothAlwaysUsageDescription`). Fixed with tracked
  `apple/mac/Info.plist` (BT description) + `NSApp.activate` on launch.
  Bundle launches frontmost; typing works. Rule: always run `Envelop.app`.
- Sep 14: group chat BUILT (room vs people, first-device-hosts).
  `docs/net-protocol.md` spec; `relay/server.py` (stdlib asyncio: TCP
  room/DM/WHO/presence, UDP beacons, single-host claim, --echo Tomato,
  300ms radio pacing) + `relay/test_group.py` 13/13 live PASS;
  `apple/Sources/EnvelopNet` (Swift mirror: discovery, NW client,
  embedded host, BLE bridge) + Room|People|DM UI with Direct/Group
  switch. `swift test`: 10 unit + 2 live loopback (Swift NW client vs
  real Python relay) all green. Bundle rebuilt, relaunched.
- Sep 14: renamed Pigeon -> Envelop everywhere (name taken). Mechanical
  case-preserving replace over 58 files + 23 path renames (modules,
  bundle `com.tmarhguy.envelop`, beacon `ENVELOP1`, SQL schema,
  xcodeproj regenerated from sources). Verified: `swift test` 17/17
  green (7 XCTest + 10 swift-testing), `relay/test_group.py` 13/13,
  `Envelop.app` rebuilt + launched. Repo + folder rename to follow.
- Sep 14: repo renamed `tmarhguy/pigeon` -> `tmarhguy/envelop` (remote
  briefly read `envelope`; corrected to the confirmed `envelop`),
  origin URL updated, local folder moved to `.../GitHub/envelop`.
  Final state from new home: zero `pigeon` strings in source (fresh
  binary has zero too), `swift test` 17/17 green, relay 13/13,
  `Envelop.app` relaunched and frontmost.
- Sep 14: Supabase wired, secrets-first. Root `.env` (gitignored, 600) holds
  URL + publishable + secret; `.env.example` is the committable template.
  Verified: publishable key reaches PostgREST (schema-cache 404 proves a
  live project + valid key) and `profiles` is absent, so migration
  `backend/migrations/001_envelop.sql` still awaits the dashboard SQL
  editor. Clients audited: Apple (env/plist), Android (in-app +
  Keystore), Windows (in-app + DPAPI) take the publishable key only;
  no service-role/secret string in any app source. Mac bundle rebuilt
  with URL+publishable injected at build time, relaunched.
- Sep 14: legacy out, one avatar. CloudView onboarding lost the 16-avatar
  picker (stable avatar auto-assigned from the name, stored profile stays
  source of truth). Removed the Legacy BLE / Legacy LAN tabs and the whole
  LAN group-chat stack: ChatView/NetViews/Session, EnvelopNet target +
  tests, EnvelopCore net codec + tests, relay/ server+harness, and
  docs/net-protocol.md (spec 1.0 bans group chats). App is CloudView only;
  BLE lives solely in the bridge role. `swift test` green (5 XCTest + 5
  swift-testing), xcodeproj regenerated, bundle rebuilt with cloud config,
  relaunched.
- Sep 14: live Supabase smoke test (`backend/smoke-live.sh`, key/env from
  gitignored `.env`, one anon user, zero row writes). Live result: project
  reachable + key valid, but migration NOT applied (no `profiles` table)
  and anonymous sign-ins DISABLED — both are dashboard flips. Local
  backend suite (`node backend/tests.mjs`, PGlite): 13/13 PASS, so the
  SQL/RLS/lease logic is proven pending those two switches.
- Sep 14: verified blue check (#1D9BF0) on every surface: Apple uses a
  blue `checkmark.seal.fill` badge, Android a blue AnnotatedString ✓,
  Windows blue Runs (roster, title, presence), website blue `.verified`.
  Avatar pickers also removed on Android + Windows (same stable
  name-hash default as Apple). Apple tests green, bundle relaunched.
  Android/Windows edits are review-only here (no SDKs on this Mac).
- Sep 14: download page auto-detect. `website/` gained a FOR THIS DEVICE
  hero box (UA + userAgentData + touch detection: mac/ios/ipad/android/
  windows, iPadOS touch-masquerade handled) above an ALL DOWNLOADS
  scroll-snap row of the six platform cards. Detection is a pure
  node-tested function (6/6 UA cases); hero reuses each card's own
  requirements + availability + download/install link. Verified with
  headless-Chrome screenshots at desktop + 390px widths.
- Sep 14: no-store distribution, Mac ships. `website/downloads/
  envelop-mac-0.2.0.zip` (316KB, ditto-packed) is live in releases.json,
  so the hero box auto-flips to a green Download button on Macs.
  Install copy rewritten per platform: Mac right-click-Open unsigned
  flow, iPhone Xcode-cable/AltStore (no store, honestly fiddly),
  Android one-toggle APK sideload, Windows SmartScreen Run-anyway +
  self-contained exe. APK + Windows archive still need native builds.
- Sep 14: web pass. Custom `website/404.html` ("This page doesn't exist.
  Tomato does." + dorm origin story + first-third-party-app claim + three
  doors). All link/button arrow glyphs removed (index + app.js; route
  diagram keeps its explanatory arrows). Tomato linked properly: GitHub
  repo + paper from the card and Connect-Tomato details, framed as the
  first third-party app on the dorm-built computer. Screenshots at
  desktop + phone widths confirm hero, row, and 404.
