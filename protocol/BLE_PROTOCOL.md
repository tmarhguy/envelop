# BLE adapter

Service: `6E400001-B5A3-F393-E0A9-E50E24DCCA9E`.
Central writes RX `6E400002-B5A3-F393-E0A9-E50E24DCCA9E` without response.
Peripheral notifies TX `6E400003-B5A3-F393-E0A9-E50E24DCCA9E`.

Scan in the application; no OS pairing workflow. Discover service and both required characteristic properties, subscribe TX, then send binary HELLO. Allow 5 seconds for exact HELLO_ACK. Only a verified device may trigger a cloud lease claim. A familiar advertisement name is a discovery hint, never verification.

Chunk frames into at most 20 bytes. Preserve ordering across frame boundaries. CoreBluetooth writes without response use `canSendWriteWithoutResponse` and `peripheralIsReady(toSendWriteWithoutResponse:)`; they do not wait for `didWriteValueFor`. Successful BLE enqueue is not device acknowledgment.

Cloud lease expires after 30 seconds. The initial Apple bridge renews and polls the durable queue every 3 seconds (Realtime is not yet wired). On Internet error it attempts release; if unreachable, expiry marks Tomato offline. On physical loss clear parser and route state, release the old instance, and verify again before claiming a new instance. UI presence comes from an unexpired server lease, not BLE readiness.

Current reconnect scanning is immediate, inherited from the prototype; capped exponential backoff and background lifecycle recovery remain to implement and test on hardware. Only one physical BLE slot exists — disconnect before claiming a new bridge lease.

Reference: [Apple flow control](https://developer.apple.com/documentation/corebluetooth/cbperipheral/cansendwritewithoutresponse), [Adafruit nRF UART](https://learn.adafruit.com/getting-started-with-the-nrf8001-bluefruit-le-breakout/nrf-uart-in-detail).
