# Screenshot policy and catalog

Documentation screenshots must prove a specific claim without exposing private
data. The approved 2026-09-16 set is cataloged with alt text, captions, and
capture provenance in [images/infinix/README.md](images/infinix/README.md).
Optimized website derivatives are cataloged in
[website/media/screenshots/README.md](../website/media/screenshots/README.md).

## Required capture set

Use synthetic names and messages for:

- landing and name entry;
- conversation list with verified Tomato and an unread indicator;
- mobile conversation, typing state, composer, and keyboard;
- offline queued-message state;
- explicitly labeled Virtual Tomato result;
- compute request, understood program, and result;
- hardware unavailable, error, and terminal fallback states;
- desktop/browser context where it clarifies physical versus virtual execution.

Do not stage or imply a **Physical Tomato** result without a completed backend
hardware result from an identified acceptance setup.

## Privacy gate

Before keeping an image, inspect the entire frame for:

- personal notifications, real names, messages, avatars, or account IDs;
- Supabase URLs, keys, UUIDs, tokens, SQL, private package locations, or admin
  controls;
- BLE names/addresses, Wi-Fi details, status-bar identifiers, or device serials;
- keyboard suggestions, clipboard content, browser history, or unrelated tabs.

Retake rather than blur when practical. Remove image metadata before
publication and keep sanitized originals separate from optimized derivatives.

## Storage and naming

Sanitized originals and notes belong under `docs/images/infinix/`. Optimized
website derivatives belong under `website/media/screenshots/`. Use descriptive
lowercase names such as
`conversation-verified-tomato.webp`; do not include identities or dates that
reveal private activity.

For each approved asset, record:

- path and dimensions;
- capture date and platform;
- synthetic scenario;
- claim demonstrated;
- physical, virtual, or UI-only provenance;
- alt text and caption;
- metadata-stripping and privacy-review result.

## Captions and provenance

Alt text should describe the visible evidence rather than repeat decoration.
Captions must distinguish:

- queued messaging from delivered messaging;
- repository implementation from deployed availability;
- Physical/Hardware Tomato from Virtual Tomato;
- a dated physical acceptance setup from current online status.

An old image is historical evidence, not proof that hardware or a deployment is
currently online. Follow [documentation-policy.md](documentation-policy.md).
