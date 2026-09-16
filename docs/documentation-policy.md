# Envelop documentation authority

This policy defines which source wins when Envelop documentation disagrees.
Current product facts and status start at [`status.md`](status.md).

## Authority order

1. **Backend behavior and lifecycle:** `backend/migrations/001_envelop.sql`.
2. **Device framing:** `protocol/ENVELOP_PROTOCOL.md`, checked against
   `protocol/test-vectors/frames.json` and each platform codec.
3. **Platform behavior:** current source under `website/`, `apple/Sources/`,
   `android/core/`, and `android/bridge/`.
4. **Tomato-side behavior:** `software/os/envelop_lite.s`,
   `software/os/envelop_setup.s`, and `software/os/remote_exec.s` in the Tomato
   repository.
5. **Canonical current prose:** `docs/status.md`, then `SPEC.md` and focused
   subsystem guides after they have been reconciled with sources 1–4.
6. **Narrative surfaces:** root README and marketing pages.
7. **Historical records:** `log/` and removed platform/package references.

Tests prove only their named contract. Shared framing vectors prove codec
agreement, not a live radio session. Backend source proves schema behavior, not
the revision deployed to a hosted project. A package script proves that an
artifact can be produced, not that it is public or supported.

## Claim rules

- Use the canonical path and vocabulary from `docs/status.md`.
- Keep human presence, Tomato bridge lease, message delivery, and human read
  state separate.
- Treat the exact `ENVELOP/1` response as protocol identity verification; do
  not broaden it into an unsupported security claim.
- Preserve the distinction between queued hardware messaging, durable hardware
  compute, and immediate Virtual Tomato execution.
- Never replay an ambiguous hardware job virtually. A virtual result must be
  explicit and labeled.
- Name the public browser, macOS operator/test client, and private Android app
  separately. Do not imply a current Windows or iOS native client.
- State that the sole schema is destructive wherever setup or recovery is
  documented. Include backup, owner bootstrap, and identity-loss consequences.
- Never expose project credentials, account identifiers, private package URLs,
  device identifiers, or administration controls in docs or screenshots.

## Status words

- **Implemented:** present in current source.
- **Verified:** a named reproducible test passed.
- **Hardware-accepted:** a dated physical-device sequence passed with identified
  firmware, bridge, and backend revisions.
- **Deployed:** the checked revision is confirmed at the public endpoint.
- **Online:** a current runtime observation, not a durable product status.
- **Preview:** intentionally incomplete or non-production behavior.
- **Private:** maintained for the operator but not publicly distributed.
- **Retired:** removed and unsupported; historical references may remain.

Do not substitute one status for another. In particular, implemented is not
deployed, a passing codec test is not hardware acceptance, and an old
screenshot is not current online evidence.

## Updating canonical facts

When behavior changes:

1. update the schema, protocol, or platform source that owns the behavior;
2. update shared vectors and focused tests where applicable;
3. update `docs/status.md` in the same change;
4. reconcile `SPEC.md`, subsystem guides, README, and site copy;
5. preserve `log/` as dated history, adding current/superseded context rather
   than rewriting the original record.
