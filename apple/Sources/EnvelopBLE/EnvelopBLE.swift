import Foundation
import CoreBluetooth
import EnvelopCore

/// Thin CoreBluetooth central for the frozen wire contract v1.
/// Same file compiles on iOS and macOS. No dependencies.
@MainActor
public final class EnvelopBLE: NSObject, ObservableObject {
    @Published public private(set) var link: EnvelopLinkState = .idle {
        didSet { onLink?(link) }
    }
    @Published public private(set) var peerName: String = "Envelop"
    @Published public private(set) var messages: [EnvelopMessage] = []

    /// Called for each complete received line (main thread).
    public var onLine: ((String) -> Void)?
    public var onBytes: ((Data) -> Void)?
    private var binaryMode = false
    /// Called on every link change (main thread). Used by the net bridge.
    public var onLink: ((EnvelopLinkState) -> Void)?

    private var central: CBCentralManager!
    private var peripheral: CBPeripheral?
    private var rxChar: CBCharacteristic?
    private var txChar: CBCharacteristic?
    private let assembler = EnvelopLineAssembler()
    private var writeQueue = [Data]()
    private var writing = false
    private var shouldScan = false

    private static var service: CBUUID { CBUUID(string: EnvelopWire.serviceUUID) }
    private static var rx: CBUUID { CBUUID(string: EnvelopWire.rxCharacteristicUUID) }
    private static var tx: CBUUID { CBUUID(string: EnvelopWire.txCharacteristicUUID) }

    override public init() {
        super.init()
        central = CBCentralManager(delegate: self, queue: nil)
    }

    public convenience init(binaryMode: Bool) {
        self.init()
        self.binaryMode = binaryMode
    }

    /// Binary frames are never passed through the legacy ASCII filter.
    @discardableResult
    public func sendFrame(_ frame: DeviceFrame) -> Bool {
        guard binaryMode, link.isReady, writeQueue.count < 256 else { return false }
        writeQueue.append(contentsOf: envelopChunks(frame.encoded))
        pumpWrites()
        return true
    }

    // MARK: - Intents (called from SwiftUI)

    public func start() {
        shouldScan = true
        if central.state == .poweredOn { scan() }
    }

    public func stop() {
        shouldScan = false
        if let p = peripheral { central.cancelPeripheralConnection(p) }
        central.stopScan()
        if case .fault = link { } else { link = .idle }
    }

    public func retry() {
        assembler.reset()
        writeQueue.removeAll()
        writing = false
        if let p = peripheral { central.cancelPeripheralConnection(p) }
        peripheral = nil; rxChar = nil; txChar = nil
        start()
    }

    /// Queue one chat message. Returns false if not Ready or empty.
    /// Queued locally — never a claim of remote delivery (no firmware ACK).
    @discardableResult
    public func send(_ text: String) -> Bool {
        guard let data = envelopEncode(text), link.isReady else { return false }
        messages.append(EnvelopMessage(text: displayCopy(text), isMe: true))
        writeQueue.append(contentsOf: envelopChunks(data))
        pumpWrites()
        return true
    }

    /// Bridge path: same wire bytes, no local bubble (relay traffic must
    /// not pollute the direct transcript).
    @discardableResult
    public func sendRaw(_ text: String) -> Bool {
        guard let data = envelopEncode(text), link.isReady else { return false }
        writeQueue.append(contentsOf: envelopChunks(data))
        pumpWrites()
        return true
    }

    public func clearChat() { messages.removeAll() }

    func receiveLines(_ lines: [String]) {
        for l in lines {
            messages.append(EnvelopMessage(text: l, isMe: false))
            onLine?(l)
        }
    }

    private func displayCopy(_ text: String) -> String {
        // Mirror the wire filter so the bubble matches what Tomato receives.
        guard let d = envelopEncode(text) else { return "" }
        return String(bytes: d.dropLast(), encoding: .ascii) ?? ""
    }

    // MARK: - Scan / connect

    private func scan() {
        link = .scanning
        central.scanForPeripherals(withServices: [Self.service], options: nil)
    }

    private func pumpWrites() {
        guard !writing, let p = peripheral, let rx = rxChar,
              !writeQueue.isEmpty, link.isReady else { return }
        // Without-response writes do not invoke didWriteValueFor.
        // Drain only while CoreBluetooth has transmit capacity.
        while !writeQueue.isEmpty, p.canSendWriteWithoutResponse {
            p.writeValue(writeQueue.removeFirst(), for: rx, type: .withoutResponse)
        }
    }
}

// MARK: - CBCentralManagerDelegate
extension EnvelopBLE: CBCentralManagerDelegate {
    nonisolated public func centralManagerDidUpdateState(_ central: CBCentralManager) {
        Task { @MainActor in
            switch central.state {
            case .poweredOn:
                if self.shouldScan { self.scan() }
            case .poweredOff, .unauthorized:
                self.link = .bluetoothOff
            default:
                if self.shouldScan { self.link = .scanning }
            }
        }
    }

    nonisolated public func centralManager(
        _ central: CBCentralManager,
        didDiscover peripheral: CBPeripheral,
        advertisementData: [String: Any],
        rssi RSSI: NSNumber
    ) {
        Task { @MainActor in
            let advName = advertisementData[CBAdvertisementDataLocalNameKey] as? String
            let name = advName ?? peripheral.name ?? ""
            // Accept Envelop first, Tomato for compat, or any UART-service advertiser.
            let ok = name.isEmpty
                || EnvelopWire.acceptedNames.contains(name)
                || EnvelopWire.acceptedNames.contains(where: { name.hasPrefix($0) })
            guard ok else { return }
            self.central.stopScan()
            self.peripheral = peripheral
            self.peerName = EnvelopWire.acceptedNames.contains(name) ? name
                : (name.isEmpty ? "Envelop" : name)
            central.connect(peripheral, options: nil)
        }
    }

    nonisolated public func centralManager(
        _ central: CBCentralManager, didConnect peripheral: CBPeripheral
    ) {
        Task { @MainActor in
            self.link = .connected(subscribed: false)
            peripheral.delegate = self
            peripheral.discoverServices([Self.service])
        }
    }

    nonisolated public func centralManager(
        _ central: CBCentralManager,
        didDisconnectPeripheral peripheral: CBPeripheral, error: Error?
    ) {
        Task { @MainActor in
            guard self.peripheral === peripheral else { return }
            self.peripheral = nil; self.rxChar = nil; self.txChar = nil
            self.assembler.reset()
            self.writeQueue.removeAll()
            self.writing = false
            if self.shouldScan {
                // Peer reboot clears its TX; offer reconnect, never auto-replay.
                self.writeQueue.removeAll()
                self.scan()
            } else {
                self.link = .idle
            }
        }
    }

    nonisolated public func centralManager(
        _ central: CBCentralManager, didFailToConnect peripheral: CBPeripheral, error: Error?
    ) {
        Task { @MainActor in
            self.link = .fault("Connect failed")
            if self.shouldScan {
                Task { @MainActor in
                    try? await Task.sleep(nanoseconds: 1_000_000_000)
                    if self.shouldScan { self.scan() }
                }
            }
        }
    }
}

// MARK: - CBPeripheralDelegate
extension EnvelopBLE: CBPeripheralDelegate {
    nonisolated public func peripheralIsReady(toSendWriteWithoutResponse peripheral: CBPeripheral) {
        Task { @MainActor in
            guard self.peripheral === peripheral else { return }
            self.pumpWrites()
        }
    }

    nonisolated public func peripheral(
        _ peripheral: CBPeripheral, didDiscoverServices error: Error?
    ) {
        Task { @MainActor in
            guard error == nil,
                  let svc = peripheral.services?.first(where: { $0.uuid == Self.service }) else {
                self.link = .fault("No UART service")
                return
            }
            peripheral.discoverCharacteristics([Self.rx, Self.tx], for: svc)
        }
    }

    nonisolated public func peripheral(
        _ peripheral: CBPeripheral,
        didDiscoverCharacteristicsFor service: CBService, error: Error?
    ) {
        Task { @MainActor in
            guard error == nil else { self.link = .fault("No UART chars"); return }
            for c in service.characteristics ?? [] {
                if c.uuid == Self.rx { self.rxChar = c }
                if c.uuid == Self.tx { self.txChar = c }
            }
            guard let tx = self.txChar, tx.properties.contains(.notify),
                  let rx = self.rxChar, rx.properties.contains(.writeWithoutResponse) else {
                self.link = .fault("No UART chars"); return
            }
            peripheral.setNotifyValue(true, for: tx)
        }
    }

    nonisolated public func peripheral(
        _ peripheral: CBPeripheral,
        didUpdateNotificationStateFor characteristic: CBCharacteristic, error: Error?
    ) {
        Task { @MainActor in
            guard characteristic.uuid == Self.tx else { return }
            if error == nil, characteristic.isNotifying {
                self.link = .connected(subscribed: true) // Ready
                self.pumpWrites()
            } else {
                self.link = .connected(subscribed: false)
            }
        }
    }

    nonisolated public func peripheral(
        _ peripheral: CBPeripheral,
        didUpdateValueFor characteristic: CBCharacteristic, error: Error?
    ) {
        Task { @MainActor in
            guard error == nil, characteristic.uuid == Self.tx,
                  let data = characteristic.value, !data.isEmpty else { return }
            if self.binaryMode { self.onBytes?(data) }
            else { self.receiveLines(self.assembler.feed(data)) }
        }
    }

    nonisolated public func peripheral(
        _ peripheral: CBPeripheral,
        didWriteValueFor characteristic: CBCharacteristic, error: Error?
    ) {
        Task { @MainActor in
            self.writing = false
            if error != nil {
                self.link = .fault("Write failed")
                self.writeQueue.removeAll()
                return
            }
            self.pumpWrites()
        }
    }
}
