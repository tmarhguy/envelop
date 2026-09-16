# Envelop current specification

This document summarizes the current product contract. When it conflicts with
implementation, follow [documentation authority](docs/documentation-policy.md)
and reconcile this file.

## Product and platforms

The website is Envelop's general chat client. Tomato is a pinned device contact.
A macOS 14 operator app or private Android 0.2.0 owner app physically near
Tomato may bridge it. Windows and iOS native clients are retired; ordinary
users on those platforms use the browser.

The canonical path is:

```text
person → Envelop web app → backend queue → nearby verified bridge
       → Envelop in Tomato OS → Tomato CPU → labeled reply
```

## Bridge ownership

Tomato exposes one nRF8001 BLE UART connection, so only one bridge can be
physically connected. The backend independently fences bridge access with one
30-second authenticated lease. A bridge must:

1. connect to the Nordic UART GATT service;
2. subscribe to Tomato notifications;
3. send binary `HELLO`;
4. receive the exact `ENVELOP/1` Tomato identity;
5. create a fresh bridge-instance UUID; and
6. only then claim and renew the cloud lease.

The identity response verifies this protocol identity; it is not general
cryptographic attestation. Bridge accounts are privately operator-provisioned.
A public user, package, or publishable key does not confer bridge permission.

Disconnecting clears partial frames, routes, delivery tokens, pending BLE
writes, and compute waiters. Reconnection starts a new bridge instance and
device projection with `CONTACT_RESET`.

## Messaging delivery

Human-to-Tomato messages remain in the backend queue until Tomato returns
`MESSAGE_ACK` and the active bridge records that acknowledgement. Retries retain
the same delivery token. Rendering is at least once over reconnect and power
loss; exactly-once display is not claimed.

Tomato-to-human messages use a stable nonce per Tomato token. The bridge returns
`MESSAGE_ACK` to Tomato only after the backend accepts `send_as_device`.
Acknowledgement means protocol/backend acceptance, not human read state.

Device text is printable ASCII, 1–256 bytes. Cloud UUIDs never cross the device
link; routes and tokens are session-local.

## Compute provenance

Hardware compute jobs use the leased path and `COMPUTE_JOB` /
`COMPUTE_RESULT`. A completed backend hardware job may be labeled **Physical
Tomato** or **Hardware Tomato**. A timeout, disconnect, or ambiguous claimed job
has an unknown hardware outcome and must not be invented or replayed virtually.

Browser fallback is a separate terminal **Virtual Tomato** execution. It is
visibly labeled, never sent to the FPGA, and never queued for later hardware
execution.

## Backend lifecycle

`backend/migrations/001_envelop.sql` is the sole schema and is destructive. It
drops and recreates Envelop state rather than incrementally upgrading it.
Backups, disposable staging, restoration rehearsal, and an explicit recovery
plan are required before using it on a hosted project.

Owner bootstrap is dashboard-only. Losing the private Android app's local owner
identity requires preserving needed data, performing a clean schema reset, and
bootstrapping the replacement profile. Secret or service-role keys must never
ship in clients.

## Acceptance boundary

- Shared framing vectors establish codec agreement, not a live BLE session.
- Backend regression tests establish local schema contracts, not hosted state.
- Native tests establish source behavior, not current hardware availability.
- Physical acceptance must identify backend, bridge, firmware, device, date,
  and exercised sequence.

Current unknowns and evidence are tracked in [docs/status.md](docs/status.md).
