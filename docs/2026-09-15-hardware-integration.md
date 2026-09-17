# Physical Tomato bridge recovery

> **Dated historical evidence, not current status.** This record is
> noncanonical outside its named setup. See [status.md](status.md) for current
> facts and unknowns.

The missing HELLO acknowledgement was not the failure: the native app reached
the verified-device state, but `claim_bridge` rejected its account because its
device-specific grant was missing. Provisioned only the existing Mac profile
for Tomato through the project's SQL editor. No global grant or anonymous-auth
relaxation was needed. Existing profile name was already Tyrone Marhguy.

On the physical FPGA, the five queued messages changed to `acked` at
2026-09-15 05:50:50 UTC. Tomato's `Hello, Tyrone` reply was stored under its
device identity at 05:50:50.659148 UTC and appeared in the native Mac app.
This test used the real nRF8001 connection, not the simulated demo phone.

Follow-up client fixes:
- Decode empty successful void-RPC bodies as JSON null. Still reject empty
  required responses and malformed JSON. This fixes the misleading format
  error following a successful device-acknowledgement RPC.
- Send STATUS online/internet-lost to Tomato after bridge cycle outcomes.
- Add Edit name and an authenticated `update_profile_name` RPC that changes
  only the caller's human display name, preserving handle/identity/permissions.

Tests: firmware protocol bench passes; Swift response-decoding regressions pass;
14 PostgreSQL/PGlite backend tests pass, including name validation and isolation.
The native app was rebuilt. Final post-rebuild interactive verification remains
pending while macOS/app access is unresponsive, potentially at a Keychain prompt.

Reproduce: open Envelop on Tomato; open the Mac app; Connect Tomato; wait for
online; open Tomato conversation; send `Hi`. Expect `Hello, Tyrone`, and verify
the incoming device queue row is `acked`. Repeat with ordinary ASCII text to
check receipt without automatic greeting. Keep Tomato's Envelop screen open.
