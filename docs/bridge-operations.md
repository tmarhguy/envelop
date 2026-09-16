# Bridge operations

This runbook applies to the macOS operator bridge and the private Android
bridge. Public users do not operate a bridge.

## Policy

- Keep native bridge packages and package URLs private.
- Provision bridge permission in the backend; do not embed privileged
  credentials in an app.
- Configure only the Supabase HTTPS URL and public publishable/anonymous key.
- Permit one nearby operator-controlled bridge at a time.
- Do not call a bridge “online” from source or package availability alone.

Tomato's nRF8001 accepts one radio connection. The backend independently grants
one 30-second authenticated lease per device. Both constraints matter: a BLE
connection without a valid lease must not forward cloud traffic, and a lease
must not be claimed before Tomato identity verification.

## Connect

1. Confirm the bridge account has a Tomato grant. The private owner receives
   one through `envelop_private.bootstrap_owner(uuid)`.
2. Start the native app near Tomato and connect to the Nordic UART GATT service.
3. Subscribe to notifications and send binary `HELLO`.
4. Require the exact `ENVELOP/1` Tomato identity response. Reject a Bluetooth
   name, malformed response, old line protocol, or timeout.
5. Create a fresh bridge-instance UUID, claim the backend lease, and renew it
   while connected.
6. Begin the device projection with `CONTACT_RESET`, then synchronize routes,
   queued messages, and jobs.

This identity check establishes protocol identity only. It does not establish
general cryptographic authenticity.

## Normal operation

- Forward queued messages with stable session delivery tokens.
- Mark a queue item acknowledged only after Tomato returns `MESSAGE_ACK`.
- For Tomato replies, call `send_as_device` with a stable nonce before
  acknowledging Tomato.
- Keep bridge lease, human presence, and message state separate.
- Claim compute work before forwarding it. Complete a job only from the
  matching `COMPUTE_RESULT`.
- Treat timeout, lease loss, disconnect, or an ambiguous claimed job as an
  unknown hardware outcome. Never replay it through Virtual Tomato.

## Disconnect and takeover

On disconnect or lease loss, stop cloud forwarding and clear partial frames,
routes, tokens, pending BLE writes, announced contacts, and compute waiters. A
reconnect creates a new bridge instance and starts with `CONTACT_RESET`.

Do not force takeover of an unexpired lease. Allow it to expire or release it
from the matching bridge instance. The 30-second lease is a fencing mechanism,
not proof that the physical radio is healthy.

## Recovery checklist

- **Peer fails verification:** stop; confirm matching protocol and firmware.
- **“Bridge account not provisioned”:** provision the intended operator in the
  dashboard/backend. Do not widen anonymous grants.
- **“Device already leased”:** find the existing operator or wait for expiry.
- **“lease lost”:** stop forwarding, clear session state, and reconnect.
- **Internet loss:** retain backend/device truth; do not acknowledge work that
  was not durably accepted.
- **Ambiguous compute:** leave the job unresolved for explicit operator/user
  handling; do not manufacture a virtual result.

## Acceptance evidence

A live acceptance record should identify the backend schema revision, bridge
source/package version, Tomato firmware revision, physical device, date, and
the exact message/compute sequence exercised. Local codec tests are useful but
are not physical acceptance. The dated
[2026-09-15 integration record](2026-09-15-hardware-integration.md) is
historical evidence for its named setup, not a current-online claim.
