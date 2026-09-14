<h1 align="center">Envelop</h1>
<p align="center"><strong>Internet text messenger — Tomato’s temporary BLE bridge.</strong></p>

<p align="center">
  <img src="https://img.shields.io/badge/status-active%20development-2ea043?style=flat-square" alt="Status: Active Development" />
  <img src="https://img.shields.io/badge/stack-SwiftUI%20%2B%20Supabase-011F5B?style=flat-square" alt="Stack: SwiftUI + Supabase" />
  <img src="https://img.shields.io/badge/bridge-nRF8001%20BLE%20UART-2563EB?style=flat-square" alt="Bridge: nRF8001 BLE UART" />
  <a href="https://github.com/tmarhguy/tomato"><img src="https://img.shields.io/badge/contact-Tomato-990000?style=flat-square" alt="Contact: Tomato" /></a>
  <img src="https://img.shields.io/badge/clients-Apple%20·%20Android%20·%20Windows-41694b?style=flat-square" alt="Clients: Apple, Android, Windows" />
</p>

<p align="center"><em>By Tyrone Marhguy · Computer Engineering ’28</em></p>

People message each other over the Internet. [Tomato](https://github.com/tmarhguy/tomato) — a 32-bit computer built in a dorm — joins as a hardware contact through one nearby Envelop client that holds a temporary BLE lease. Same story as [FramePort](https://github.com/tmarhguy/frameport) bringing Tomato’s HDMI into the editor: put the odd machine on the network without inventing a second product.

This README is the map. [SPEC.md](SPEC.md) is the architecture. [docs/integration.md](docs/integration.md) is the delta between the two.

<table align="center">
  <tr>
    <td align="center" width="50%"><img src="media/screenshots/website-hero.png" alt="Envelop marketing site hero with Tomato postcard" /></td>
    <td align="center" width="50%"><img src="media/screenshots/website-downloads.png" alt="Envelop downloads by platform" /></td>
  </tr>
  <tr>
    <td align="center"><em>Hero postcard: Tomato is a verified contact on the same network.</em></td>
    <td align="center"><em>Downloads by platform — Mac first; other clients as they ship.</em></td>
  </tr>
</table>

## Why

Tomato already boots an OS and talks over nRF8001 UART. The messenger is **Envelop** — named for envelopes that carried messages across distance, local BLE text to a phone first, first line for home. The same name now covers the Internet layer: anonymous identities for humans, durable DMs, Tomato pinned and verified at the top, and a leased bridge so one nearby client can forward queue traffic until the lease expires or disconnects.

## What works / still open

| Area | Status |
| --- | --- |
| Apple SwiftUI client (anon auth, DMs, poll, Tomato lease UI) | Working |
| Supabase schema, RPCs, RLS, PGlite suite | Working (`backend/migrations/001_envelop.sql`) |
| ENVELOP/1 Swift + portable C codecs + shared vectors | Working |
| Apple BLE bridge handshake / queue forward / ACK | Implemented; needs matching Tomato firmware |
| Android Compose + Windows WPF cloud clients | Working (no BLE bridge yet) |
| Marketing site + Mac zip | Working |
| Physical Tomato firmware UI, Realtime, history paging | Outstanding |
| Acceptance A–E on live hardware | Outstanding |

## Architecture at a glance

| Layer | Role |
| --- | --- |
| `apple/` | Primary client + BLE bridge |
| `android/`, `windows/` | Cloud clients |
| `backend/` | Supabase SQL + PGlite tests + smoke script |
| `protocol/`, `tomato/protocol/` | Binary ENVELOP/1 docs and C codec |
| `website/` | Install / download surface |

Composer policy: **Enter sends** on desktop (Shift+Enter for a newline). Mobile keeps a visible **Send** button and an IME Send action.

## Run checks

```sh
swift test --package-path apple
python3 protocol/test-vectors/verify_c.py
node backend/tests.mjs
```

In restricted environments, redirect compiler caches:

```sh
CLANG_MODULE_CACHE_PATH=/tmp/envelop-clang-cache \
SWIFTPM_MODULECACHE_OVERRIDE=/tmp/envelop-swift-cache \
swift test --package-path apple --disable-sandbox
```

Backend setup and bridge grants: [backend/README.md](backend/README.md). Apple packaging: [apple/README.md](apple/README.md) (`apple/package-app.sh` rebuilds `Envelop.app`; `swift test` does not).

Copy `.env.example` → `.env` for live smoke (`backend/smoke-live.sh`). Never commit secrets or service-role keys.

## Repository map

```text
SPEC.md                 frozen target architecture
docs/integration.md     deliberate differences + acceptance tracking
apple/                  SwiftPM app, BLE, codecs, tests
android/                Kotlin Compose client
windows/Envelop/        .NET 8 WPF client
backend/migrations/     001_envelop.sql
protocol/               ENVELOP/1 + BLE contracts + vectors
tomato/protocol/        portable C codec for firmware bring-up
website/                install / download site
media/screenshots/      README plates
```

## Status

This is not a completed Envelop 1.0 release. No live public network, store builds, or physical BLE success is claimed here. The checks above are the truth for this workspace.

## Author

**Tyrone Marhguy** — Computer Engineering '28, [University of Pennsylvania](https://www.upenn.edu/)

[![Email](https://img.shields.io/badge/Email-tmarhguy@gmail.com-D14836?logo=gmail&logoColor=white)](mailto:tmarhguy@gmail.com)
[![Edu Email](https://img.shields.io/badge/Email-tmarhguy@engineering.upenn.edu-011F5B)](mailto:tmarhguy@engineering.upenn.edu)
[![GitHub](https://img.shields.io/badge/GitHub-@tmarhguy-181717?logo=github&logoColor=white)](https://github.com/tmarhguy)
[![Paper](https://img.shields.io/badge/Paper-tomato.tmarhguy.com-2ea043)](https://tomato.tmarhguy.com/)
[![Twitter](https://img.shields.io/badge/Twitter-@marhguy__tyrone-1DA1F2?logo=twitter&logoColor=white)](https://twitter.com/marhguy_tyrone)
[![Instagram](https://img.shields.io/badge/Instagram-@tmarhguy-E4405F?logo=instagram&logoColor=white)](https://instagram.com/tmarhguy)
[![Substack](https://img.shields.io/badge/Substack-@tmarhguy-FF6719?logo=substack&logoColor=white)](https://substack.com/@tmarhguy)
