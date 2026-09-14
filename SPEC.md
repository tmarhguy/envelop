Yes. Your clarification makes the architecture cleaner: **Bluetooth is not Envelop’s messaging network. Bluetooth is Tomato’s network adapter.** The Envelop client that wins the one available BLE connection becomes Tomato’s temporary Internet gateway.

Below is the specification I would freeze and hand to the agents. I would not let an agent add a feature that is not in this document without changing the spec first.

# Envelop 1.0 — Frozen Build Specification

## 1. The end goal

At completion, three things must work.

### Human ↔ Human

Alice opens Envelop on iPhone. Bob opens Envelop on Windows.

```text
Alice's iPhone
      │
      │ Internet
      ▼
   Envelop
      │
      ▼
Bob's Windows PC
```

They see each other in Envelop, open a conversation, send text, receive text, and see previous recent messages.

### Human ↔ Tomato

Tomato appears as a special contact:

```text
🟢 Tomato ✓
```

Alice can be anywhere with Internet access and send Tomato a message.

If Tomato is presently bridged:

```text
Alice
  │
  │ Internet
  ▼
Supabase
  │
  │ Realtime
  ▼
Envelop client beside Tomato
  │
  │ BLE
  ▼
Tomato
```

Tomato displays Alice's message.

Tomato can reply:

```text
Tomato
  │ BLE
  ▼
Bridge
  │ Internet
  ▼
Supabase
  │
  ▼
Alice
```

### Tomato offline

If nobody has connected to Tomato:

```text
🔴 Tomato ✓
   Offline
```

Alice can still send it a message.

The message remains queued centrally.

Later, someone walks up to Tomato, opens Envelop and connects over BLE:

```text
Tomato
   ⇅ BLE
Envelop on Mac
   ⇅ Internet
Envelop Network
```

Tomato becomes:

```text
🟢 Tomato ✓
```

and its queued messages arrive.

**That is Envelop 1.0.**

Everything else is subordinate to that.

---

# 2. The conceptual model

There are four concepts and agents should not conflate them:

```text
┌─────────────────────────────────────┐
│            ENVELOP NETWORK           │
│                                     │
│ Supabase                            │
│ identities / chats / messages      │
│ device queue / bridge leases        │
└────────────────┬────────────────────┘
                 │ Internet
        ┌────────┼────────┐
        │        │        │
     iPhone    Android   Windows
        │
        │ possibly BLE
        ▼
     TOMATO
```

**Envelop Network** is Internet infrastructure.

**Envelop Client** is the iOS/macOS/Android/Windows application.

**Envelop Bridge** is a *temporary role* assumed by a Envelop client that currently has the physical BLE connection to Tomato.

**Tomato** is a Envelop hardware endpoint.

There is no separately designed “Tomato Chat network.”

Tomato runs **Envelop**.

---

# 3. The crucial Bluetooth model

This is where your nRF8001 matters.

Based on the module/pinout you've been working with, this is the Adafruit-style nRF8001 BLE UART arrangement. It exposes a BLE UART-style GATT service rather than behaving like a conventional Bluetooth serial device.

The important service is:

```text
UART Service
6E400001-B5A3-F393-E0A9-E50E24DCCA9E
```

with two characteristics beneath it for bidirectional communication. Adafruit documents one as writable by the Central and the other as notification-capable in the opposite direction. ([Adafruit Learning System][1])

So **nRF Connect is currently acting as the BLE Central** for you.

Envelop must implement what nRF Connect does.

It should *not* tell users:

> Go to Settings → Bluetooth → pair Tomato.

Instead:

```text
Envelop
   ↓
Scan for BLE devices
   ↓
find candidate
   ↓
connect using GATT
   ↓
discover UART service
   ↓
verify Tomato
   ↓
subscribe to Tomato → Envelop characteristic
   ↓
enable Envelop → Tomato writes
```

The application owns the connection.

Adafruit's nRF8001 example explicitly transitions from advertising → connected → disconnected, and advertising stops once the BLE connection is established. That matches precisely the single-bridge behavior you're observing. ([Adafruit Learning System][1])

This is actually useful.

## Exactly one physical bridge

At any time:

```text
           Internet
              │
        Envelop Network
              │
       ┌──────┴──────┐
       │             │
   Alice phone    Bob phone
                     .
                     .
              Mac ← BLE → Tomato
               ▲
               │
          ACTIVE BRIDGE
```

Not:

```text
Phone 1 ─┐
Phone 2 ─┼─ BLE → Tomato     ✗
Laptop  ─┘
```

One central owns the physical Tomato connection.

That client becomes the gateway.

---

# 4. Reliable Tomato discovery

Do **not** identify Tomato merely by Bluetooth name.

Another nRF8001/Bluefruit device could expose the same UART service.

Envelop should use three stages.

### Stage A — discover

Scan BLE advertisements.

Candidates may be recognized using the advertised name/service information.

### Stage B — GATT verification

Connect and confirm:

```text
6E400001-B5A3-F393-E0A9-E50E24DCCA9E
```

exists.

### Stage C — Envelop/Tomato handshake

Send a tiny Envelop frame:

```text
HELLO
```

Tomato must answer something equivalent to:

```text
ENVELOP/1
DEVICE=TOMATO
ID=TOMATO-001
```

Only then does Envelop say:

```text
Connected to Tomato
```

and only **then** may it claim Tomato's Internet bridge lease.

Thus some random Bluefruit module won't accidentally become the world's most confused Tomato.

---

# 5. The bridge state machine

Every platform implements exactly this:

```text
IDLE
 │
 ▼
SCANNING
 │
 ▼
BLE_CONNECTED
 │
 ▼
GATT_READY
 │
 ▼
TOMATO_VERIFIED
 │
 ▼
BRIDGE_LEASE_ACQUIRED
 │
 ▼
SYNCING
 │
 ▼
ONLINE
 │
 ▼
BRIDGING
```

At any failure:

```text
BLE lost
app killed
Tomato powered down
GATT failure
Internet lost
lease lost
```

the state machine moves appropriately rather than pretending Tomato remains reachable.

The distinction between Internet loss and BLE loss matters.

For example:

```text
BLE alive
Internet lost
```

means the client still physically owns Tomato but cannot currently provide an Internet route.

Therefore the backend should mark Tomato Internet-offline until connectivity returns.

---

# 6. Bridge leasing

There are actually **two locks** protecting Tomato.

The nRF8001 provides the physical lock:

> only one central gets the BLE connection.

Supabase provides the network lock:

> only one authenticated Envelop client may advertise itself as Tomato's bridge.

The database contains approximately:

```text
device_bridge
──────────────────────────
device_id        TOMATO-001
bridge_user_id   ...
bridge_instance  ...
last_heartbeat   ...
expires_at       ...
```

When the app successfully verifies Tomato:

```text
claim_bridge(TOMATO-001)
```

The server grants a short lease.

For example:

```text
lease lifetime: 30 seconds
heartbeat:      every 10 seconds
```

Exact numbers are not sacred.

The property is:

```text
heartbeats continue → Tomato online

heartbeats stop
       ↓
lease expires
       ↓
Tomato offline
```

No manual cleanup is required if someone's phone crashes.

---

# 7. nRF8001 transport

This needs special care because the old nRF8001 UART path is not an infinite byte pipe.

Adafruit's examples use **20-byte BLE data transfers**, and Nordic's historical guidance similarly describes the nRF8001 in terms of 20-byte packets per connection event. ([Adafruit Learning System][2])

Therefore agents **must not assume one Envelop message = one BLE write**.

Instead:

```text
Envelop logical frame
       ↓
byte stream
       ↓
split into ≤20-byte BLE writes
       ↓
nRF8001
       ↓
reassemble byte stream
       ↓
Envelop frame parser
```

Likewise in reverse.

---

# 8. Envelop wire protocol

Do not make BLE itself understand contacts, chats or Supabase IDs.

Use a compact transport-independent Envelop frame.

Something like:

```text
+--------+---------+------+-------+--------+---------+
| MAGIC  | VERSION | TYPE | ROUTE | LENGTH | PAYLOAD |
+--------+---------+------+-------+--------+---------+
  2 B       1 B      1 B    2 B     2 B       N
```

Optionally append a small frame checksum if your existing Tomato byte transport benefits from resynchronization.

`MAGIC` lets the parser recover if bytes are lost.

`VERSION` begins at:

```text
1
```

Important frame types:

```text
HELLO
HELLO_ACK

CONTACT_RESET
CONTACT_UPSERT

OPEN_CHAT
CHAT_HISTORY
CHAT_MESSAGE

SEND_MESSAGE
MESSAGE_ACK

STATUS
PING
PONG
```

Do not add fifty commands.

---

# 9. Do not send Internet UUIDs to Tomato

This would be a mistake:

```text
recipient =
e38e3326-f8c6-44ca-b67d-...
```

Tomato does not care.

Every bridge session creates tiny ephemeral route IDs:

```text
1 → Alice
2 → Bob
3 → Ama
4 → David
```

Tomato sees:

```text
route = 0x0001
```

The bridge knows:

```text
0x0001
   ⇅
Alice's actual Envelop identity/thread
```

On reconnect, route IDs can be regenerated.

That saves memory and keeps Tomato delightfully ignorant of Internet infrastructure.

---

# 10. Tomato is a projection of Envelop, not a Envelop database

This is the decision that prevents Tomato from drowning.

The Internet application might know thousands of people.

Tomato does **not**.

When a bridge connects, it sends Tomato only its current working set.

For Envelop 1.0 I would make that approximately:

```text
8 recent contacts
1 currently selected chat
12–20 recent messages for that chat
```

Those exact capacities can be constants chosen after seeing Tomato's available memory.

So:

```text
Envelop cloud
────────────────────
50,000 possible users
thousands of messages
many conversations

       ↓ projection

Tomato
────────────────────
8 contacts
current chat
small message ring
```

If the user scrolls beyond those eight contacts, the bridge can page another set.

No need to preload the world.

---

# 11. Tomato UI

Your left/right instinct is exactly right.

I would freeze the basic UI as:

```text
┌──────────────────┬────────────────────────────────────┐
│ ENVELOP           │ Alice                              │
│                  │                                    │
│ ● Alice          │ Alice: hey Tomato                  │
│   Bob            │                                    │
│   Ama            │ Tomato: hello :)                   │
│   David          │                                    │
│                  │ Alice: this is insane              │
│                  │                                    │
│                  │                                    │
│                  ├────────────────────────────────────┤
│                  │ > _                                │
└──────────────────┴────────────────────────────────────┘
```

Left:

```text
avatar
display name
unread marker
selection
```

Right:

```text
selected contact
message history
composer
```

That's it.

---

# 12. Profile pictures without loading pictures

There is a very nice solution for the concern you raised.

**Do not send image files to Tomato.**

Envelop 1.0 gets perhaps:

```text
16 built-in avatars
```

Each profile stores:

```text
avatar_id = 0..15
```

The mobile applications render prettier/native versions if desired.

Tomato has 16 tiny sprite assets baked into ROM.

Therefore Alice's profile is just:

```text
name: Alice
avatar: 7
```

sent over BLE.

Not a PNG.

Not JPEG.

Not network storage.

Not image decoding.

Tomato does:

```text
avatar_rom[7]
```

Done.

This gives the application personality while costing almost nothing.

No user-uploaded profile photos in Envelop 1.0.

---

# 13. Text constraints

Because Tomato is the limiting endpoint, I would make the protocol deliberately conservative.

For v1:

```text
text only
no markdown
no media
no attachments
no URLs with previews
no reactions
```

Maximum message length:

```text
256 bytes
```

That's more than enough for actual texting and trivial to buffer.

If Tomato's current font is ASCII-only, then **Envelop 1.0's Tomato path is ASCII**.

The Internet clients can technically use UTF-8 internally, but the composer should either prevent unsupported characters when talking to Tomato or map unsupported characters predictably.

Do not spend tonight building Unicode rendering into Tomato.

---

# 14. Backend

Use **Supabase Free**.

Current Free limits include 50,000 MAU, a 500 MB database, 2 million Realtime messages, and 200 peak simultaneous Realtime connections. ([Supabase][3])

So the app-level ceiling should conservatively be:

```text
MAX_REGISTERED_ENVELOP_USERS = 50,000
```

Not because we expect 50,000 people.

Because there is zero reason to engineer beyond the free architecture.

Do not promise 50,000 simultaneous people. Free Realtime currently permits 200 simultaneous connections. ([Supabase][4])

That is completely sufficient for this project.

---

# 15. Database schema

Keep it very small.

```text
profiles
────────────────────────
id
handle
display_name
avatar_id
created_at
```

Tomato itself has a profile:

```text
display_name = Tomato
handle       = tomato
avatar_id    = TOMATO_AVATAR
is_device    = true
verified     = true
```

Then:

```text
conversations
────────────────────────
id
created_at
```

```text
conversation_members
────────────────────────
conversation_id
profile_id
```

Exactly two members are permitted in Envelop 1.0.

Then:

```text
messages
────────────────────────
id
conversation_id
sender_id
body
created_at
```

Then the device plumbing:

```text
device_queue
────────────────────────
message_id
device_id
state
created_at
forwarded_at
acked_at
```

and:

```text
device_bridges
────────────────────────
device_id
bridge_user_id
bridge_instance_id
expires_at
last_heartbeat
```

That's enough.

---

# 16. Human identity

First launch should remain embarrassingly simple.

```text
Welcome to Envelop

Name
[ Tyrone            ]

Choose an avatar
[ ● ][ ● ][ ● ][ ● ]

       Enter Envelop
```

Underneath, create an anonymous authenticated Supabase identity.

Then create the profile.

For duplicate names, generate a small stable handle:

```text
Tyrone
@tyrone-k7m2
```

Humans primarily see:

```text
Tyrone
```

The handle merely disambiguates.

No email.

No phone number.

No password.

No OAuth.

No password-reset screen.

---

# 17. Envelop contact list

There are two concepts that should look like one UI.

At the top:

```text
🟢 Tomato ✓
```

always pinned.

Below it:

```text
RECENT
Alice
Bob
Ama
```

Then optionally:

```text
PEOPLE
```

with searchable/paginated Envelop profiles.

No friend requests.

No follows.

No address-book syncing.

If Alice taps Bob, Envelop calls:

```text
get_or_create_dm(Alice, Bob)
```

and opens it.

That's the entire social model.

---

# 18. Ordinary messaging

For human-to-human messages:

```text
Alice
  ↓
INSERT message
  ↓
Postgres
  ↓
Realtime notification
  ↓
Bob
```

Postgres is truth.

Realtime is acceleration.

If Bob wasn't online:

```text
message still exists
```

When Bob returns:

```text
fetch recent messages
```

No elaborate offline message broker is necessary.

---

# 19. Messages to Tomato

Suppose Alice sends:

```text
Alice → Tomato
"hello Tomato"
```

The same normal `messages` row is inserted.

Because Tomato is a hardware recipient, a database trigger creates:

```text
device_queue
```

entry.

If Tomato has an active bridge, that bridge receives the event.

```text
device_queue
     ↓
bridge
     ↓
Envelop frame
     ↓
BLE chunks
     ↓
nRF8001
     ↓
Tomato
```

Tomato returns:

```text
MESSAGE_ACK
```

Only then does:

```text
device_queue.state = ACKED
```

If BLE dies halfway through, the message stays unacknowledged and can be resent after reconnection.

---

# 20. Tomato sending a message

Suppose Tomato currently has Alice selected.

Tomato sends:

```text
SEND_MESSAGE
route=1
payload="hello Alice"
```

Bridge maps:

```text
route 1 → conversation with Alice
```

The bridge **cannot simply insert a database row claiming to be Tomato**.

Instead it invokes a protected database function:

```text
send_as_device(
    active_bridge_lease,
    TOMATO,
    route,
    message
)
```

The database verifies:

```text
this authenticated user
currently owns
Tomato's valid bridge lease
```

Only then can it create:

```text
sender = Tomato
```

That protects the blue check.

Nobody with Envelop installed can impersonate Tomato.

---

# 21. No giant privileged secret in clients

Absolutely no:

```text
SUPABASE_SERVICE_ROLE_KEY
```

inside iOS, Android, macOS or Windows.

Clients get only the normal public client configuration.

Tomato privilege comes entirely from:

```text
authenticated user
+
active bridge lease
+
server-side authorization
```

The service key stays server-side.

---

# 22. Reconnection behavior

This is especially important because nRF8001 is old and BLE can disconnect.

While the user has explicitly connected Tomato, Envelop should automatically try to restore the physical link.

Something approximately:

```text
disconnect
   ↓
scan
0.5 s
   ↓
1 s
   ↓
2 s
   ↓
4 s
   ↓
5 s capped
```

When Tomato reappears:

```text
GATT connect
handshake
lease claim/renew
state resync
continue
```

The user shouldn't need nRF Connect anymore.

**Envelop becomes Tomato's nRF Connect.**

---

# 23. Platform implementations

Because you wanted small applications:

```text
Apple
Swift + SwiftUI + CoreBluetooth
one project
iOS + macOS targets
```

```text
Android
Kotlin + Jetpack Compose
native BLE APIs
```

```text
Windows
C# + WinUI
Windows BLE/GATT APIs
```

Do not use Electron.

Do not build four separate protocol implementations manually either.

Each repository section consumes the same published:

```text
ENVELOP_PROTOCOL.md
BLE_PROTOCOL.md
TEST_VECTORS.json
```

---

# 24. Repository

One Envelop repository:

```text
envelop/
│
├── README.md
├── SPEC.md
│
├── protocol/
│   ├── ENVELOP_PROTOCOL.md
│   ├── BLE_PROTOCOL.md
│   └── test-vectors/
│
├── backend/
│   ├── migrations/
│   ├── functions/
│   ├── policies/
│   └── seed/
│
├── apple/
│   └── Envelop/
│
├── android/
│   └── Envelop/
│
├── windows/
│   └── Envelop/
│
├── tomato/
│   ├── protocol/
│   ├── envelop-app/
│   └── assets/
│
└── docs/
    ├── architecture.md
    └── integration.md
```

The actual Tomato repository can later consume or mirror `tomato/`; the important point is ownership is explicit.

---

# 25. Agent division

This is how I would use lots of coding agents without letting them create lots of chaos.

### Agent 0 — Specification owner

**Runs first.**

Produces:

```text
SPEC.md
ENVELOP_PROTOCOL.md
BLE_PROTOCOL.md
database contract
test vectors
```

Nobody else changes protocol definitions.

After this merges, protocol is frozen.

### Agent 1 — Supabase/backend

Owns only:

```text
backend/
```

Implements authentication, profiles, conversations, messages, RLS, device queue, bridge leases and device-send authorization.

Seeds:

```text
Tomato ✓
```

### Agent 2 — Apple Internet client

Builds:

```text
auth
onboarding
contact list
conversation UI
send/receive
```

No Bluetooth initially.

### Agent 3 — Apple BLE/bridge

Owns:

```text
CoreBluetooth
scan
connect
UART discovery
Tomato handshake
chunked transport
bridge state machine
```

Then plugs it into Agent 2.

### Agent 4 — Tomato Envelop application

Builds:

```text
left/right UI
contact cache
message ring buffers
composer
route handling
```

using a mocked byte stream first.

### Agent 5 — Tomato BLE integration

Connects the **already-working nRF8001 byte path** to the Envelop frame parser.

This agent is specifically forbidden from redesigning the Bluetooth hardware interface.

### Agent 6 — Android

Implements the frozen Envelop behaviors and BLE bridge using native Android APIs.

### Agent 7 — Windows

Same for Windows.

### Agent 8 — QA/integration

Consumes all test vectors and builds integration tests around:

```text
human → human
human → offline Tomato
bridge attach
queue flush
Tomato → human
bridge loss
bridge replacement
```

This agent owns bugs spanning components; it does not invent features.

---

# 26. Integration order

Even though agents work in parallel, **merge in this order**:

```text
1. Protocol/spec
2. Backend
3. Apple Internet messaging
4. Tomato protocol parser/UI
5. Apple ↔ nRF8001
6. Full Internet ↔ Tomato
7. macOS target
8. Android
9. Windows
10. cleanup/demo
```

Why Apple first?

Because you already have the iPhone and were already developing there. It becomes the **golden/reference Envelop client**.

Once this works:

```text
iPhone → Internet → Mac bridge → Tomato
```

the architecture is proven.

Android and Windows are ports of a frozen protocol, not architecture experiments.

---

# 27. The test that determines whether Envelop is finished

This is the test I would literally place at the top of `SPEC.md`.

### Acceptance Test A — human messaging

Two fresh installations.

```text
Alice → Bob:
"hello Bob"
```

Bob sees it.

Bob replies:

```text
"hello Alice"
```

Alice sees it.

Close Bob.

Alice sends another message.

Open Bob.

Message appears.

**PASS.**

### Acceptance Test B — Tomato offline

No device connected to Tomato.

Alice sees:

```text
🔴 Tomato ✓
```

Alice sends:

```text
Are you there?
```

Message remains queued.

**PASS.**

### Acceptance Test C — bring Tomato online

Walk to Tomato with Mac/iPhone.

Open Envelop.

Tap:

```text
Connect Tomato
```

Envelop—not nRF Connect—discovers and connects to the nRF8001.

Handshake succeeds.

Alice's remote device changes to:

```text
🟢 Tomato ✓
```

Queued:

```text
Are you there?
```

appears physically on Tomato.

**PASS.**

### Acceptance Test D — reply physically

On Tomato, select Alice.

Type:

```text
yes :)
```

Alice remotely receives:

```text
Tomato ✓
yes :)
```

**PASS.**

### Acceptance Test E — bridge handoff

Disconnect the current Envelop bridge.

Tomato eventually changes to:

```text
🔴 Offline
```

Connect another Envelop client physically to Tomato.

It claims the bridge.

Tomato becomes:

```text
🟢 Online
```

Messaging resumes.

**PASS.**

When **A–E pass, Tomato and Envelop 1.0 are finished.**

---

# 28. Hard scope wall

Put this directly in the repository because agents otherwise have a remarkable ability to become product managers.

**Envelop 1.0 explicitly does NOT contain:**

* group chats
* photos or uploaded avatars
* attachments
* videos
* voice notes
* calls
* reactions
* typing indicators
* message edits
* message deletion synchronization
* read receipts
* push notifications
* friend requests
* contact imports
* phone-number accounts
* email accounts
* OAuth
* end-to-end encryption
* web app
* channels
* feeds
* bots
* multiple Tomato BLE connections
* Wi-Fi on Tomato
* HTTP on Tomato
* Supabase code on Tomato
* arbitrary profile images on Tomato
* infinite message history

And, importantly:

> **Being capable of supporting a feature later is not a reason to implement it now.**

The extensibility comes from the architecture.

---

## The sentence every agent should understand

I would put this in huge letters near the beginning of `SPEC.md`:

> **Envelop is a lightweight Internet text messenger. Humans can message each other normally. Tomato is a first-class Envelop contact. A single Envelop client physically connected to Tomato over the nRF8001 BLE UART becomes Tomato's temporary Internet bridge, allowing anyone on Envelop to text the physical Tomato computer and receive replies from it.**

Everything we have discussed reduces to that sentence.

And the really nice part is that your hardware limitation isn't something we're working around awkwardly anymore. **The one-connection nature of the nRF8001 actually gives Envelop a wonderfully clear systems model: one physical machine, one current gateway, one Internet identity.** Adafruit's documented UART service already gives us exactly the primitives we need—GATT discovery, a writable direction, notifications in the reverse direction, and 20-byte transfers to frame above. ([Adafruit Learning System][5])

If the agents execute *this* document rather than independently deciding what “chat with Tomato” means, there should be very little architectural ambiguity left.

[1]: https://learn.adafruit.com/getting-started-with-the-nrf8001-bluefruit-le-breakout?view=all&utm_source=chatgpt.com "Introduction | Getting Started with the nRF8001 Bluefruit LE Breakout | Adafruit Learning System"
[2]: https://learn.adafruit.com/getting-started-with-the-nrf8001-bluefruit-le-breakout/nrf-uart-in-detail?utm_source=chatgpt.com "nRF UART In Detail | Getting Started with the nRF8001 Bluefruit LE Breakout | Adafruit Learning System"
[3]: https://supabase.com/docs/guides/platform/billing-on-supabase?utm_source=chatgpt.com "About billing on Supabase | Supabase Docs"
[4]: https://supabase.com/docs/guides/realtime/limits?utm_source=chatgpt.com "Realtime Limits | Supabase Docs"
[5]: https://learn.adafruit.com/introducing-the-adafruit-bluefruit-spi-breakout/uart-service?utm_source=chatgpt.com "UART Service | Introducing the Adafruit Bluefruit LE SPI Friend | Adafruit Learning System"
