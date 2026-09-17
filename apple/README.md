# Envelop for macOS

The 0.2.0 Mac app is a macOS 14 operator bridge and test chat client. It is not
the general public client; ordinary users use the browser.

## Run checks

```sh
swift test
```

## Build the app bundle

```sh
./package-app.sh
```

The script builds the SwiftPM executable and writes an unsigned local app bundle
and ZIP under the gitignored `private-builds/` directory. Set
`ENVELOP_APPLE_OUT` to use another private local output directory. These
artifacts are not hosted or distributed from the repository. Launch the bundle
rather than the raw `.build` executable so Bluetooth permission and keyboard
focus work correctly.

The bridge uses Nordic UART service
`6E400001-B5A3-F393-E0A9-E50E24DCCA9E`, requires Tomato's exact binary
`ENVELOP/1` identity, then claims the backend bridge lease. This is protocol
identity verification, not general cryptographic attestation.

The Mac and private Android apps implement the same nearby bridge role. Tomato
still has one radio connection, and the backend independently permits one
unexpired authenticated lease. On disconnect or lease loss, session routes,
tokens, pending writes, partial frames, and compute waiters must be discarded.
See [bridge operations](../docs/bridge-operations.md).

Packaging and Swift tests verify source behavior only. They do not prove which
backend revision is deployed or that matching Tomato hardware is online.

This package targets macOS only.
