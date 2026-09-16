# BLE adapter

Service: `6E400001-B5A3-F393-E0A9-E50E24DCCA9E`.
Central writes RX `6E400002-B5A3-F393-E0A9-E50E24DCCA9E` without response.
Peripheral notifies TX `6E400003-B5A3-F393-E0A9-E50E24DCCA9E`.

This page defines transport behavior for the binary
[Envelop device wire v1](ENVELOP_PROTOCOL.md). Deployment, lease, and recovery
procedures are maintained in [bridge operations](../docs/bridge-operations.md).
The retired LF-delimited transport is not supported.

Scan in the application; no OS pairing workflow. Discover service and both
required characteristic properties, subscribe TX, then send binary HELLO.
Allow 5 seconds for exact HELLO_ACK. Only a verified device may trigger a cloud
lease claim. A familiar advertisement name is a discovery hint, never
verification.

Chunk frames into at most 20 bytes. Preserve ordering across frame boundaries. CoreBluetooth writes without response use `canSendWriteWithoutResponse` and `peripheralIsReady(toSendWriteWithoutResponse:)`; they do not wait for `didWriteValueFor`. Successful BLE enqueue is not device acknowledgment.

Current reconnect scanning is immediate; capped exponential backoff and
background lifecycle recovery remain to implement and test on hardware. Only
one physical BLE slot exists, so disconnect before claiming a new bridge lease.

Reference: [Apple flow control](https://developer.apple.com/documentation/corebluetooth/cbperipheral/cansendwritewithoutresponse), [Adafruit nRF UART](https://learn.adafruit.com/getting-started-with-the-nrf8001-bluefruit-le-breakout/nrf-uart-in-detail).
