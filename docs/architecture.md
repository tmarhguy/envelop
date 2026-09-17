# Envelop architecture

Envelop surrounds Tomato with a browser client, a durable Supabase backend, one
nearby native bridge, and the compact binary `ENVELOP/1` device protocol.

[Open the generated repository graph in GitDiagram](https://gitdiagram.com/tmarhguy/envelop)
(repository access may be required), or use the maintained diagrams below to
follow the runtime contracts. The Tomato OS endpoint lives in the separate
[Tomato repository](https://github.com/tmarhguy/tomato).

## System context

```mermaid
flowchart LR
    subgraph public["Public user device"]
        person["Person"]
        web["Envelop web app"]
        virtual["Virtual Tomato<br/>browser worker"]
        person --> web
        web -.->|"offline compute or explicit preview"| virtual
    end

    subgraph cloud["Cloud boundary · Supabase"]
        auth["Anonymous auth"]
        api["PostgREST RPC + RLS"]
        records[("Profiles · conversations<br/>messages · presence")]
        work[("Device queue<br/>compute jobs")]
        lease[("30-second bridge lease")]
        auth --> api
        api --> records
        api --> work
        api --> lease
    end

    subgraph nearby["Physically near Tomato"]
        bridge["One verified bridge<br/>macOS 14 or private Android"]
        radio["nRF8001<br/>Nordic UART"]
        bridge <-->|"binary ENVELOP/1"| radio
    end

    subgraph tomato["Tomato computer"]
        app["Envelop in Tomato OS"]
        cpu["Tomato CPU"]
        app <--> cpu
    end

    web <-->|"HTTPS"| api
    bridge <-->|"authenticated HTTPS"| api
    radio <-->|"BLE UART"| app
```

The browser and backend never talk directly to the FPGA. Virtual Tomato is a
separate browser execution path, not a bridge and not a substitute result for
an ambiguous hardware operation.

## Repository ownership

```mermaid
flowchart TD
    root["envelop/"]
    root --> website["website/<br/>public chat, UI, Virtual Tomato"]
    root --> backend["backend/<br/>schema, RLS, queues, leases, jobs"]
    root --> apple["apple/<br/>macOS chat + operator bridge"]
    root --> androidCore["android/core/<br/>cloud API, protocol, compiler"]
    root --> androidBridge["android/bridge/<br/>private owner UI + BLE bridge"]
    root --> protocol["protocol/<br/>wire contract + shared vectors"]
    root --> docs["docs/<br/>current architecture, operations, status"]
    root --> tests["tools/ + platform tests<br/>contract verification"]

    external["tmarhguy/tomato"]
    external --> tomatoOS["Tomato OS Envelop endpoint<br/>and CPU execution"]
    protocol -.->|"shared framing contract"| tomatoOS
```

The [documentation authority](documentation-policy.md) defines which source
wins when prose and implementation disagree. Dated files under `log/` explain
the project's evolution but are not current architecture.

## Bridge verification and lease

The physical radio and cloud lease solve different exclusivity problems: the
nRF8001 accepts one BLE connection, while the backend fences cloud operations
to one authenticated bridge instance.

```mermaid
sequenceDiagram
    participant B as Native bridge
    participant R as nRF8001 UART
    participant T as Envelop in Tomato OS
    participant C as Supabase backend

    B->>R: Connect and subscribe
    B->>T: HELLO
    T-->>B: HELLO_ACK with exact ENVELOP/1 identity
    Note over B: Protocol identity verified<br/>not cryptographic attestation
    B->>C: claim_bridge(device, fresh instance UUID)
    C-->>B: 30-second authenticated lease
    B->>T: CONTACT_RESET

    loop While BLE and cloud are healthy
        B->>C: Renew same bridge instance
        B->>C: Poll queued messages and jobs
        B->>T: STATUS online
    end

    break Disconnect, lease loss, or reconnect
        B->>C: release_bridge when possible
        Note over B: Clear parser, routes, tokens,<br/>writes, nonces, and waiters
    end
```

A bridge account must already be operator-provisioned. Clients contain only the
Supabase HTTPS URL and public publishable/anonymous key; authorization comes
from backend grants, never from a bundled service-role key. The backend cannot
observe the BLE handshake itself; it trusts granted bridge software to verify
`ENVELOP/1` before requesting the lease.

## Human-to-Tomato delivery

```mermaid
sequenceDiagram
    actor H as Person
    participant W as Web app
    participant C as Supabase backend
    participant B as Active leased bridge
    participant T as Tomato OS

    H->>W: Send printable ASCII text
    W->>C: send_message(conversation, body, nonce)
    C->>C: Store message and create queued device row
    C-->>W: Durable message record
    B->>C: bridge_pending(device, instance)
    C-->>B: Queued message + cloud UUIDs
    B->>B: Assign session-local route and delivery token
    B->>T: CONTACT_UPSERT then CHAT_MESSAGE
    T->>T: Deduplicate token and accept/display
    T-->>B: MESSAGE_ACK(route, token)
    B->>C: ack_device_message(device, instance, message)
    C->>C: Mark queue row acked
```

Retries retain the same delivery token. If Tomato accepts a frame but the link
fails before the cloud acknowledgement is recorded, the message can be shown
again after resynchronization. Delivery is therefore **at least once** across
reconnect and power-loss boundaries; exactly-once display is not claimed.

Cloud UUIDs stop at the bridge. Only bounded routes, delivery tokens, and
printable ASCII text cross BLE.

The wire protocol also reserves `OPEN_CHAT` and `CHAT_HISTORY`, but current
native bridge handlers do not implement device-driven history synchronization.
The delivery sequence above describes queued live messages, not that unfinished
history path.

## Tomato-to-human delivery

```mermaid
sequenceDiagram
    participant T as Tomato OS
    participant B as Active leased bridge
    participant C as Supabase backend
    participant W as Web app

    T->>B: SEND_MESSAGE(route, outgoing token, text)
    B->>B: Resolve route and retain stable nonce
    B->>C: send_as_device(conversation, body, nonce)
    C->>C: Idempotently store Tomato message
    C-->>B: Accepted message record
    B-->>T: MESSAGE_ACK(route, outgoing token)
    W->>C: Poll conversation
    C-->>W: Stored Tomato reply
```

The bridge acknowledges Tomato only after `send_as_device` succeeds. In either
direction, `MESSAGE_ACK` means protocol/backend acceptance—not that a person
read the message.

## Compute provenance

```mermaid
flowchart LR
    input["Person enters a supported expression"] --> compile["Browser compiles<br/>canonical Tomato bytecode"]
    compile --> choice{"Chosen execution path"}

    choice -->|"hardware request"| enqueue["Create durable compute job"]
    enqueue --> claim["Leased bridge claims job"]
    claim --> frame["COMPUTE_JOB"]
    frame --> cpu["Tomato CPU executes"]
    cpu --> result["COMPUTE_RESULT"]
    result --> complete["Backend marks job completed"]
    complete --> physical["Label: Physical Tomato"]

    choice -->|"offline compute or explicit preview"| worker["Browser worker executes<br/>Virtual Tomato"]
    worker --> virtual["Label: Virtual Tomato"]

    claim -.->|"timeout, disconnect,<br/>lost or ambiguous response"| unknown["Unknown hardware outcome"]
    unknown --> stop["Do not replay virtually"]
    enqueue -.->|"cancelled before claim"| terminal["Confirmed terminal non-result"]
    claim -.->|"confirmed failure without a result"| terminal
    terminal -.->|"separate user action"| worker
```

Only a completed backend hardware job can be labeled **Physical Tomato** or
**Hardware Tomato**. A queued or claimed job can outlive a browser request. If
its outcome becomes ambiguous, Envelop must not invent a result or replay it in
Virtual Tomato. Virtual execution remains visibly labeled and never enters the
hardware queue. Offline compute can select the virtual path immediately;
following a hardware attempt requires a separately chosen fallback and a
confirmed terminal non-result.

## Backend data model

```mermaid
erDiagram
    PROFILES ||--o{ CONVERSATIONS : "participates in"
    PROFILES ||--o{ MESSAGES : sends
    CONVERSATIONS ||--o{ MESSAGES : contains
    MESSAGES ||--o| DEVICE_QUEUE : "queues for device"
    PROFILES ||--o| DEVICE_BRIDGES : "device has lease"
    PROFILES ||--o| PRESENCE : heartbeats
    PROFILES ||--o{ COMPUTE_JOBS : requests
    CONVERSATIONS ||--o{ COMPUTE_JOBS : scopes
    PROFILES ||--o{ BRIDGE_GRANTS : authorizes
    PROFILES ||--o| ADMINS : designates
    PROFILES ||--o| TRUSTED_BRIDGE_USERS : "may be trusted"

    PROFILES {
        uuid id PK
        text handle UK
        text display_name
        boolean is_device
        boolean verified
        boolean pinned
    }
    CONVERSATIONS {
        uuid id PK
        uuid participant_a FK
        uuid participant_b FK
    }
    MESSAGES {
        uuid id PK
        uuid conversation_id FK
        uuid sender_id FK
        uuid client_nonce UK
        text body
    }
    DEVICE_QUEUE {
        uuid message_id PK
        uuid device_id FK
        text state
        timestamptz acked_at
    }
    DEVICE_BRIDGES {
        uuid device_id PK
        uuid bridge_user_id FK
        uuid bridge_instance_id
        timestamptz expires_at
    }
    PRESENCE {
        uuid user_id PK
        timestamptz last_seen
    }
    COMPUTE_JOBS {
        uuid id PK
        uuid device_id FK
        uuid conversation_id FK
        uuid requester FK
        text status
        text job_hex
        text result_text
    }
    BRIDGE_GRANTS {
        uuid device_id PK
        uuid user_id PK
    }
    ADMINS {
        uuid user_id PK
    }
    TRUSTED_BRIDGE_USERS {
        uuid user_id PK
        uuid trusted_by
    }
```

`profiles`, conversations, messages, queue state, leases, presence, and compute
jobs are public-schema objects protected by RLS and RPC contracts. Bridge
grants, administrators, trusted bridge users, and reserved names live in the
private schema.

The sole schema file, `backend/migrations/001_envelop.sql`, drops and recreates
both schemas. It is a destructive reset, not an incremental migration; follow
the [deployment and recovery runbook](backend-deployment-recovery.md).

## State boundaries

```mermaid
flowchart TD
    heartbeat["Human presence heartbeat"] --> humanOnline["Human online"]
    lease["Unexpired authenticated bridge lease<br/>after ENVELOP/1 verification"] --> hardwareOnline["Hardware online"]
    ack["Tomato ACK + cloud queue update"] --> delivered["Message delivered"]
    noReceipt["No separate read receipt<br/>in the current contract"] --> noInference["Do not infer message read"]

    humanOnline ~~~ hardwareOnline
    hardwareOnline ~~~ delivered
    delivered ~~~ noInference
```

These states are independent. In particular, a human heartbeat is not a bridge
lease, delivery is not read state, and checked-in source is not proof that
hardware is online.

## Evidence boundary

Shared vectors establish codec agreement. Local backend tests establish schema
contracts. Native tests establish source behavior. Tomato simulations establish
device behavior under their test setup. None alone proves that the hosted
backend, nearby bridge, and programmed FPGA are online with matching revisions.

Use [current status](status.md) for present-tense claims, [bridge
operations](bridge-operations.md) for acceptance procedures, and the [device
protocol](../protocol/ENVELOP_PROTOCOL.md) for exact frame fields and limits.
