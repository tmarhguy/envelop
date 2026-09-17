# Infinix documentation capture originals

These PNG files are sanitized documentation originals captured on 2026-09-16
and 2026-09-17
from the current local Envelop website working tree. Mobile captures came from
Chrome 150 on the connected Infinix X6831; earlier captures used 1080 × 2460
output and the latest responsive checks used 450 × 1000. ADB connection
details are intentionally omitted. Most published captures remove the status
and navigation strips. The 450 × 1000 responsive-layout checks retain them and
the loopback address bar as physical-device evidence; the bars contain no
notification text, carrier name, or unrelated app content.

Chat states were staged in the page's existing DOM and renderer with synthetic
`Guest` and `Tomato` records. Polling was stopped before staging. No Supabase
account, profile, conversation, message, compute job, bridge lease, or other
durable data was created for those staged captures. The deterministic-followup
capture used a temporary test profile that was deleted after the test; the
source-backed question and both answer cards remained browser-local and created
no message or compute job. Times shown in staged chat are fixed synthetic
timestamps. These captures prove UI behavior only; they do not prove deployment
or physical hardware availability.

All originals were decoded and re-encoded as RGB PNGs with Pillow, which removed
source metadata. Published WebP derivatives are cataloged in
`../../../website/media/screenshots/README.md`.

## Approved originals

- `envelop-landing-infinix.png` — 1080 × 2207. Alt: “Envelop landing page in
  Chrome on an Infinix phone, with the Open web chat action and message field.”
  Caption: “Envelop responsive landing page · real Infinix browser · local
  working tree.” Provenance: UI-only.
- `envelop-name-entry-infinix.png` — 1080 × 2207. Alt: “Envelop web chat name
  entry on an Infinix phone.” Caption: “Name entry before any chat session is
  created.” Provenance: UI-only; empty local browser storage.
- `envelop-conversation-list-unread-infinix.png` — 1080 × 2207. Alt: “Synthetic
  Guest conversation list with verified Tomato and an unread indicator.”
  Caption: “Verified Tomato stays pinned with a visible unread state.”
  Provenance: deterministic synthetic DOM state.
- `envelop-offline-queue-infinix.png` — 1080 × 2207. Alt: “Synthetic mobile
  conversation with Tomato marked offline and a queued-message notice.”
  Caption: “Hardware offline · notes queue for a later verified bridge.”
  Provenance: deterministic synthetic DOM state; no message was sent.
- `envelop-typing-infinix.png` — 1080 × 2207. Alt: “Synthetic Tomato
  conversation showing animated typing dots.” Caption: “Typing feedback in the
  mobile thread.” Provenance: deterministic synthetic DOM state.
- `envelop-composer-gboard-infinix.png` — 1080 × 2360. Alt: “Envelop mobile
  composer above Gboard on an Infinix phone, with an empty suggestion-free
  message field.” Caption: “Real Infinix viewport with Gboard open; the composer
  remains reachable.” Provenance: deterministic synthetic thread plus the
  installed Gboard keyboard. No suggestion words or clipboard content appear.
- `envelop-virtual-result-infinix.png` — 1080 × 2207. Alt: “Synthetic Envelop
  chat preview labeled Virtual Tomato with a virtual reply.” Caption: “Virtual
  Tomato preview · browser execution · never queued for hardware.” Provenance:
  deterministic synthetic completed-result rendering.
- `envelop-compute-result-infinix.png` — 1080 × 2207. Alt: “Envelop compute card
  showing the request, understood expression, Virtual Tomato label, and result
  12.” Caption: “A supported expression, its interpretation, and an explicitly
  virtual result.” Provenance: deterministic synthetic completed-result
  rendering; not a fresh execution claim.
- `envelop-terminal-fallback-infinix.png` — 1080 × 2207. Alt: “Envelop compute
  card showing a terminal hardware failure and a separate Run in Virtual Tomato
  action.” Caption: “Terminal hardware outcome · no automatic replay · virtual
  execution remains a separate action.” Provenance: deterministic synthetic
  error rendering; no hardware submission occurred.
- `envelop-home-desktop.png` — 1440 × 1000. Alt: “Desktop Envelop homepage with
  the messenger promise, open-chat action, and illustrated exchange.” Caption:
  “Current local Envelop homepage at a desktop viewport.” Provenance: UI-only
  headless Chrome capture.
- `envelop-name-entry-desktop.png` — 1440 × 1000. Alt: “Desktop Envelop chat name
  entry and example prompts.” Caption: “Current local web-chat entry state at a
  desktop viewport.” Provenance: UI-only headless Chrome capture.
- `envelop-deterministic-followup-infinix.png` — 1080 × 2207. Alt: “Envelop on
  an Infinix phone showing a source-backed Tyrone Marhguy project answer reached
  through a one-click follow-up.” Caption: “Deterministic local answer · reviewed
  source link · one-click follow-up on a physical Infinix browser.” Provenance:
  physical-device UI test against the local working tree; temporary profile
  deleted after capture; no message or compute job created.
- `envelop-open-compute-infinix.png` — 450 × 1000. Alt: “Envelop’s mobile
  deterministic open-compute explanation on a physical Infinix phone.” Caption:
  “The same input branches to Envelop’s inspectable path first, then the
  generative response space.”
  Provenance: physical-device UI test against the local working tree with empty
  browser identity state.
- `envelop-mobile-hero-infinix.png` — 450 × 1000. Alt: “Envelop’s animated
  browser recording above the chat name field on a physical Infinix phone.”
  Caption: “Mobile chat entry · recording first · name field second.”
  Provenance: physical-device UI test against the local working tree with empty
  browser identity state.

## Privacy review

The full frame of every approved original was visually inspected. The set
contains no personal notifications, real participant names or messages, account
identifiers, tokens, UUIDs, backend URLs, BLE identifiers, Wi-Fi or carrier
names, admin controls, browser history, unrelated tabs, or durable public data.
The Gboard frame contains no word suggestions or clipboard content. “Guest,”
“Tomato,” “Demo contact,” and all visible messages are synthetic.
