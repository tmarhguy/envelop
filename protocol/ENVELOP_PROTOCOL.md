# Envelop device wire v1

This binary contract replaces the legacy 95-character LF transport **only when both ends run this protocol**. Never negotiate by guessing from a Bluetooth name. Bring-up against old LF firmware must fail verification rather than silently bridging.

All integers are unsigned big endian. Frame: magic `50 47`, version `01`, type u8, route u16, payload length u16, payload, CRC u16. CRC-16/CCITT-FALSE: polynomial 0x1021, initial 0xffff, no reflection, no final XOR; covers header including magic and payload. Payload limit 512 bytes, entire frame 522. Reject unknown types, versions, lengths and CRCs; advance one byte to search for magic. Reset partial frame on disconnect. An incomplete frame may wait until disconnect; transports should disconnect on a stalled handshake.

| Type | Value | Route | Payload |
|---|---:|---|---|
| HELLO | 1 | 0 | empty |
| HELLO_ACK | 2 | 0 | exact ASCII `ENVELOP/1\nDEVICE=TOMATO\nID=TOMATO-001` (no final LF) |
| CONTACT_RESET | 3 | 0 | empty; discard previous session routes, history and dedup tokens |
| CONTACT_UPSERT | 4 | nonzero | avatar u8 (0–15), unread u8 (0/1), 1–32 printable ASCII name bytes |
| OPEN_CHAT | 5 | nonzero | empty; device requests selected route history |
| CHAT_HISTORY | 6 | nonzero | token u32, sender u8 (0=human, 1=Tomato), 1–256 printable ASCII text bytes; one frame per historical message |
| CHAT_MESSAGE | 7 | nonzero | delivery token u32, 1–256 printable ASCII text bytes |
| SEND_MESSAGE | 8 | nonzero | outgoing token u32, 1–256 printable ASCII text bytes |
| MESSAGE_ACK | 9 | original route | original token u32 |
| STATUS | 10 | 0 | state u8: 0 offline, 1 syncing, 2 online |
| PING | 11 | 0 | opaque 0–8 bytes |
| PONG | 12 | 0 | exact PING payload |
| COMPUTE_JOB | 32 | nonzero | token u32, followed by 1–508 bytes of Tomato job data |
| COMPUTE_RESULT | 33 | original route | token u32, status u8, result u32 |

Device IDs appear only in the handshake. Cloud UUIDs never cross BLE. Routes and tokens are session-local. Route 0 is reserved. A bridge cannot reassign a route until CONTACT_RESET. Route table is bounded to eight contacts in the current bridge implementation. Tokens must not wrap. Retries reuse the same token and body. Device must deduplicate CHAT_MESSAGE tokens before appending to its ring, but ACK duplicates. The bridge ACKs SEND_MESSAGE only after the server accepts the message. An ACK confirms protocol acceptance, not a human read receipt.

Reconnect clears ephemeral routes/tokens. Delivery is at least once: if the device accepts a frame and loses connection before cloud ACK persistence, it may display the message again after resynchronization. Firmware should clear its session projection on CONTACT_RESET. Do not claim exactly-once rendering across power loss.

For compute, a bridge must first claim the durable backend job, then send
`COMPUTE_JOB`. It may complete that job only from the matching
`COMPUTE_RESULT`. A timeout, disconnect, or lost lease leaves an unknown
hardware outcome; it is not permission to rerun the job in Virtual Tomato.
Only a completed backend hardware job may be labeled Physical/Hardware Tomato.

Shared vectors: `test-vectors/frames.json`; consumed by Swift XCTest and
`python3 protocol/test-vectors/verify_c.py`. The vectors currently cover core
framing cases and do not constitute a live-radio or complete application-flow
test. C callbacks borrow payload storage for the duration of the callback only;
copy into a bounded application buffer before returning. Do not reenter
`envelop_feed` from its callback.

The codecs implement framing, not application semantics. Current macOS,
Android, backend, and Tomato OS support must be checked against their source and
[current status](../docs/status.md). In particular, codec agreement does not
prove that matching bridge, backend, and firmware revisions are deployed or
online.
