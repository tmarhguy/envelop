# Envelop canonical facts and status

Last verified from repository sources: 2026-09-16.

This file is the current factual backbone for Envelop documentation. It records
what the repositories implement and what still needs deployment or live
hardware evidence.

## Product and platform boundary

- Envelop is the messaging system around Tomato. The browser is the general
  public client.
- Tomato is a pinned, verified device contact, not a human account.
- The macOS 14 application is an operator bridge and test chat client.
- The private Android 0.2.0 application combines owner chat, administration,
  compute framing, and a foreground Tomato bridge. It is not a public download.
- Envelop inside Tomato OS is maintained in the Tomato repository. The web,
  backend, native bridge apps, and shared device protocol are maintained here.

## Canonical path

`person → Envelop web app → backend queue → nearby verified bridge → Envelop in Tomato OS → Tomato CPU → labeled reply`

The nearby bridge may be the macOS operator app or the private Android app.
Tomato has one current radio connection, while the backend independently
permits one unexpired authenticated bridge lease at a time.

## Messaging semantics

- Human-to-Tomato messages are durable backend records. They remain queued
  until Tomato returns `MESSAGE_ACK` and the active bridge records that
  acknowledgement.
- Retries keep the same delivery token. Rendering is at least once across
  reconnect/power-loss boundaries; exactly-once display is not claimed.
- Tomato-to-human messages receive a stable nonce for retries. Tomato is
  acknowledged only after `send_as_device` succeeds.
- A message acknowledgement means protocol/backend acceptance, not a human read
  receipt.
- A disconnect clears session-local routes, tokens, pending writes, and partial
  frames. A reconnect creates a new bridge instance and starts with
  `CONTACT_RESET`.
- Device text is printable ASCII, 1–256 bytes. Cloud UUIDs never cross the
  device link; routes and delivery tokens are session-local.

## Identity and presence vocabulary

- **Verified Tomato** means the bridge received the exact binary
  `ENVELOP/1` Tomato identity after sending `HELLO`. This is a protocol identity
  check, not a general cryptographic-attestation claim.
- **Hardware online** means an unexpired authenticated bridge lease exists
  after that identity check. A checked-in bridge implementation is not evidence
  that hardware is currently online.
- **Human online** is presence heartbeat state and is separate from the Tomato
  bridge lease.
- **Delivered** means the end-to-end acknowledgement above; use **read** only
  if a separate read-receipt feature exists.

## Compute and virtual boundary

- The backend schema, macOS bridge, private Android bridge, protocol codecs,
  and Tomato OS firmware contain the durable hardware-compute path.
- Hardware jobs use `COMPUTE_JOB` and `COMPUTE_RESULT`. A timeout or an
  ambiguous claimed job is an unknown hardware outcome, not permission to
  replay virtually.
- A completed hardware job may be labeled **Physical Tomato** or **Hardware
  Tomato**. That label requires the completed backend hardware result.
- Browser fallback runs in **Virtual Tomato**, is visibly labeled, is not sent
  to hardware, and is never queued for later physical execution.
- Current source implementation and local tests do not by themselves prove
  that the production backend schema, nearby bridge, and programmed FPGA all
  run matching revisions.
- `OPEN_CHAT` and `CHAT_HISTORY` exist in the wire contract, but current native
  bridge handlers do not yet provide device-driven history synchronization.

## Backend lifecycle

- `backend/migrations/001_envelop.sql` is the sole current schema.
- Applying it drops and recreates the Envelop schemas and deletes existing
  profiles, conversations, messages, queues, jobs, leases, grants, and related
  state. It is a destructive reset, not an incremental migration.
- Owner bootstrap is dashboard-only through
  `envelop_private.bootstrap_owner(uuid)`. It promotes an existing anonymous
  human profile, provisions that profile as the sole admin and trusted Tomato
  bridge, and is not callable through the anonymous public API.
- If the private Android owner's local identity is lost, the documented
  recovery is a clean schema reset followed by owner bootstrap. Back up any
  data that must survive before applying the schema.
- Clients receive only the project HTTPS URL and public publishable/anonymous
  key. Secret or service-role keys must not ship in clients.

## Current status boundary

| Area | Canonical status |
|---|---|
| Web chat | Implemented in repository source; public deployment revision must be checked separately. |
| Virtual fallback | Implemented and unit-tested in the browser. Offline compute can run virtually immediately; fallback after a hardware attempt requires a separate action and a confirmed terminal non-result. Ambiguous hardware work is never replayed automatically. |
| Backend | One destructive schema plus local contract regression tests; hosted migration state is not established by this file. |
| macOS | Source-supported operator/test client on macOS 14, package version 0.2.0. |
| Android | Private source-supported bridge app, package version 0.2.0; no public artifact claim. |
| Device protocol | Binary version 1 with shared vectors; codec conformance does not prove a live radio session. |
| Tomato OS endpoint | Implemented in Tomato assembly and local simulation tests; currently programmed hardware needs live evidence. |
| Physical messaging/compute | Implemented end to end in current source; availability and matching deployed revisions require a live acceptance check. |

## Unknowns requiring later-phase evidence

- Which exact website and backend revisions are currently deployed.
- Whether a nearby bridge and programmed FPGA are currently online with
  matching protocol/firmware.
- Whether the latest private Android source has completed the documented
  physical-device acceptance sequence.
- Whether production backup and owner-recovery procedures have been rehearsed
  against a disposable project.

Public copy must not convert any of those unknowns into “live,” “available,” or
hardware-demonstrated claims without fresh evidence.
