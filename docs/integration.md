# Integration status

SPEC.md is the target architecture. This file records what the workspace actually implements and what remains unverified.

## Architecture decisions

- Binary PG/CRC framing is the device protocol. Legacy LF Tomato chat firmware cannot answer HELLO_ACK and intentionally fails verification. No fallback may advertise it as an Internet bridge.
- Supabase owns history and queues. Direct BLE/LAN prototypes were removed from this tree; they are not the Internet backend.
- Two canonical participant columns enforce exactly-two-member DMs. `conversation_members` is a security-invoker compatibility view.
- A static HELLO does not authenticate a physical device to a remote server. Bridge accounts need a server-provisioned grant (`envelop_private.bridge_grants`); the app contains no privileged key.
- Anonymous handles use UUID-derived suffixes for uniqueness rather than the short human-friendly example in SPEC.
- The first Internet implementation uses bounded polling (~3s). Realtime can later accelerate the same durable queries.
- Composer: Enter sends on desktop (Shift+Enter newline); mobile keeps a visible Send control and IME Send.

## Acceptance tracking

| Test | Current evidence | Still required |
|---|---|---|
| A human messaging | Clients + `001_envelop.sql` + PGlite suite | Deploy migration; two real accounts; close/reopen recovery |
| B offline Tomato | Queue trigger and offline UI | Live Supabase trigger/RLS confirmation |
| C attach/flush | Binary codec vectors; Apple bridge orchestration | Firmware HELLO/ACK; provisioned account; physical BLE |
| D Tomato reply | Route lookup and protected `send_as_device` | Hardware composer and reply test |
| E handoff | Lease ownership/expiry SQL and disconnect release | Two physical bridges, kill/offline/expiry testing |

## Remaining implementation

1. Apply `backend/migrations/001_envelop.sql` on a disposable Supabase project and run live smoke.
2. Attach `tomato/protocol/envelop.c` to the nRF8001 byte path with semantic validation, eight-contact projection, and token deduplication.
3. Complete history projection and contact paging; bridge announces up to eight conversations with queued messages today.
4. Add mock HTTP/clock/radio integration tests for Apple orchestration races.
5. Replace immediate reconnect scans with capped backoff; test stale CoreBluetooth callbacks on hardware.
6. Add Realtime, recents, paginated people results.
7. Ship signed store-ready iOS/Android/Windows builds.

## Local verification (2026-09-14)

- Swift package tests: DeviceProtocol XCTest cases + wire-contract Swift Testing suite passed.
- Portable C codec: six shared vectors passed encoding, fragmentation splits, and CRC recovery.
- Backend: `node backend/tests.mjs` — 13 PGlite integration tests passed against `migrations/001_envelop.sql`.
- Live Supabase apply and physical BLE acceptance remain unverified in this workspace.
